#!/bin/bash

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

BACKEND_PORT="${BACKEND_PORT:-9099}"
DEV_BACKEND_PORT="${DEV_BACKEND_PORT:-$BACKEND_PORT}"

if [ "$ENV" = "development" ]; then
    PORT="$DEV_BACKEND_PORT"
else
    PORT="$BACKEND_PORT"
fi

echo "Stopping Dormitory Smart Shop API on port $PORT..."
fuser -k "$PORT/tcp" 2>/dev/null && echo "Process on port $PORT stopped successfully." || echo "No process found on port $PORT."