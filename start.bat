@echo off
REM OS3D Startup Script for Windows
REM Starts both the ICP server and the Genie web app
REM Uses PID-based monitoring for reliable process tracking.

cd /d "%~dp0"

echo Starting OS3D...
echo.

REM --- Start ICP server and capture its PID ---
echo Starting ICP server on port 8001...
set "ICP_PID="
for /f %%a in ('powershell -NoProfile -Command "(Start-Process julia -ArgumentList '--project=. icp/server.jl' -WindowStyle Minimized -PassThru).Id"') do set "ICP_PID=%%a"
if not defined ICP_PID (
    echo WARNING: Could not capture ICP server PID
) else (
    echo   ICP PID: %ICP_PID%
)

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
if defined ICP_PID taskkill /PID %ICP_PID% /F >nul 2>&1
exit /b 1

:icp_ready
echo ICP server ready!

REM --- Start Genie app and capture its PID ---
echo Starting Genie app on port 8000...
set "GENIE_PID="
for /f %%a in ('powershell -NoProfile -Command "(Start-Process julia -ArgumentList '--project=. app.jl' -WindowStyle Minimized -PassThru).Id"') do set "GENIE_PID=%%a"
if not defined GENIE_PID (
    echo WARNING: Could not capture Genie app PID
) else (
    echo   Genie PID: %GENIE_PID%
)

REM Wait for Genie app to be ready
echo Waiting for Genie app to initialize...
set GENIE_WAITED=0
set GENIE_MAX_WAIT=120

:genie_wait_loop
if %GENIE_WAITED% GEQ %GENIE_MAX_WAIT% goto genie_timeout

curl -s http://127.0.0.1:8000/ >nul 2>&1
if %ERRORLEVEL% EQU 0 goto genie_ready

timeout /t 2 /nobreak >nul
set /a GENIE_WAITED=%GENIE_WAITED%+2
echo   ...waiting (%GENIE_WAITED% seconds)
goto genie_wait_loop

:genie_timeout
echo ERROR: Genie app failed to start within %GENIE_MAX_WAIT% seconds
if defined GENIE_PID taskkill /PID %GENIE_PID% /F >nul 2>&1
if defined ICP_PID taskkill /PID %ICP_PID% /F >nul 2>&1
exit /b 1

:genie_ready
echo Genie app ready!

echo.
echo OS3D is running!
echo   - Web UI: http://127.0.0.1:8000
echo   - ICP Server: http://127.0.0.1:8001
echo.
echo Press Ctrl+C to stop manually.

REM --- Monitor: check if Genie PID is still alive ---
:monitor_loop
timeout /t 5 /nobreak >nul
if defined GENIE_PID (
    tasklist /FI "PID eq %GENIE_PID%" 2>nul | findstr /I "julia.exe" >nul
    if errorlevel 1 (
        echo.
        echo Genie app exited — shutting down ICP server...
        if defined ICP_PID taskkill /PID %ICP_PID% /F >nul 2>&1
        echo Stopped.
        goto :eof
    )
)
goto monitor_loop
