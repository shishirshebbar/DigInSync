"""Load the supplied BBMP work order and grievance CSVs into PostgreSQL.

Run from backend/: python -m data.ingest.bbmp_data
The files are read from the repository's data/raw directory. Neither dataset
contains coordinates; their geometry is intentionally left NULL.
"""
import logging
import os
import uuid
from contextlib import closing
from pathlib import Path

import pandas as pd
import psycopg2
from psycopg2.extras import execute_values

from app.env import load_project_env

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parents[3]
RAW_DIR = ROOT / "data" / "raw"
NAMESPACE = uuid.UUID("77c30b1c-97c0-4210-85d8-18971e28b856")


def read_csv(path: Path, columns: list[str], key: str) -> pd.DataFrame:
    if not path.is_file():
        raise FileNotFoundError(f"Required BBMP CSV not found: {path}")
    df = pd.read_csv(path, dtype=str, keep_default_na=False, encoding="utf-8-sig")
    missing = sorted(set(columns) - set(df.columns))
    if missing:
        raise ValueError(f"{path.name} is missing required columns: {', '.join(missing)}")
    df = df[columns].copy()
    if df.empty:
        raise ValueError(f"{path.name} has no records")
    df[key] = df[key].str.strip()
    if (df[key] == "").any() or df[key].duplicated().any():
        raise ValueError(f"{path.name} has empty or duplicate {key} values")
    return df


def nullable(value: str) -> str | None:
    return value.strip() or None


def row_id(dataset: str, source_key: str) -> str:
    return str(uuid.uuid5(NAMESPACE, f"{dataset}:{source_key}"))


def prepare_work_orders(path: Path) -> list[tuple]:
    # Work order IDs repeat in the source; slno uniquely identifies each row.
    df = read_csv(path, ["slno", "id", "ward", "wodetails"], "slno")
    if (df["id"].str.strip() == "").any():
        raise ValueError(f"{path.name} has empty work order IDs")
    return [
        (row_id("work_orders", slno), source_id.strip(), "BBMP",
         nullable(ward), nullable(description))
        for slno, source_id, ward, description in df.itertuples(index=False, name=None)
    ]


def prepare_grievances(path: Path) -> list[tuple]:
    columns = ["Complaint ID", "Category", "Grievance Date", "Ward Name", "Grievance Status"]
    df = read_csv(path, columns, "Complaint ID")
    dates = pd.to_datetime(df["Grievance Date"], errors="coerce")
    invalid = (df["Grievance Date"].str.strip() != "") & dates.isna()
    if invalid.any():
        raise ValueError(f"{path.name} contains {invalid.sum()} invalid grievance dates")
    return [
        (row_id("grievances", source_id), source_id, nullable(category),
         timestamp.date() if pd.notna(timestamp) else None,
         nullable(ward), nullable(status))
        for (source_id, category, _, ward, status), timestamp in
        zip(df.itertuples(index=False, name=None), dates)
    ]


def load_records(cur, work_orders: list[tuple], grievances: list[tuple]) -> None:
    if work_orders:
        execute_values(cur, """
            INSERT INTO historical_work_orders (id, source_id, organization, ward, description)
            VALUES %s
            ON CONFLICT (id) DO UPDATE SET
                source_id = EXCLUDED.source_id, organization = EXCLUDED.organization,
                ward = EXCLUDED.ward, description = EXCLUDED.description
        """, work_orders, page_size=1000)
    if grievances:
        execute_values(cur, """
            INSERT INTO grievances (id, source_id, category, date, ward, status)
            VALUES %s
            ON CONFLICT (id) DO UPDATE SET
                source_id = EXCLUDED.source_id, category = EXCLUDED.category,
                date = EXCLUDED.date, ward = EXCLUDED.ward, status = EXCLUDED.status
        """, grievances, page_size=1000)


def main() -> None:
    load_project_env(ROOT / ".env.local")
    db_url = os.environ.get("DATABASE_SYNC_URL")
    if not db_url:
        raise RuntimeError("DATABASE_SYNC_URL must be set in the environment or .env.local")

    work_orders = prepare_work_orders(RAW_DIR / "work_orders.csv")
    grievances = prepare_grievances(RAW_DIR / "grievances.csv")
    log.info("Prepared %d work order rows and %d grievance rows", len(work_orders), len(grievances))
    with closing(psycopg2.connect(db_url)) as conn:
        with conn:
            with conn.cursor() as cur:
                load_records(cur, work_orders, grievances)
    log.info("BBMP data committed; source records have no geometry")


if __name__ == "__main__":
    main()
