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

# Wait for ICP server to be ready
echo "Waiting for ICP server to initialize..."
sleep 10

# Check if ICP server is running
if ! kill -0 $ICP_PID 2>/dev/null; then
    echo "ERROR: ICP server failed to start"
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
