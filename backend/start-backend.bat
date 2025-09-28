@echo off
setlocal EnableDelayedExpansion

REM =================================================================
REM == Smart Shop - Windows Backend One-Click Start Script
REM =================================================================

echo [INFO] Changing directory to script location...
pushd "%~dp0"

REM --- Load .env configuration (if exists) ---
set "ENV_FILE=%~dp0..\.env"
if exist "%ENV_FILE%" (
    for /f "usebackq tokens=1* delims==" %%A in (`findstr /R "^[A-Za-z_][A-Za-z0-9_]*=" "%ENV_FILE%"`) do (
        if not "%%A"=="" (
            set "KEY=%%A"
            set "VALUE=%%B"
            for /f "delims=" %%I in ("!VALUE!") do set "!KEY!=%%I"
        )
    )
)

if not defined ENV set "ENV=production"
if /I "!ENV!"=="devlopment" set "ENV=development"

if not defined BACKEND_HOST set "BACKEND_HOST=0.0.0.0"
if not defined BACKEND_PORT set "BACKEND_PORT=9099"
if not defined DEV_BACKEND_HOST set "DEV_BACKEND_HOST=!BACKEND_HOST!"
if not defined DEV_BACKEND_PORT set "DEV_BACKEND_PORT=!BACKEND_PORT!"
if not defined LOG_LEVEL set "LOG_LEVEL=INFO"
if not defined DEV_LOG_LEVEL set "DEV_LOG_LEVEL=DEBUG"
if not defined DB_PATH set "DB_PATH=dorm_shop.db"

set "DB_FILE=!DB_PATH!"
if not "!DB_FILE:~1,1!"==":" (
    set "DB_FILE=%CD%\!DB_FILE!"
)

if /I "!ENV!"=="development" (
    set "HOST=!DEV_BACKEND_HOST!"
    set "PORT=!DEV_BACKEND_PORT!"
    set "RUNTIME_LOG_LEVEL=!DEV_LOG_LEVEL!"
    set "MODE_LABEL=Starting in development mode..."
    set "IS_DEV=1"
) else (
    set "HOST=!BACKEND_HOST!"
    set "PORT=!BACKEND_PORT!"
    set "RUNTIME_LOG_LEVEL=!LOG_LEVEL!"
    set "MODE_LABEL=Starting in production mode..."
    set "IS_DEV=0"
)

REM --- Check if Python is installed ---
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not found in your system's PATH.
    echo Please install Python 3 and ensure it's added to the PATH.
    pause
    exit /b 1
)

REM --- Create virtual environment (if it doesn't exist) ---
if not exist venv (
    echo [INFO] Creating Python virtual environment...
    python -m venv venv
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to create virtual environment.
        pause
        exit /b 1
    )
)

REM --- Activate virtual environment ---
echo [INFO] Activating virtual environment...
call venv\Scripts\activate

REM --- Install/update dependencies ---
echo [INFO] Installing Python dependencies from requirements.txt...
python -m pip install --upgrade pip >nul
pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install dependencies.
    pause
    exit /b 1
)

REM --- Create necessary directories ---
if not exist items (
    echo [INFO] Creating 'items' directory...
    mkdir items
)
if not exist logs (
    echo [INFO] Creating 'logs' directory...
    mkdir logs
)

REM --- Initialize database (first time only or explicit reset) ---
echo [INFO] Checking if database needs initialization...
if "!DB_RESET!"=="1" (
    echo [INFO] DB_RESET=1 detected. Resetting database...
    python init_db.py
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to reset the database.
        pause
        exit /b 1
    )
) else (
    if not exist "!DB_FILE!" (
        echo [INFO] First run detected. Initializing database...
        python init_db.py
        if %errorlevel% neq 0 (
            echo [ERROR] Failed to initialize the database.
            pause
            exit /b 1
        )
    ) else (
        echo [INFO] Existing database found. Skipping initialization.
    )
)

REM --- Calculate runtime parameters ---
set "LOG_LEVEL_LOWER=!RUNTIME_LOG_LEVEL!"
if /I "!LOG_LEVEL_LOWER!"=="DEBUG" set "LOG_LEVEL_LOWER=debug"
if /I "!LOG_LEVEL_LOWER!"=="INFO" set "LOG_LEVEL_LOWER=info"
if /I "!LOG_LEVEL_LOWER!"=="WARNING" set "LOG_LEVEL_LOWER=warning"
if /I "!LOG_LEVEL_LOWER!"=="ERROR" set "LOG_LEVEL_LOWER=error"
if /I "!LOG_LEVEL_LOWER!"=="CRITICAL" set "LOG_LEVEL_LOWER=critical"
if /I "!LOG_LEVEL_LOWER!"=="TRACE" set "LOG_LEVEL_LOWER=trace"

set "UVICORN_CMD=python main.py"
if "!IS_DEV!"=="1" (
    set "UVICORN_CMD=python main.py"
) else (
    set "UVICORN_CMD=python main.py"
)

REM --- Start FastAPI application ---
echo ==================================================
echo [SUCCESS] Starting Dorm Shop API...
echo [INFO] Service will run at: http://!HOST!:!PORT!
echo [INFO] API Documentation: http://!HOST!:!PORT!/docs
echo [INFO] !MODE_LABEL!
echo ==================================================
%UVICORN_CMD%

REM --- Cleanup after script ends ---
popd
endlocal