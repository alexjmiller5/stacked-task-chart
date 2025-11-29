import os
import json
import requests
import subprocess
import logging
from flask import Flask, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# --- Configuration ---
DATABASE_ID = "396848733b4e405982a4045545e49324"
NOTION_API_VERSION = "2022-06-28"
CACHE_FILE = "notion-cache.json"

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s"
)

def get_op_secret():
    """Fetches the Notion API key using 1Password CLI."""
    try:
        cmd = [
            "op", "item", "get", 
            "Stacked Task Chart Notion Internal Integration Secret", 
            "--fields", "credential", 
            "--reveal"
        ]
        # Run command, capture stdout, raise error on non-zero exit code
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        return result.stdout.strip()
    except subprocess.CalledProcessError as e:
        logging.error(f"1Password CLI Error (Exit Code {e.returncode}): {e.stderr}")
        return None
    except FileNotFoundError:
        logging.error("1Password CLI ('op') not found in PATH.")
        return None
    except Exception as e:
        logging.error(f"Unexpected error fetching secret: {e}")
        return None

# Attempt to fetch key at startup
NOTION_API_KEY = get_op_secret()

@app.route("/api/cached-data", methods=["GET"])
def get_cached_data():
    """Immediately returns data from the JSON cache file if it exists."""
    try:
        with open(CACHE_FILE, "r") as f:
            data = json.load(f)
        return jsonify(data)
    except (FileNotFoundError, json.JSONDecodeError):
        return jsonify([])

@app.route("/api/refresh-data", methods=["GET"])
def refresh_data():
    """Fetches fresh data from Notion, saves it to the cache, and returns it."""
    global NOTION_API_KEY
    logging.info("refresh_data endpoint called.")

    # Retry fetching secret if it failed at startup
    if not NOTION_API_KEY:
        logging.info("Attempting to fetch API key from 1Password again...")
        NOTION_API_KEY = get_op_secret()

    if not NOTION_API_KEY:
        return jsonify({"error": "Failed to retrieve Notion API Key from 1Password CLI."}), 500

    headers = {
        "Authorization": f"Bearer {NOTION_API_KEY}",
        "Content-Type": "application/json",
        "Notion-Version": NOTION_API_VERSION,
    }

    all_pages = []
    has_more = True
    start_cursor = None
    notion_api_url = f"https://api.notion.com/v1/databases/{DATABASE_ID}/query"
    page_count = 0

    while has_more:
        payload = {}
        if start_cursor:
            payload["start_cursor"] = start_cursor
        
        try:
            logging.info(f"Fetching page {page_count + 1}...")
            response = requests.post(notion_api_url, headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()
            
            results = data.get("results", [])
            all_pages.extend(results)
            logging.info(f"Received {len(results)} results in batch.")
            
            has_more = data.get("has_more", False)
            start_cursor = data.get("next_cursor")
            page_count += 1
        except requests.exceptions.RequestException as e:
            logging.error(f"Error during Notion API request: {e}")
            return jsonify({"error": str(e)}), 500

    try:
        with open(CACHE_FILE, "w") as f:
            json.dump(all_pages, f)
        logging.info(f"Saved {len(all_pages)} pages to cache file.")
    except Exception as cache_err:
        logging.error(f"Failed to write cache file: {cache_err}")
    
    return jsonify(all_pages)

if __name__ == "__main__":
    app.run(debug=True, port=5000)