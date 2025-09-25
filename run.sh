#!/bin/bash
# One-click build and background startup for frontend service

cd "$(dirname "$0")"

# Build project (foreground execution for viewing build logs)
npm run build

# Start service in background
nohup npm start > frontend.log 2>&1 &

echo "Frontend service started in background, check logs in frontend.log"