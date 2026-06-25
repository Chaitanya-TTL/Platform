@echo off
setlocal enabledelayedexpansion

REM ============================================================
REM ETL Pipeline Orchestrator
REM Simple: HelloTeamcenter -> ConfigitAceIntegration
REM ============================================================

REM ============================================================
REM CONFIGURATION - Update these credentials as needed
REM ============================================================
REM Teamcenter Connection
set TC_HOST=http://hnjpitstop3srv:8080/tc
set TC_USERNAME=infodba
set TC_PASSWORD=infodba

REM Configit ACE Connection
set CONFIGIT_URI=https://ttl-01.demo.configit.cloud/
set CONFIGIT_API_KEY=MGYyODcxMTUwYTg4NDQ3N2ExYmJmZDJhNzJmOTIxNGJfZmUxMjRiMDQzNmY3NGM5MDliNTYxMDBkMzgxZDBjZjA=
REM ============================================================

echo.
echo ============================================================
echo  ETL Pipeline: HelloTeamcenter - ConfigitAceIntegration
echo ============================================================
echo.

REM ============================================================
REM STEP 1: Run HelloTeamcenter (Java)
REM ============================================================
echo [STEP 1/2] Running HelloTeamcenter...
echo Connecting to: %TC_HOST%
echo.

cd HelloTeamcenter

REM Build explicit JAXB classpath FIRST, then other libraries
set JAXB_CP=..\..\libs\jaxb-api-2.3.1.jar;..\..\libs\jaxb-runtime-2.3.1.jar;..\..\libs\jaxb-impl.jar;..\..\libs\javax.activation-api-1.2.0.jar

REM Run HelloTeamcenter with proper JAXB support for Java 17+
java --add-opens java.base/java.lang=ALL-UNNAMED --add-opens java.base/java.util=ALL-UNNAMED -Dhost=%TC_HOST% -cp "bin;%JAXB_CP%;..\..\libs\*" com.teamcenter.hello.Hello

if errorlevel 1 (
    echo ERROR: HelloTeamcenter failed
    exit /b 1
)

if not exist tc_extraction.json (
    echo ERROR: tc_extraction.json not created by HelloTeamcenter
    exit /b 1
)

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