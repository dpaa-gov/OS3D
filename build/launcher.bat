@echo off
REM OS3D Launcher for Windows
REM Starts the ICP server and Genie web app, then opens in browser app mode.
REM This script is meant for the standalone distribution bundle.

cd /d "%~dp0"

echo.
echo   ========================================
echo        OS3D - Osteometric Sorting 3D
echo   ========================================
echo.

REM Detect Julia: bundled or system
if exist "%~dp0julia\bin\julia.exe" (
    set "JULIA=%~dp0julia\bin\julia.exe"
) else (
    where julia >nul 2>&1
    if errorlevel 1 (
        echo ERROR: Julia not found. Please install Julia or use the full OS3D bundle.
        pause
        exit /b 1
    )
    set "JULIA=julia"
)

REM Detect sysimage
set "SYSIMAGE=%~dp0dist\os3d_sysimage.dll"
if exist "%SYSIMAGE%" (
    set "JULIA_FLAGS=--project=%~dp0. -J%SYSIMAGE%"
    echo Using precompiled sysimage (fast startup)
) else (
    set "JULIA_FLAGS=--project=%~dp0."
    echo No sysimage found — using JIT compilation (slower startup)
)

REM Start ICP server in background (with window title for cleanup)
echo Starting ICP server on port 8001...
start "OS3D ICP Server" /MIN "%JULIA%" %JULIA_FLAGS% "%~dp0icp\server.jl"

REM Wait for ICP server
echo Waiting for ICP server to initialize...
set MAX_WAIT=120
set WAITED=0

:icp_wait
if %WAITED% GEQ %MAX_WAIT% goto icp_timeout
curl -s http://127.0.0.1:8001/status 2>nul | findstr /C:"\"ready\":true" >nul
if %ERRORLEVEL% EQU 0 goto icp_ready
timeout /t 2 /nobreak >nul
set /a WAITED=%WAITED%+2
echo   ...waiting (%WAITED% seconds)
goto icp_wait

:icp_timeout
echo ERROR: ICP server failed to start within %MAX_WAIT% seconds
taskkill /FI "WINDOWTITLE eq OS3D ICP Server" /F >nul 2>&1
pause
exit /b 1

:icp_ready
echo ICP server ready!

REM Start Genie app in background (with window title for cleanup)
echo Starting Genie web app on port 8000...
start "OS3D Genie App" /MIN "%JULIA%" %JULIA_FLAGS% "%~dp0app.jl"

REM Wait for Genie
echo Waiting for web app...
set WAITED=0
:genie_wait
if %WAITED% GEQ 60 goto genie_ready
curl -s http://127.0.0.1:8000/ >nul 2>&1
if %ERRORLEVEL% EQU 0 goto genie_ready
timeout /t 2 /nobreak >nul
set /a WAITED=%WAITED%+2
goto genie_wait

:genie_ready
set "URL=http://127.0.0.1:8000"

REM Open in browser app mode — try Edge (pre-installed on Windows), then Chrome
echo.
echo Opening OS3D in browser...
where msedge >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    start "" msedge --app="%URL%" --new-window
    goto browser_done
)
if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" (
    start "" "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --app="%URL%" --new-window
    goto browser_done
)
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --app="%URL%" --new-window
    goto browser_done
)
REM Fallback: open in default browser
start "" "%URL%"

:browser_done
echo.
echo OS3D is running!
echo   Web UI: %URL%
echo   ICP Server: http://127.0.0.1:8001
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
