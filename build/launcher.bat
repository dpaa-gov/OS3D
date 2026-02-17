@echo off
REM OS3D Launcher for Windows
REM Starts the Genie web app with threaded ICP, then opens in browser app mode.
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
    set "JULIA_FLAGS=--threads=auto --project=%~dp0. -J%SYSIMAGE%"
    echo Using precompiled sysimage
) else (
    set "JULIA_FLAGS=--threads=auto --project=%~dp0."
    echo No sysimage found - using JIT compilation
)

REM --- Start app and capture its PID ---
echo Starting OS3D on port 8000...
set "GENIE_PID="
for /f %%a in ('powershell -NoProfile -Command "(Start-Process \"%JULIA%\" -ArgumentList '%JULIA_FLAGS% \"%~dp0app.jl\"' -WindowStyle Minimized -PassThru).Id"') do set "GENIE_PID=%%a"
if not defined GENIE_PID (
    echo WARNING: Could not capture app PID
) else (
    echo   PID: %GENIE_PID%
)

REM Wait for app
echo Waiting for web app...
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
pause
exit /b 1

:app_ready
set "URL=http://127.0.0.1:8000"

REM Open in browser app mode - try Edge, then Chrome
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
