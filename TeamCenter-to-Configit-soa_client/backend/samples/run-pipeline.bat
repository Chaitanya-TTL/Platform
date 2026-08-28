
@echo off
setlocal enabledelayedexpansion

REM ============================================================
REM ETL Pipeline Orchestrator
REM Simple: HelloTeamcenter -> ConfigitAceIntegration
REM ============================================================

REM ============================================================
REM CONFIGURATION - Update these credentials as needed
REM ============================================================
REM Teamcenter connection is supplied through TC_HOST, TC_USERNAME and TC_PASSWORD.
if "%TC_HOST%"=="" set TC_HOST=http://hnjpitstop3srv:8080/tc

REM Configit ACE Connection
REM CONFIGIT_URI and CONFIGIT_API_KEY must be supplied through environment variables.
REM ============================================================

echo.
echo ============================================================
echo  ETL Pipeline: HelloTeamcenter - ConfigitAceIntegration
echo ============================================================
echo.

REM ============================================================
REM STEP 1: Build and run HelloTeamcenter (Java)
REM ============================================================
echo [STEP 1/2] Building and running HelloTeamcenter...
echo Connecting to: %TC_HOST%
echo.

set TC_ITEM_ID=%~1
if "%TC_ITEM_ID%"=="" set TC_ITEM_ID=002380
call "%~dp0run-teamcenter.bat" extract "%TC_ITEM_ID%" id "%~dp0HelloTeamcenter\tc_extraction.json"
if errorlevel 1 (
    echo ERROR: Teamcenter extraction failed
    exit /b 1
)
cd /d "%~dp0HelloTeamcenter"
echo [OK] tc_extraction.json created
echo.

 REM No PLMXML copy is performed. ConfigitAceIntegration uses its local PLMXML.xml directly.
 echo [INFO] PLMXML will be read from ConfigitAceIntegration\PLMXML.xml, not copied from HelloTeamcenter.
 echo.
REM ============================================================
echo [STEP 2/2] Running ConfigitAceIntegration...
echo.

REM Copy tc_extraction.json to ConfigitAceIntegration
copy /Y tc_extraction.json ..\ConfigitAceIntegration\tc_extraction.json >nul
echo Copied tc_extraction.json to ConfigitAceIntegration

cd ..\ConfigitAceIntegration

REM Run ConfigitAceIntegration with API key
echo Running transformation...
echo.

if exist bin\Release\net9.0\ConfigitAceIntegration.exe (
    bin\Release\net9.0\ConfigitAceIntegration.exe tc_extraction.json --api-key "%CONFIGIT_API_KEY%"
) else if exist bin\Release\net8.0\ConfigitAceIntegration.exe (
    bin\Release\net8.0\ConfigitAceIntegration.exe tc_extraction.json --api-key "%CONFIGIT_API_KEY%"
) else (
    REM Fallback to dotnet run
    dotnet run -- tc_extraction.json
)

if errorlevel 1 (
    echo ERROR: ConfigitAceIntegration failed
    exit /b 1
)

if not exist bom-output.json (
    echo ERROR: bom-output.json not created
    exit /b 1
)

echo.
echo ============================================================
echo  [SUCCESS] ETL Pipeline completed!
echo ============================================================
echo.
echo Outputs:
echo   - HelloTeamcenter\tc_extraction.json (Teamcenter BOM)
echo   - ConfigitAceIntegration\tc_extraction.json (copy)
echo   - ConfigitAceIntegration\bom-output.json (transformed BOM)
echo   - ConfigitAceIntegration\bom-output.json (Loaded BOM)
echo.
endlocal
