@echo off
setlocal enabledelayedexpansion

echo.
echo ============================================================
echo  Compiling HelloTeamcenter for Java 17
echo ============================================================
echo.

REM Get absolute paths
set "HELLO_DIR=%~dp0"
set "SRC=%HELLO_DIR%src"
set "BIN=%HELLO_DIR%bin"

set "JAVA_HOME=C:\Program Files\Java\jdk-17"
if not exist "%JAVA_HOME%\bin\javac.exe" (
    echo [ERROR] JDK 17 compiler not found at %JAVA_HOME%\bin\javac.exe
    exit /b 1
)

set "PATH=%JAVA_HOME%\bin;%PATH%"
set "JAVAC_EXE=%JAVA_HOME%\bin\javac.exe"
set "JAVA_EXE=%JAVA_HOME%\bin\java.exe"

REM Resolve LIBS to absolute path using FOR
for %%A in ("%HELLO_DIR%..\..\libs\.") do set "LIBS=%%~fA"

echo [INFO] Source: %SRC%
echo [INFO] Output: %BIN%
echo [INFO] Libraries: %LIBS%
echo.

REM Clean old build
if exist "%BIN%" rmdir /s /q "%BIN%" >nul 2>&1
mkdir "%BIN%" >nul 2>&1

REM Compile all Java files from src directory with Java 17
echo [BUILD] Compiling with Java 17...
echo [INFO] Using compiler: %JAVAC_EXE%
echo [INFO] Using runtime: %JAVA_EXE%

REM Create a temporary file list to avoid wildcard expansion issues
setlocal enabledelayedexpansion
set "JAVA_FILES="

for /r "%SRC%" %%F in (*.java) do (
    set "JAVA_FILES=!JAVA_FILES! "%%F""
)

echo [BUILD] Found Java files: !JAVA_FILES!

"%JAVAC_EXE%" -d "%BIN%" -encoding UTF-8 -source 17 -target 17 -cp "%LIBS%\*" !JAVA_FILES! 2>&1

if errorlevel 1 (
    echo [ERROR] Compilation failed!
    exit /b 1
)

if not exist "%BIN%\com\teamcenter\hello\Hello.class" (
    echo [ERROR] Hello.class not created!
    exit /b 1
)

echo [SUCCESS] HelloTeamcenter compiled!
echo.
echo Created: %BIN%\com\teamcenter\hello\Hello.class
echo.

