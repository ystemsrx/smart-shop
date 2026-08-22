import sqlite3
import sys
import tempfile
import unittest
from contextlib import closing
from pathlib import Path
from unittest.mock import patch


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from database import bootstrap  # noqa: E402
from database import config as database_config  # noqa: E402
from database import connection as database_connection  # noqa: E402


class LegacyUserSchemaMigrationTests(unittest.TestCase):
    def test_init_database_preserves_legacy_users_before_oidc_indexes(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            database_path = Path(temp_dir) / "shop.db"
            with closing(sqlite3.connect(database_path)) as conn:
                conn.execute(
                    """
                    CREATE TABLE users (
                        id TEXT PRIMARY KEY,
                        password TEXT NOT NULL,
                        name TEXT NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                    """
                )
                conn.execute(
                    "INSERT INTO users (id, password, name) VALUES (?, ?, ?)",
                    ("20260001", "legacy-password", "Legacy User"),
                )
                conn.commit()

            with (
                patch.object(database_config, "DB_PATH", str(database_path)),
                patch.object(database_connection, "DB_PATH", str(database_path)),
                patch.object(bootstrap, "migrate_passwords_to_hash"),
            ):
                bootstrap.init_database()

            with closing(sqlite3.connect(database_path)) as conn:
                columns = {
                    row[1]: row
                    for row in conn.execute("PRAGMA table_info(users)").fetchall()
                }
                indexes = {
                    row[1]
                    for row in conn.execute("PRAGMA index_list(users)").fetchall()
                }
                user = conn.execute(
                    "SELECT id, password, name FROM users WHERE id = ?",
                    ("20260001",),
                ).fetchone()

            self.assertIn("user_id", columns)
            self.assertIn("unified_identity_id", columns)
            self.assertIn("keycloak_sub", columns)
            self.assertIn("idx_users_unified_identity_id", indexes)
            self.assertIn("idx_users_keycloak_sub", indexes)
            self.assertEqual(user, ("20260001", "legacy-password", "Legacy User"))


if __name__ == "__main__":
    unittest.main()
