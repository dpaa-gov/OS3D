@echo off
REM OS3D Startup Script for Windows
REM Starts both the ICP server and the Genie web app

cd /d "%~dp0"

echo Starting OS3D...
echo.

REM Start ICP server in background (with window title for cleanup)
echo Starting ICP server on port 8001...
start "OS3D ICP Server" /MIN julia --project=. icp/server.jl

REM Wait for ICP server to be ready
echo Waiting for ICP server to initialize...
set MAX_WAIT=120
set WAITED=0

:wait_loop
if %WAITED% GEQ %MAX_WAIT% goto timeout

curl -s http://127.0.0.1:8001/status 2>nul | findstr /C:"\"ready\":true" >nul
if %ERRORLEVEL% EQU 0 goto icp_ready

timeout /t 2 /nobreak >nul
set /a WAITED=%WAITED%+2
echo   ...waiting (%WAITED% seconds)
goto wait_loop

:timeout
echo ERROR: ICP server failed to start within %MAX_WAIT% seconds
echo Check logs for errors
taskkill /FI "WINDOWTITLE eq OS3D ICP Server" /F >nul 2>&1
exit /b 1

:icp_ready
echo ICP server ready!

REM Start Genie app in background (with window title for cleanup)
echo Starting Genie app on port 8000...
start "OS3D Genie App" /MIN julia --project=. app.jl

echo.
echo OS3D is running!
echo   - Web UI: http://127.0.0.1:8000
echo   - ICP Server: http://127.0.0.1:8001
echo.
echo Servers will auto-shutdown when you close the browser.
echo Press Ctrl+C to stop manually.

REM Monitor: when Genie exits (heartbeat timeout), kill ICP server
:monitor_loop
timeout /t 3 /nobreak >nul
curl -s http://127.0.0.1:8000/ >nul 2>&1
if errorlevel 1 goto shutdown
goto monitor_loop

:shutdown
echo.
echo Genie app exited — shutting down ICP server...
taskkill /FI "WINDOWTITLE eq OS3D ICP Server" /F >nul 2>&1
echo Stopped.
