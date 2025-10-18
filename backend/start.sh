#!/bin/bash
# /backend/start.sh - Smart Shop Backend Startup Script

set -e

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Safe function to load .env file
load_env_safe() {
    local env_file="$1"
    if [ ! -f "$env_file" ]; then
        return
    fi
    
    # Parse .env file line by line, skipping comments and empty lines
    while IFS= read -r line || [ -n "$line" ]; do
        # Skip empty lines and comments
        [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
        
        # Extract key=value pairs
        if [[ "$line" =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=[[:space:]]*(.*)[[:space:]]*$ ]]; then
            local key="${BASH_REMATCH[1]}"
            local value="${BASH_REMATCH[2]}"
            
            # Remove leading/trailing whitespace from value
            value="${value#"${value%%[![:space:]]*}"}"
            value="${value%"${value##*[![:space:]]}"}"
            
            # Remove surrounding quotes if present (both single and double)
            if [[ "$value" =~ ^\"(.*)\"$ ]] || [[ "$value" =~ ^\'(.*)\'$ ]]; then
                value="${BASH_REMATCH[1]}"
            fi
            
            # Export the variable
            export "$key=$value"
        fi
    done < "$env_file"
}

# Load environment variables from parent directory
ENV_FILE="${SCRIPT_DIR%/}/../.env"
load_env_safe "$ENV_FILE"

ENV="${ENV:-production}"
if [ "$ENV" = "devlopment" ]; then
    ENV="development"
fi

BACKEND_HOST="${BACKEND_HOST:-0.0.0.0}"
BACKEND_PORT="${BACKEND_PORT:-9099}"
DEV_BACKEND_HOST="${DEV_BACKEND_HOST:-$BACKEND_HOST}"
DEV_BACKEND_PORT="${DEV_BACKEND_PORT:-$BACKEND_PORT}"
LOG_LEVEL="${LOG_LEVEL:-INFO}"
DEV_LOG_LEVEL="${DEV_LOG_LEVEL:-DEBUG}"
DB_PATH_VALUE="${DB_PATH:-dorm_shop.db}"

# Parse database file path (supports relative paths)
if [[ "$DB_PATH_VALUE" = /* ]]; then
    DB_FILE="$DB_PATH_VALUE"
else
    DB_FILE="${SCRIPT_DIR%/}/$DB_PATH_VALUE"
fi

if [ "$ENV" = "development" ]; then
    HOST="$DEV_BACKEND_HOST"
    PORT="$DEV_BACKEND_PORT"
    RUNTIME_LOG_LEVEL="$DEV_LOG_LEVEL"
    START_MODE_LABEL="Starting in development mode..."
    IS_DEV=1
else
    HOST="$BACKEND_HOST"
    PORT="$BACKEND_PORT"
    RUNTIME_LOG_LEVEL="$LOG_LEVEL"
    START_MODE_LABEL="Starting in production mode..."
    IS_DEV=0
fi

# Create virtual environment (if not exists)
if [ ! -d "venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install dependencies
echo "Installing Python dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

# Create necessary directories
mkdir -p items
mkdir -p logs

# Initialize database (first time or explicit reset only)
echo "Checking if database initialization is needed..."
if [ "${DB_RESET}" = "1" ]; then
    echo "DB_RESET=1 detected, resetting database..."
    python init_db.py
elif [ ! -f "$DB_FILE" ]; then
    echo "First startup, initializing database..."
    python init_db.py
else
    echo "Existing database detected, skipping initialization."
fi

# Start application
echo "Starting Dormitory Smart Shop API..."
echo "Service will run on http://${HOST}:${PORT}"
echo "API documentation: http://${HOST}:${PORT}/docs"
echo "$START_MODE_LABEL"

UVICORN_CMD=(uvicorn main:app --host "$HOST" --port "$PORT" --log-level "${RUNTIME_LOG_LEVEL,,}")

if [ "$IS_DEV" -eq 1 ]; then
    UVICORN_CMD+=(--reload)
else
    UVICORN_CMD+=(--workers 4)
fi

nohup "${UVICORN_CMD[@]}" > logs/server.log 2>&1 &