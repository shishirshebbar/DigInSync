"""
Master data pipeline — runs all ingestion steps in order.

Usage:
    # 1. Make sure your .env.local has DATABASE_SYNC_URL set
    # 2. Make sure migrations have been applied:  alembic upgrade head
    # 3. Run:
    python -m data.ingest.run_all

Place the supplied work_orders.csv and grievances.csv in the repository's
data/raw directory before running. BBMP ingestion does not synthesize records.
"""
import os
import sys
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

from pathlib import Path
from app.env import load_project_env

load_project_env(Path(__file__).resolve().parents[3] / ".env.local")


def main():
    db_url = os.environ.get("DATABASE_SYNC_URL")
    if not db_url:
        log.error(
            "DATABASE_SYNC_URL is not set.\n"
            "  1. Copy .env.example → .env.local\n"
            "  2. Fill in your database credentials\n"
            "  3. Run: python -m data.ingest.run_all"
        )
        sys.exit(1)

    log.info("=" * 60)
    log.info("DigInSync data pipeline starting")
    log.info("=" * 60)

    # Step 1: OSM road network
    log.info("Step 1/2 — OSM road segments")
    from data.ingest.osm_roads import main as osm_main
    osm_main()

    # Step 2: BBMP public data
    log.info("Step 2/2 — BBMP data (work orders, repairs, potholes, grievances)")
    from data.ingest.bbmp_data import main as bbmp_main
    bbmp_main()

    log.info("=" * 60)
    log.info("Data pipeline complete")
    log.info("=" * 60)


if __name__ == "__main__":
    main()
