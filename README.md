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

## TODO

- Verify that the changelog history works correctly for due date and tag history - I haven't tested it at all
- Get rid of the shutdown warning caused by the startup script:

```sh
^CShutting down servers...
zsh: terminated  ./startup.sh
/opt/homebrew/Cellar/python@3.13/3.13.5/Frameworks/Python.framework/Versions/3.13/lib/python3.13/multiprocessing/resource_tracker.py:301: UserWarning: resource_tracker: There appear to be 1 leaked semaphore objects to clean up at shutdown: {'/mp-lzbnti83'}
  warnings.warn(
```

- Add more instructions on how to use the app and how it actually works - the best ways to view tasks, interesteing observations - how to itnerpret the data bascially
- Add more comments to the code
- Add more documentation about how the caching works
- Instead of just overdue could add a "Due" tag that shows tasks that are due today. Could be interesting to see how many tasks are due each day relative to time
- Could change Undated to be "No Due Date" - sounds a little better and more consistent I think
- Could add vertical lines with important life events that make me more busy and less busy (and inherently affect my task count by allowing it to build up and tasks not be completed - things like moving into a new apartment, breaking my knee, starting a semester of BU, starting my new job, going to Asia etc.)
- Rewrite this entire graph with a dashboarding application so that I don't have to handle the UI (my current js solution isn't perfect because I'm not a big frontend guy). There are options where I just provide the data and it handles the UI and graphing for me. Would be a lot cleaner and easier to maintain. Here's a gemini chat where I asked it to help me find the proper libraries for what I'm looking for: <https://gemini.google.com/app/3d0fffb5dd4a3e41>
- refactor to use the new tags system in combination with the old tags system cause the old tags were pretty filled up
