@echo off
setlocal
REM ============================================================
REM Teamcenter extraction entry point for orchestration/frontend
REM Usage: run-teamcenter.bat "product name or item ID"
REM Always writes HelloTeamcenter\tc_extraction.json
REM ============================================================
set "SAMPLES=%~dp0"
set "HELLO=%SAMPLES%HelloTeamcenter"
set "QUERY=%~1"
if "%QUERY%"=="" (
    echo ERROR: A Teamcenter product name or Item ID is required.
    echo Usage: run-teamcenter.bat "product name or item ID"
    exit /b 2
)
set "OUTPUT=%HELLO%\tc_extraction.json"
REM Preserve existing unattended demo runtime behavior.
if "%TC_HOST%"=="" set "TC_HOST=http://hnjpitstop3srv:8080/tc"
if "%TC_USERNAME%"=="" set "TC_USERNAME=infodba"
if "%TC_PASSWORD%"=="" set "TC_PASSWORD=infodba"
REM Prevent a stale extraction from being mistaken for this run.
if exist "%OUTPUT%" del /q "%OUTPUT%"
if exist "%OUTPUT%.search.json" del /q "%OUTPUT%.search.json"
call "%HELLO%\rebuild-java17-direct.bat"
if errorlevel 1 exit /b 10
set "JAVA_HOME=C:\Program Files\Java\jdk-17"
set "JAXB_CP=..\..\libs\jaxb-api-2.3.1.jar;..\..\libs\jaxb-runtime-2.3.1.jar;..\..\libs\jaxb-impl.jar;..\..\libs\javax.activation-api-1.2.0.jar"
pushd "%HELLO%"
"%JAVA_HOME%\bin\java.exe" --add-opens java.base/java.lang=ALL-UNNAMED --add-opens java.base/java.util=ALL-UNNAMED --add-opens java.base/java.io=ALL-UNNAMED -Dhost="%TC_HOST%" -Doperation=extract -Dquery="%QUERY%" -DqueryType=auto -Doutput="%OUTPUT%" -cp "bin;%JAXB_CP%;..\..\libs\*" com.teamcenter.hello.Hello
set "EXIT_CODE=%ERRORLEVEL%"
popd
if not "%EXIT_CODE%"=="0" exit /b %EXIT_CODE%
if not exist "%OUTPUT%" (
    echo ERROR: Teamcenter extraction completed without tc_extraction.json.
    exit /b 9
)
echo [SUCCESS] Teamcenter extraction created: %OUTPUT%
exit /b 0
