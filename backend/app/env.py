"""Load the project environment file for command-line tools."""
import logging
from pathlib import Path

from dotenv import load_dotenv

log = logging.getLogger(__name__)


def load_project_env(path: Path) -> None:
    if not path.exists():
        return
    try:
        load_dotenv(path, encoding="utf-8")
    except UnicodeDecodeError:
        log.warning("Environment file is not UTF-8; trying Windows-1252 encoding")
        load_dotenv(path, encoding="cp1252")
