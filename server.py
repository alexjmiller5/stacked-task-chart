import os
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv(".env.local")

app = Flask(__name__)
# Enable CORS to allow your frontend to make requests
CORS(app)

NOTION_API_KEY = os.getenv("NOTION_API_KEY")
TASKS_DATABASE_ID = os.getenv("TASKS_DATABASE_ID")
NOTION_API_VERSION = "2022-06-28"


@app.route("/api/query", methods=["POST"])
def query_database():
    """
    Acts as a proxy to the Notion API's database query endpoint.
    """
    if not NOTION_API_KEY:
        return (
            jsonify({"error": "Notion API key is not configured on the server."}),
            500,
        )

    # Get data from the frontend's request
    client_data = request.get_json()
    start_cursor = client_data.get("start_cursor")

    notion_api_url = f"https://api.notion.com/v1/databases/{TASKS_DATABASE_ID}/query"

    headers = {
        "Authorization": f"Bearer {NOTION_API_KEY}",
        "Content-Type": "application/json",
        "Notion-Version": NOTION_API_VERSION,
    }

    # Construct the payload for the Notion API
    payload = {}
    if start_cursor:
        payload["start_cursor"] = start_cursor

    try:
        # Forward the request to the Notion API
        response = requests.post(notion_api_url, headers=headers, json=payload)
        # Raise an exception for bad status codes (4xx or 5xx)
        response.raise_for_status()

        # Return Notion's response directly to the frontend
        return jsonify(response.json()), response.status_code

    except requests.exceptions.RequestException as e:
        # Handle network errors or non-2xx responses from Notion
        error_message = "Failed to fetch data from Notion API."
        if e.response is not None:
            # Try to return Notion's specific error message if available
            return jsonify(e.response.json()), e.response.status_code
        else:
            return jsonify({"error": error_message, "details": str(e)}), 500


if __name__ == "__main__":
    # Runs the server on http://127.0.0.1:5000
    app.run(debug=True, port=5000)
