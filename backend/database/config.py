import logging

from config import get_settings

logger = logging.getLogger("database")
settings = get_settings()

DB_PATH = str(settings.db_path)
_DB_WAS_RESET = False
