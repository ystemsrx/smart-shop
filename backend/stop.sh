#!/bin/bash

set -e

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Load environment variables from parent directory
ENV_FILE="${SCRIPT_DIR%/}/../.env"
if [ -f "$ENV_FILE" ]; then
    set -a
    # shellcheck disable=SC1090
    . "$ENV_FILE"
    set +a
fi

ENV="${ENV:-production}"
if [ "$ENV" = "devlopment" ]; then
    ENV="development"
fi

BACKEND_PORT="${BACKEND_PORT:-9099}"
DEV_BACKEND_PORT="${DEV_BACKEND_PORT:-$BACKEND_PORT}"

if [ "$ENV" = "development" ]; then
    PORT="$DEV_BACKEND_PORT"
else
    PORT="$BACKEND_PORT"
fi

echo "Stopping Dormitory Smart Shop API on port $PORT..."
fuser -k "$PORT/tcp" 2>/dev/null && echo "Process on port $PORT stopped successfully." || echo "No process found on port $PORT."