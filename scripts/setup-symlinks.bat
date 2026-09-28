@echo off
setlocal enabledelayedexpansion

cd /d "%~dp0.."

echo Project root: %cd%
echo.

REM ----------------------------
REM Ensure AGENTS.md is source of truth
REM ----------------------------
if not exist "AGENTS.md" (
    echo. > "AGENTS.md"
    echo Created AGENTS.md (source of truth)
)

REM ----------------------------
REM Ensure CLAUDE.md is symlink -> AGENTS.md
REM ----------------------------
if exist "CLAUDE.md" (
    echo CLAUDE.md already exists - ensure it is a symlink manually if needed
) else (
    mklink "CLAUDE.md" "AGENTS.md"
    echo Created CLAUDE.md symlink -> AGENTS.md
)

REM ----------------------------
REM Ensure .agents exists
REM ----------------------------
if not exist ".agents\" (
    mkdir ".agents"
    echo Created .agents
)

REM ----------------------------
REM Ensure .claude -> .agents symlink
REM ----------------------------
if exist ".claude" (
    echo .claude already exists - skipping
) else (
    mklink /D ".claude" ".agents"
    echo Created .claude symlink -> .agents
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
REM Ensure .kiro -> .agents symlink
REM ----------------------------
if exist ".kiro" (
    echo .kiro already exists - skipping
) else (
    mklink /D ".kiro" ".agents"
    echo Created .kiro symlink -> .agents
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

call :AddToGitIgnore "CLAUDE.md"
call :AddToGitIgnore ".claude"
call :AddToGitIgnore ".qoder"
call :AddToGitIgnore ".kiro"

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