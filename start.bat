@echo off
REM OS3D Startup Script for Windows
REM Starts both the ICP server and the Genie web app

cd /d "%~dp0"

echo Starting OS3D...
echo.

REM Start ICP server in background
echo Starting ICP server on port 8001...
start "ICP Server" /B julia --project=. icp/server.jl > %TEMP%\icp_server.log 2>&1

REM Wait for ICP server to be ready (poll /status endpoint)
echo Waiting for ICP server to initialize...
set MAX_WAIT=120
set WAITED=0

:wait_loop
if %WAITED% GEQ %MAX_WAIT% goto timeout

REM Check if ICP server is responding
curl -s http://127.0.0.1:8001/status 2>nul | findstr /C:"\"ready\":true" >nul
if %ERRORLEVEL% EQU 0 goto icp_ready

timeout /t 2 /nobreak >nul
set /a WAITED=%WAITED%+2
echo   ...waiting (%WAITED% seconds)
goto wait_loop

:timeout
echo ERROR: ICP server failed to start within %MAX_WAIT% seconds
echo Check %TEMP%\icp_server.log for errors
exit /b 1

:icp_ready
echo ICP server ready!

REM Start Genie app
echo Starting Genie app on port 8000...
start "Genie App" julia --project=. app.jl

echo.
echo OS3D is running!
echo   - Web UI: http://127.0.0.1:8000
echo   - ICP Server: http://127.0.0.1:8001
echo.
echo Close this window to stop both servers
pause
