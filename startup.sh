#!/bin/bash

# This script starts the backend API and frontend server concurrently.

# Function to clean up background jobs on exit
cleanup() {
    echo "Shutting down servers..."
    # Kill all processes in the script's process group to ensure children terminate
    kill 0
}

# Trap Ctrl+C (interrupt signal) and call the cleanup function
trap cleanup INT

# --- Server Configuration ---
BACKEND_DIR="api"
VENV_DIR="$BACKEND_DIR/venv"
BACKEND_REQUIREMENTS="$BACKEND_DIR/requirements.txt"
# NOTE: Changed to server.py to align with the Python virtual environment setup.
# If your backend is Node.js, this command should be changed (e.g., "node api/server.js")
# and the Python venv setup below can be removed.
BACKEND_SCRIPT_PATH="$BACKEND_DIR/server.py"
FRONTEND_PORT=8000

# --- Backend Setup ---
# Create a virtual environment if it doesn't exist
if [ ! -d "$VENV_DIR" ]; then
    echo "Creating Python virtual environment at $VENV_DIR..."
    python3 -m venv "$VENV_DIR"
    if [ $? -ne 0 ]; then
        echo "Failed to create virtual environment. Please ensure python3 and venv are installed."
        exit 1
    fi
fi

# Install dependencies from requirements.txt if it exists
if [ -f "$BACKEND_REQUIREMENTS" ]; then
    echo "Installing/updating backend dependencies..."
    "$VENV_DIR/bin/pip" install -r "$BACKEND_REQUIREMENTS"
else
    echo "Warning: '$BACKEND_REQUIREMENTS' not found."
    echo "Please ensure backend dependencies are listed in '$BACKEND_REQUIREMENTS'."
    xit 1
fi

# Set the command to run the backend using the virtual environment's Python
BACKEND_COMMAND="$VENV_DIR/bin/python $BACKEND_SCRIPT_PATH"

# --- Server Startup ---
echo "Starting backend API server..."
# Start the backend in the background
($BACKEND_COMMAND) &
# Capture its Process ID (PID)
API_PID=$!

echo "Starting frontend server on port $FRONTEND_PORT..."
# Start a simple Python web server for the frontend in the background
(python3 -m http.server $FRONTEND_PORT) &
# Capture its PID
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

# Wait for the background processes to finish (will be interrupted by trap)
wait $API_PID $FRONTEND_PID