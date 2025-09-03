import os
import json
import requests
from flask import Flask, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import logging

load_dotenv(".env.local")
app = Flask(__name__)
CORS(app)

NOTION_API_KEY = os.getenv("NOTION_API_KEY")
DATABASE_ID = os.getenv("TASKS_DATABASE_ID")  # Add your Database ID to your .env file
NOTION_API_VERSION = "2022-06-28"
CACHE_FILE = "notion-cache.json"

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s"
)


@app.route("/api/cached-data", methods=["GET"])
def get_cached_data():
    """Immediately returns data from the JSON cache file if it exists."""
    try:
        with open(CACHE_FILE, "r") as f:
            data = json.load(f)
        return jsonify(data)
    except (FileNotFoundError, json.JSONDecodeError):
        # Return an empty list if no cache exists or it's invalid
        return jsonify([])


@app.route("/api/refresh-data", methods=["GET"])
def refresh_data():
    """Fetches fresh data from Notion, saves it to the cache, and returns it."""
    logging.info("refresh_data endpoint called.")
    if not NOTION_API_KEY or not DATABASE_ID:
        logging.error("Notion API key or Database ID is not configured.")
        return (
            jsonify({"error": "Notion API key or Database ID is not configured."}),
            500,
        )

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
        logging.info(
            f"Requesting Notion API page {page_count+1} with payload: {payload}"
        )

        try:
            response = requests.post(notion_api_url, headers=headers, json=payload)
            logging.info(f"Notion API response status: {response.status_code}")
            response.raise_for_status()
            data = response.json()
            batch_count = len(data.get("results", []))
            logging.info(f"Received {batch_count} results in this batch.")
            all_pages.extend(data.get("results", []))
            has_more = data.get("has_more", False)
            start_cursor = data.get("next_cursor")
            logging.debug(
                f"Pagination - has_more: {has_more}, next_cursor: {start_cursor}"
            )
            page_count += 1
        except requests.exceptions.RequestException as e:
            logging.error(f"Error during Notion API request: {e}")
            return jsonify({"error": str(e)}), 500
        except Exception as ex:
            logging.error(f"Unexpected error: {ex}")
            return jsonify({"error": str(ex)}), 500

    try:
        with open(CACHE_FILE, "w") as f:
            json.dump(all_pages, f)
        logging.info(f"Saved {len(all_pages)} pages to cache file: {CACHE_FILE}")
    except Exception as cache_err:
        logging.error(f"Failed to write cache file: {cache_err}")
        return jsonify({"error": f"Failed to write cache file: {cache_err}"}), 500

    logging.info(f"Returning {len(all_pages)} pages to client.")
    return jsonify(all_pages)


if __name__ == "__main__":
    app.run(debug=True, port=5000)
