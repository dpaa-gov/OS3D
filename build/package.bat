@echo off
REM OS3D Windows Packaging Script
REM Builds a standalone compiled application using PackageCompiler create_app
REM
REM Usage: build\package.bat
REM
REM Prerequisites:
REM   - Julia 1.11+ installed and on PATH
REM   - Project dependencies installed (Pkg.instantiate)
REM
REM Output: dist\OS3D-v{VERSION}-windows-x86_64.zip

setlocal enabledelayedexpansion
cd /d "%~dp0\.."

REM Read version
if exist VERSION (
    set /p VERSION=<VERSION
) else (
    set VERSION=0.1.0
)

set ARCH=x86_64
set BUNDLE_NAME=OS3D-v%VERSION%-windows-%ARCH%
set DIST_DIR=%CD%\dist
set COMPILED_DIR=%DIST_DIR%\OS3D-compiled
set STAGE_DIR=%DIST_DIR%\%BUNDLE_NAME%

echo.
echo ============================================
echo      OS3D Windows Bundle Builder
echo ============================================
echo   Version:  %VERSION%
echo   Arch:     %ARCH%
echo   Output:   %BUNDLE_NAME%.zip
echo ============================================
echo.

REM Step 1: Build compiled application
echo 1. Building compiled application (create_app)...
julia --project=. build\build_sysimage.jl
if errorlevel 1 (
    echo ERROR: Build failed
    pause
    exit /b 1
)

if not exist "%COMPILED_DIR%" (
    echo ERROR: Compiled app not found at %COMPILED_DIR%
    pause
    exit /b 1
)

REM Step 2: Stage the compiled app
echo 2. Staging bundle...
if exist "%STAGE_DIR%" rmdir /s /q "%STAGE_DIR%"
xcopy /e /i /q "%COMPILED_DIR%" "%STAGE_DIR%" >nul

REM Step 3: Copy runtime assets
echo 3. Copying runtime assets...
xcopy /e /i /q "public" "%STAGE_DIR%\public" >nul
xcopy /e /i /q "views" "%STAGE_DIR%\views" >nul
copy /y "Manifest.toml" "%STAGE_DIR%\share\julia\" >nul

REM Step 4: Create archive
echo 4. Creating archive...
powershell -Command "Compress-Archive -Path '%STAGE_DIR%' -DestinationPath '%DIST_DIR%\%BUNDLE_NAME%.zip' -Force"

echo.
echo ============================================
echo   Bundle created successfully!
echo ============================================
echo   Archive: dist\%BUNDLE_NAME%.zip
echo ============================================
echo.
echo To distribute:
echo   1. Upload %BUNDLE_NAME%.zip
echo   2. Users extract and run: bin\os3d.exe

pause
