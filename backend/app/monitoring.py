"""Optional, read-only status reports. No outbound requests or user data."""
import hmac
import os
import sqlite3
import time
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock

from fastapi import Request
from starlette.responses import JSONResponse, Response
from starlette.concurrency import run_in_threadpool


def read_checks(db_path):
    result = {}
    # SQLite URI read-only mode must fail instead of creating an empty database.
    try:
        with sqlite3.connect(Path(db_path).resolve().as_uri() + "?mode=ro", uri=True, timeout=2) as conn:
            conn.execute("PRAGMA query_only=ON")
            for name, tables in {"catalog": ("products", "product_variants"), "orders": ("carts", "orders"), "payments": ("payment_qr_codes", "orders")}.items():
                try:
                    for table in tables:
                        conn.execute(f"SELECT 1 FROM {table} LIMIT 1").fetchone()
                    result[name] = "operational"
                except sqlite3.Error:
                    result[name] = "full_outage"
    except sqlite3.Error:
        result = {name: "full_outage" for name in ("catalog", "orders", "payments")}
    return result


class Traffic:
    def __init__(self):
        self.lock = Lock()
        self.values = {name: deque(maxlen=10000) for name in ("catalog", "orders", "payments")}

    def observe(self, name, status, duration):
        if name not in self.values:
            return
        with self.lock:
            self.values[name].append((time.monotonic(), status, duration))

    def report(self, name):
        with self.lock:
            rows = [row for row in self.values[name] if row[0] > time.monotonic() - 300]
        durations = sorted(row[2] for row in rows if row[1] < 400 or row[1] >= 500)
        errors = sum(row[1] >= 500 for row in rows)
        result = {"requests": len(durations), "errors": errors, "limited": sum(row[1] == 429 for row in rows), "windowSeconds": 300}
        if durations:
            result["p95Ms"] = round(durations[(len(durations)*95+99)//100-1])
            result["successPercentage"] = 100*(1-errors/len(durations))
        if len(rows) >= 10000:
            result["status"] = "no_data"
        elif len(durations) >= 20 or (errors >= 3 and errors == len(durations)):
            if errors / len(durations) >= 0.5:
                result["status"] = "partial_outage"
            elif errors / len(durations) >= 0.05 or result["p95Ms"] >= 5000:
                result["status"] = "degraded_performance"
        return result


def install_monitoring(app):
    token = os.getenv("STATUS_MONITOR_TOKEN", "")
    if len(token) < 32:
        return
    from database.config import DB_PATH
    traffic = Traffic()

    @app.middleware("http")
    async def observe(request, call_next):
        path = request.url.path
        name = "payments" if "payment" in path else "orders" if path.startswith(("/orders", "/cart")) else "catalog" if path.startswith(("/products", "/categories")) else None
        start = time.monotonic()
        status = 500
        try:
            response = await call_next(request)
            status = response.status_code
            return response
        finally:
            traffic.observe(name, status, (time.monotonic()-start)*1000)

    @app.get("/internal/monitoring/v1/state", include_in_schema=False)
    async def report(request: Request):
        if not hmac.compare_digest(request.headers.get("authorization", "").encode(), f"Bearer {token}".encode()):
            return Response(status_code=404)
        checks = await run_in_threadpool(read_checks, DB_PATH)
        components = {}
        for name, status in checks.items():
            evidence = traffic.report(name)
            components[name] = {"status": status, **evidence}
            if status == "full_outage":
                components[name]["status"] = status
        return JSONResponse({"version": 1, "observedAt": datetime.now(timezone.utc).isoformat(), "components": components}, headers={"Cache-Control": "no-store"})
