import importlib.util
import sqlite3
from pathlib import Path

spec = importlib.util.spec_from_file_location("monitoring_under_test", Path(__file__).parents[1] / "app" / "monitoring.py")
monitoring = importlib.util.module_from_spec(spec)
spec.loader.exec_module(monitoring)


def test_checks_do_not_create_database(tmp_path):
    path = tmp_path / "missing.db"
    assert set(monitoring.read_checks(path).values()) == {"full_outage"}
    assert not path.exists()


def test_components_use_independent_tables(tmp_path):
    path = tmp_path / "test.db"
    with sqlite3.connect(path) as conn:
        for table in ("products", "product_variants", "carts", "orders"):
            conn.execute(f"CREATE TABLE {table} (id INTEGER)")
    assert monitoring.read_checks(path) == {"catalog": "operational", "orders": "operational", "payments": "full_outage"}


def test_expected_denials_are_not_service_failures():
    traffic = monitoring.Traffic()
    traffic.observe("orders", 429, 20)
    traffic.observe("orders", 401, 20)
    assert traffic.report("orders")["requests"] == 0
    assert traffic.report("orders")["limited"] == 1
    for _ in range(3):
        traffic.observe("orders", 502, 100)
    assert traffic.report("orders")["status"] == "partial_outage"
