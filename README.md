# stacked-task-chart

## Requirements

- Python 3 (recommended: Python 3.8+)
- `python3-venv` package (for virtual environment support)

## Setup & Run

1. Clone this repository.
2. Make sure you have Python 3 installed (`python3 --version`).
3. Run the startup script:

   ```bash
   ./startup.sh
   ```

This will:

- Set up a Python virtual environment for the backend API.
- Install backend dependencies from `api/requirements.txt`.
- Start the backend API server.
- Start a frontend server on port 8000.

Press `Ctrl+C` to stop both servers.

## Notes

- If you see errors about missing dependencies, ensure you have Python 3 and `python3-venv` installed.
- The backend API runs from `api/server.py`.
- The frontend is served from the project directory via Python's built-in HTTP server.

## Secrets Configuration

Create a file named `.env.local` in the project root with the following contents:

```
NOTION_API_KEY=your_notion_integration_token
DATABASE_ID=your_notion_database_id
```

- `NOTION_API_KEY`: Your Notion integration token.
- `TASKS_DATABASE_ID`: The ID of your Notion database.

These secrets are required for the backend API to fetch data from Notion.
