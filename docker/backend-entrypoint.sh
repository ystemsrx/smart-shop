#!/bin/sh
set -eu

APP_USER="app"
APP_GROUP="app"
RUNTIME_DIRS="
/app/backend/data
/app/backend/items
/app/backend/logs
/app/backend/exports
/app/public
"

if [ "$(id -u)" = "0" ]; then
    for runtime_dir in $RUNTIME_DIRS; do
        mkdir -p "$runtime_dir"
        chown -R "$APP_USER:$APP_GROUP" "$runtime_dir"
    done

    exec gosu "$APP_USER:$APP_GROUP" "$@"
fi

exec "$@"
