@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0.."

echo Project root: %cd%
echo.

REM ----------------------------
REM Ensure .agents exists (shared rules source)
REM ----------------------------
if not exist ".agents\" (
    mkdir ".agents"
    echo Created .agents
)

REM ----------------------------
REM Ensure .qoder -> .agents symlink
REM ----------------------------
if exist ".qoder" (
    echo .qoder already exists - skipping
) else (
    mklink /D ".qoder" ".agents"
    echo Created .qoder symlink -> .agents
)

REM ----------------------------
REM Copy .codex\hooks.json -> .qoder\settings.json
REM ----------------------------
if exist ".codex\hooks.json" (
    copy /Y ".codex\hooks.json" ".qoder\settings.json" >nul
    if errorlevel 1 (
        echo ERROR: failed to copy .codex\hooks.json
    ) else (
        echo Copied .codex\hooks.json -^> .qoder\settings.json
    )
) else (
    echo .codex\hooks.json not found - skipping
)

REM ----------------------------
REM Update .gitignore entries
REM ----------------------------
echo.
if not exist ".gitignore" (
    echo. > ".gitignore"
    echo Created .gitignore
)

REM Ensure .gitignore ends with a newline before appending new lines
echo.>> ".gitignore"

call :AddToGitIgnore ".qoder"

echo.
echo Done.
pause
goto :eof

REM ----------------------------------------------------
REM Helper: Appends entry to .gitignore if not present
REM ----------------------------------------------------
:AddToGitIgnore
set "ENTRY=%~1"
findstr /C:"%ENTRY%" ".gitignore" >nul 2>&1
if errorlevel 1 (
    echo %ENTRY%>> ".gitignore"
    echo Added %ENTRY% to .gitignore
) else (
    echo %ENTRY% already in .gitignore
)
goto :eof