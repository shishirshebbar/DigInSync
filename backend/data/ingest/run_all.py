"""
Master data pipeline — runs all ingestion steps in order.

Usage:
    # 1. Make sure your .env.local has DATABASE_SYNC_URL set
    # 2. Make sure migrations have been applied:  alembic upgrade head
    # 3. Run:
    python -m data.ingest.run_all

Optional: place real CSV files in data/raw/bbmp/ before running
to use actual BBMP data instead of synthetic seed data.
"""
import os
import sys
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

# Load .env.local if present (for running outside Docker)
try:
    from dotenv import load_dotenv
    from pathlib import Path
    env_path = Path(__file__).parents[3] / ".env.local"
    if env_path.exists():
        load_dotenv(env_path)
        log.info("Loaded .env.local")
except ImportError:
    pass


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
    try:
        from data.ingest.osm_roads import main as osm_main
        osm_main()
    except Exception as e:
        log.error("OSM ingestion failed: %s", e)
        log.warning("Continuing without OSM data — road_segments table will be empty")

    # Step 2: BBMP public data
    log.info("Step 2/2 — BBMP data (work orders, repairs, potholes, grievances)")
    from data.ingest.bbmp_data import main as bbmp_main
    bbmp_main()

    log.info("=" * 60)
    log.info("Data pipeline complete")
    log.info("=" * 60)


if __name__ == "__main__":
    main()
