@echo off
setlocal

REM =================================================================
REM == 宿舍智能小商城 - Windows 后端一键启动脚本
REM =================================================================

echo [INFO] Changing directory to script location...
pushd "%~dp0"

REM --- 配置环境变量 (如果外部没有提供，则使用默认值) ---
if not defined JWT_SECRET_KEY (
    set "JWT_SECRET_KEY=your JWT_SECRET_KEY"
)
if not defined BIGMODEL_API_KEY (
    set "BIGMODEL_API_KEY=your_api_key"
)
if not defined BIGMODEL_API_URL (
    set "BIGMODEL_API_URL=https://open.bigmodel.cn/api/paas/v4/chat/completions"
)
echo [INFO] Environment variables are set.

REM --- 检查 Python 是否安装 ---
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not found in your system's PATH.
    echo Please install Python 3 and ensure it's added to the PATH.
    pause
    exit /b 1
)

REM --- 创建虚拟环境 (如果不存在) ---
if not exist venv (
    echo [INFO] Creating Python virtual environment...
    python -m venv venv
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to create virtual environment.
        pause
        exit /b 1
    )
)

REM --- 激活虚拟环境 ---
echo [INFO] Activating virtual environment...
call venv\Scripts\activate

REM --- 安装/更新依赖 ---
echo [INFO] Installing Python dependencies from requirements.txt...
python -m pip install --upgrade pip >nul
pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install dependencies.
    pause
    exit /b 1
)

REM --- 创建必要的目录 ---
if not exist items (
    echo [INFO] Creating 'items' directory...
    mkdir items
)
if not exist logs (
    echo [INFO] Creating 'logs' directory...
    mkdir logs
)

REM --- 初始化数据库（仅首次或显式重置） ---
echo [INFO] Checking if database needs initialization...
if "%DB_RESET%"=="1" (
    echo [INFO] DB_RESET=1 detected. Resetting database...
    python init_db.py
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to reset the database.
        pause
        exit /b 1
    )
) else (
    if not exist dorm_shop.db (
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

REM --- 启动 FastAPI 应用 ---
echo ==================================================
echo [SUCCESS] Starting Dorm Shop API...
echo [INFO] Service will run at: http://0.0.0.0:8000
echo [INFO] API Documentation: http://0.0.0.0:8000/docs
echo ==================================================
uvicorn main:app --host 0.0.0.0 --port 8000 --reload --log-level debug

REM --- 脚本结束后的清理 ---
popd
endlocal
