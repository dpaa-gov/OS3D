@echo off
REM OS3D Startup Script for Windows
REM Starts the Genie web app with threaded ICP

cd /d "%~dp0"

echo Starting OS3D...
echo.

REM --- Start app and capture its PID ---
echo Starting OS3D on port 8000...
set "GENIE_PID="
for /f %%a in ('powershell -NoProfile -Command "(Start-Process julia -ArgumentList '--threads=auto --project=. app.jl' -WindowStyle Minimized -PassThru).Id"') do set "GENIE_PID=%%a"
if not defined GENIE_PID (
    echo WARNING: Could not capture app PID
) else (
    echo   PID: %GENIE_PID%
)

REM Wait for app to be ready
echo Waiting for app to initialize...
set WAITED=0
set MAX_WAIT=120

:wait_loop
if %WAITED% GEQ %MAX_WAIT% goto timeout

curl -s http://127.0.0.1:8000/ >nul 2>&1
if %ERRORLEVEL% EQU 0 goto app_ready

timeout /t 2 /nobreak >nul
set /a WAITED=%WAITED%+2
echo   ...waiting (%WAITED% seconds)
goto wait_loop

:timeout
echo ERROR: App failed to start within %MAX_WAIT% seconds
if defined GENIE_PID taskkill /PID %GENIE_PID% /F >nul 2>&1
exit /b 1

:app_ready
echo App ready!

REM Auto-open browser in app mode
echo Opening browser...
start /b powershell -NoProfile -Command ^
    "$edge = Get-Command msedge -ErrorAction SilentlyContinue; $chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'; if ($edge) { Start-Process $edge.Source -ArgumentList '--app=http://127.0.0.1:8000 --new-window' } elseif (Test-Path $chrome) { Start-Process $chrome -ArgumentList '--app=http://127.0.0.1:8000 --new-window' } else { Start-Process 'http://127.0.0.1:8000' }"

echo.
echo OS3D is running!
echo   - Web UI: http://127.0.0.1:8000
echo.
echo Press Ctrl+C to stop.

REM --- Monitor: check if PID is still alive ---
:monitor_loop
timeout /t 5 /nobreak >nul
if defined GENIE_PID (
    tasklist /FI "PID eq %GENIE_PID%" 2>nul | findstr /I "julia.exe" >nul
    if errorlevel 1 (
        echo.
        echo OS3D exited.
        goto :eof
    )
)
goto monitor_loop
