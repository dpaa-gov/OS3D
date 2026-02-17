#!/bin/bash
## OS3D Launcher
## Starts the Genie web app with threaded ICP, then opens in browser app mode.
## This script is meant for the standalone distribution bundle.

set -e

# Resolve app directory (where this script lives)
APP_DIR="$(cd "$(dirname "$0")" && pwd)"

# Use bundled Julia if available, otherwise fall back to system Julia
if [ -x "$APP_DIR/julia/bin/julia" ]; then
    JULIA="$APP_DIR/julia/bin/julia"
else
    JULIA="$(command -v julia 2>/dev/null || true)"
    if [ -z "$JULIA" ]; then
        echo "ERROR: Julia not found. Please install Julia or use the full OS3D bundle."
        exit 1
    fi
fi

# Use sysimage if available
SYSIMAGE="$APP_DIR/dist/os3d_sysimage.so"
if [ -f "$SYSIMAGE" ]; then
    JULIA_FLAGS="--threads=auto --project=$APP_DIR -J$SYSIMAGE"
    echo "Using precompiled sysimage (fast startup)"
else
    JULIA_FLAGS="--threads=auto --project=$APP_DIR"
    echo "No sysimage found — using JIT compilation (slower startup)"
fi

echo ""
echo "  ╔═══════════════════════════════════════╗"
echo "  ║     OS3D - Osteometric Sorting 3D     ║"
echo "  ╚═══════════════════════════════════════╝"
echo ""

# Start app
echo "Starting OS3D on port 8000..."
$JULIA $JULIA_FLAGS "$APP_DIR/app.jl" > /tmp/os3d_app.log 2>&1 &
GENIE_PID=$!

# Wait for app to start accepting connections
echo "Waiting for web app..."
WAITED=0
while [ $WAITED -lt 120 ]; do
    if curl -s http://127.0.0.1:8000/ >/dev/null 2>&1; then
        echo "Web app ready!"
        break
    fi
    sleep 2
    WAITED=$((WAITED + 2))
    echo "  ...waiting ($WAITED seconds)"
done

if [ $WAITED -ge 120 ]; then
    echo "ERROR: App failed to start within 120 seconds"
    echo "Check /tmp/os3d_app.log for errors"
    kill $GENIE_PID 2>/dev/null
    exit 1
fi

URL="http://127.0.0.1:8000"

# Open in browser app mode (borderless window) — try Chrome, Edge, Chromium, then default
echo ""
echo "Opening OS3D in browser..."
if command -v google-chrome &>/dev/null; then
    google-chrome --app="$URL" --new-window 2>/dev/null &
elif command -v google-chrome-stable &>/dev/null; then
    google-chrome-stable --app="$URL" --new-window 2>/dev/null &
elif command -v chromium-browser &>/dev/null; then
    chromium-browser --app="$URL" --new-window 2>/dev/null &
elif command -v chromium &>/dev/null; then
    chromium --app="$URL" --new-window 2>/dev/null &
elif command -v microsoft-edge &>/dev/null; then
    microsoft-edge --app="$URL" --new-window 2>/dev/null &
else
    echo "No Chrome/Chromium/Edge found — opening in default browser"
    xdg-open "$URL" 2>/dev/null &
fi

echo ""
echo "OS3D is running!"
echo "  Web UI: $URL"
echo ""
echo "Press Ctrl+C to stop"

# Cleanup on exit
cleanup() {
    echo ""
    echo "Stopping OS3D..."
    kill $GENIE_PID 2>/dev/null
    wait $GENIE_PID 2>/dev/null
    echo "Stopped."
    exit 0
}

trap cleanup SIGINT SIGTERM

# Wait for process to exit
wait $GENIE_PID
