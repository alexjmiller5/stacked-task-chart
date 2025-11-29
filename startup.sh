#!/bin/bash

# This script starts the backend API and frontend server concurrently using uv.

# --- Configuration ---
BACKEND_DIR="api"
BACKEND_SCRIPT_PATH="$BACKEND_DIR/server.py"
FRONTEND_PORT=8000
# Define the Python dependencies for uv run --with
PYTHON_DEPS="requests,flask,dotenv,flask-cors"

# Function to clean up background jobs on exit
cleanup() {
    echo "Shutting down servers..."
    # Kill all processes in the script's process group to ensure children terminate
    kill 0
}

# Trap Ctrl+C (interrupt signal) and call the cleanup function
trap cleanup INT

# --- Server Startup ---

# The uv run command handles dependency installation/caching and execution in one step.
echo "Starting backend API server with uv run..."
# Run the backend using 'uv run --with' to manage dependencies
# The -- python flag ensures the script is run with the Python interpreter
(uv run --with "$PYTHON_DEPS" -- python "$BACKEND_SCRIPT_PATH") &
API_PID=$!

echo "Starting frontend server on port $FRONTEND_PORT..."
# Start a simple Python web server for the frontend in the background
(python3 -m http.server "$FRONTEND_PORT") &
FRONTEND_PID=$!

echo
echo "=================================================="
echo "          Servers are running!"
echo
echo "  Frontend URL: http://127.0.0.1:$FRONTEND_PORT"
echo "  Backend API is running in the background."
echo
echo "  Press Ctrl+C to shut down both servers."
echo "=================================================="
echo

# Open frontend in default browser (simplified cross-platform logic)
echo "Opening frontend in your default browser..."
URL="http://127.0.0.1:$FRONTEND_PORT"
if command -v xdg-open >/dev/null 2>&1; then
    # Linux
    xdg-open "$URL" >/dev/null 2>&1
elif command -v open >/dev/null 2>&1; then
    # macOS
    open "$URL"
else
    echo "Could not automatically open browser. Please navigate to $URL"
fi

# Wait for the background processes to finish (will be interrupted by trap)
wait $API_PID $FRONTEND_PID