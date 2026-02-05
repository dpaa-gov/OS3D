#!/bin/bash
# OS3D Startup Script
# Starts both the ICP server and the Genie web app

cd "$(dirname "$0")"

echo "Starting OS3D..."
echo ""

# Start ICP server in background with nohup to prevent signal issues
echo "Starting ICP server on port 8001..."
nohup julia --project=. icp/server.jl > /tmp/icp_server.log 2>&1 &
ICP_PID=$!

# Wait for ICP server to be ready (poll /status endpoint)
echo "Waiting for ICP server to initialize..."
MAX_WAIT=120
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
    if curl -s http://127.0.0.1:8001/status 2>/dev/null | grep -q '"ready":true'; then
        echo "ICP server ready!"
        break
    fi
    sleep 2
    WAITED=$((WAITED + 2))
    echo "  ...waiting ($WAITED seconds)"
done

if [ $WAITED -ge $MAX_WAIT ]; then
    echo "ERROR: ICP server failed to start within $MAX_WAIT seconds"
    echo "Check /tmp/icp_server.log for errors"
    kill $ICP_PID 2>/dev/null
    exit 1
fi

# Start Genie app
echo "Starting Genie app on port 8000..."
julia --project=. app.jl &
GENIE_PID=$!

echo ""
echo "OS3D is running!"
echo "  - Web UI: http://127.0.0.1:8000"
echo "  - ICP Server: http://127.0.0.1:8001"
echo ""
echo "Press Ctrl+C to stop both servers"

# Handle Ctrl+C
trap "echo 'Stopping...'; kill $ICP_PID $GENIE_PID 2>/dev/null; exit 0" SIGINT SIGTERM

# Wait for processes
wait
