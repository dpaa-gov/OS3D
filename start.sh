#!/bin/bash
# OS3D Startup Script
# Starts the Genie web app with threaded ICP

cd "$(dirname "$0")"

echo "Starting OS3D..."
echo ""

# Start Genie app with threads for ICP
THREADS=$(nproc)
echo "Starting OS3D on port 8000 (threads=$THREADS)..."
julia --threads=$THREADS --project=. app.jl &
GENIE_PID=$!

# Auto-open browser when Genie is ready (runs in background)
(
    for i in $(seq 1 60); do
        if curl -s http://127.0.0.1:8000/ >/dev/null 2>&1; then
            if command -v google-chrome &>/dev/null; then
                google-chrome --app="http://127.0.0.1:8000" --new-window 2>/dev/null &
            elif command -v google-chrome-stable &>/dev/null; then
                google-chrome-stable --app="http://127.0.0.1:8000" --new-window 2>/dev/null &
            elif command -v chromium-browser &>/dev/null; then
                chromium-browser --app="http://127.0.0.1:8000" --new-window 2>/dev/null &
            elif command -v chromium &>/dev/null; then
                chromium --app="http://127.0.0.1:8000" --new-window 2>/dev/null &
            elif command -v microsoft-edge &>/dev/null; then
                microsoft-edge --app="http://127.0.0.1:8000" --new-window 2>/dev/null &
            else
                xdg-open "http://127.0.0.1:8000" 2>/dev/null &
            fi
            break
        fi
        sleep 2
    done
) &

echo ""
echo "OS3D is running!"
echo "  - Web UI: http://127.0.0.1:8000"
echo ""
echo "Press Ctrl+C to stop"

# Cleanup function
cleanup() {
    echo "Stopping OS3D..."
    kill $GENIE_PID 2>/dev/null
    wait $GENIE_PID 2>/dev/null
    echo "Stopped."
    exit 0
}

# Handle Ctrl+C
trap cleanup SIGINT SIGTERM

# Wait for process to exit
wait $GENIE_PID
