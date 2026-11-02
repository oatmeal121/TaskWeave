@echo off
setlocal
cd /d "%~dp0"

set "TASKWEAVE_VCVARS="
call :find_vcvars "%ProgramFiles(x86)%\Microsoft Visual Studio\18\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
call :find_vcvars "%ProgramFiles%\Microsoft Visual Studio\18\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
call :find_vcvars "%ProgramFiles%\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
call :find_vcvars "%ProgramFiles%\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat"
call :find_vcvars "%ProgramFiles%\Microsoft Visual Studio\2022\Professional\VC\Auxiliary\Build\vcvars64.bat"
call :find_vcvars "%ProgramFiles%\Microsoft Visual Studio\2022\Enterprise\VC\Auxiliary\Build\vcvars64.bat"

if not defined TASKWEAVE_VCVARS goto :missing_build_tools

echo [1/3] Loading the Microsoft C++ build environment...
call "%TASKWEAVE_VCVARS%"
if errorlevel 1 goto :failed

where npm.cmd >nul 2>nul
if errorlevel 1 goto :missing_node

if exist "node_modules\.bin\tauri.cmd" goto :dependencies_ready
echo [2/3] Installing project dependencies...
call npm.cmd install
if errorlevel 1 goto :failed
goto :build

:dependencies_ready
echo [2/3] Project dependencies are ready.

:build
echo [3/3] Building the TaskWeave Windows installer...
call npm.cmd run tauri build -- --bundles nsis
if errorlevel 1 goto :failed

echo.
echo Build completed successfully.
echo Installer folder:
echo %CD%\src-tauri\target\release\bundle\nsis
echo.
pause
exit /b 0

:find_vcvars
if defined TASKWEAVE_VCVARS exit /b 0
if exist "%~1" set "TASKWEAVE_VCVARS=%~1"
exit /b 0

:missing_build_tools
echo Microsoft C++ Build Tools were not found.
echo Open Visual Studio Installer and install "Desktop development with C++",
echo including an MSVC x64 toolset and a Windows 10 or 11 SDK.
goto :failed

:missing_node
echo Node.js and npm were not found. Install the Node.js LTS release first.
goto :failed

:failed
echo.
echo Packaging failed. Review the message above for details.
pause
exit /b 1
