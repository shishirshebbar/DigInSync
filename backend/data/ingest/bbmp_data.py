"""
BBMP public data ingestion — work orders, road repairs, potholes, grievances.

Data sources (OpenCity / BBMP open data):
  - https://data.opencity.in/dataset/bbmp-work-orders
  - https://data.opencity.in/dataset/bbmp-road-repairs
  - https://data.opencity.in/dataset/bbmp-pothole-complaints
  - https://data.opencity.in/dataset/bbmp-grievances

Each dataset is a CSV. Place downloaded files under:
  data/raw/bbmp/work_orders.csv
  data/raw/bbmp/road_repairs.csv
  data/raw/bbmp/potholes.csv
  data/raw/bbmp/grievances.csv

If files are not present, the script generates representative synthetic seed data
so development can proceed immediately.

Usage:
    python -m data.ingest.bbmp_data
"""
import os
import sys
import uuid
import logging
import random
from datetime import date, timedelta
from pathlib import Path

import pandas as pd
import psycopg2
from psycopg2.extras import execute_values

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger(__name__)

RAW_DIR = Path(__file__).parents[2] / "data" / "raw" / "bbmp"
RAW_DIR.mkdir(parents=True, exist_ok=True)

# Bengaluru bbox for synthetic point generation
BBOX = {"min_lon": 77.45, "max_lon": 77.78, "min_lat": 12.83, "max_lat": 13.08}

WARDS = [
    "Koramangala", "Indiranagar", "Jayanagar", "Rajajinagar", "Whitefield",
    "Electronic City", "Hebbal", "Yelahanka", "Banashankari", "BTM Layout",
    "Marathahalli", "HSR Layout", "Bellandur", "Sarjapur", "Basavanagudi",
]

WORK_TYPES = [
    "water_pipeline", "telecom", "electricity", "road_repair",
    "drainage", "utility_maintenance", "street_light",
]

ORGANIZATIONS = [
    "BBMP", "BWSSB", "BESCOM", "BMTC", "BSNL", "Jio Infra",
    "Airtel Networks", "BBMP Roads", "BBMP Drainage",
]

REPAIR_TYPES = ["pothole_filling", "resurfacing", "patching", "full_reconstruction"]
GRIEVANCE_CATS = ["road_damage", "waterlogging", "broken_footpath", "missing_manhole", "encroachment"]
STATUSES = ["OPEN", "IN_PROGRESS", "CLOSED"]


def _rand_point():
    lon = random.uniform(BBOX["min_lon"], BBOX["max_lon"])
    lat = random.uniform(BBOX["min_lat"], BBOX["max_lat"])
    return lon, lat


def _rand_date(start_year=2022, end_year=2025) -> date:
    start = date(start_year, 1, 1)
    end = date(end_year, 12, 31)
    return start + timedelta(days=random.randint(0, (end - start).days))


# ── Synthetic generators ──────────────────────────────────────────────────────
def _gen_work_orders(n=2000) -> pd.DataFrame:
    rows = []
    for i in range(n):
        lon, lat = _rand_point()
        rows.append({
            "source_id": f"WO-{i+1:05d}",
            "organization": random.choice(ORGANIZATIONS),
            "work_type": random.choice(WORK_TYPES),
            "ward": random.choice(WARDS),
            "description": f"Work order {i+1}",
            "date": _rand_date().isoformat(),
            "latitude": lat,
            "longitude": lon,
        })
    return pd.DataFrame(rows)


def _gen_road_repairs(n=1500) -> pd.DataFrame:
    rows = []
    for i in range(n):
        lon, lat = _rand_point()
        rows.append({
            "source_id": f"RR-{i+1:05d}",
            "repair_type": random.choice(REPAIR_TYPES),
            "status": random.choice(STATUSES),
            "date": _rand_date().isoformat(),
            "latitude": lat,
            "longitude": lon,
        })
    return pd.DataFrame(rows)


def _gen_potholes(n=3000) -> pd.DataFrame:
    rows = []
    for i in range(n):
        lon, lat = _rand_point()
        rows.append({
            "source_id": f"PH-{i+1:05d}",
            "reported_date": _rand_date().isoformat(),
            "status": random.choice(STATUSES),
            "latitude": lat,
            "longitude": lon,
        })
    return pd.DataFrame(rows)


def _gen_grievances(n=2500) -> pd.DataFrame:
    rows = []
    for i in range(n):
        lon, lat = _rand_point()
        rows.append({
            "source_id": f"GR-{i+1:05d}",
            "category": random.choice(GRIEVANCE_CATS),
            "date": _rand_date().isoformat(),
            "status": random.choice(STATUSES),
            "latitude": lat,
            "longitude": lon,
        })
    return pd.DataFrame(rows)


# ── CSV readers (real files) ──────────────────────────────────────────────────
def _read_or_generate(filename: str, generator, required_cols: list[str]) -> pd.DataFrame:
    path = RAW_DIR / filename
    if path.exists():
        log.info("Reading real data: %s", path)
        df = pd.read_csv(path, low_memory=False)
        # Normalize column names
        df.columns = [c.lower().strip().replace(" ", "_") for c in df.columns]
        missing = [c for c in required_cols if c not in df.columns]
        if missing:
            log.warning("Columns missing in %s: %s — falling back to synthetic", filename, missing)
            return generator()
        return df
    else:
        log.info("No real data at %s — using synthetic seed data", path)
        return generator()


def _normalize_latlon(df: pd.DataFrame) -> pd.DataFrame:
    """Accept latitude/lat/y and longitude/lon/long/x column variants."""
    for lat_col in ("latitude", "lat", "y"):
        if lat_col in df.columns:
            df = df.rename(columns={lat_col: "latitude"})
            break
    for lon_col in ("longitude", "lon", "long", "x"):
        if lon_col in df.columns:
            df = df.rename(columns={lon_col: "longitude"})
            break
    # Drop rows without coordinates
    df = df.dropna(subset=["latitude", "longitude"])
    df["latitude"] = pd.to_numeric(df["latitude"], errors="coerce")
    df["longitude"] = pd.to_numeric(df["longitude"], errors="coerce")
    df = df.dropna(subset=["latitude", "longitude"])
    # Filter to Bengaluru bbox
    df = df[
        (df["longitude"] >= BBOX["min_lon"]) & (df["longitude"] <= BBOX["max_lon"]) &
        (df["latitude"] >= BBOX["min_lat"]) & (df["latitude"] <= BBOX["max_lat"])
    ]
    return df


def _safe_date(val) -> str | None:
    if pd.isna(val):
        return None
    try:
        return pd.to_datetime(str(val), dayfirst=True).strftime("%Y-%m-%d")
    except Exception:
        return None


# ── DB loaders ────────────────────────────────────────────────────────────────
def _load_work_orders(df: pd.DataFrame, cur):
    df = _normalize_latlon(df)
    rows = []
    for _, r in df.iterrows():
        rows.append((
            str(uuid.uuid4()),
            str(r.get("source_id", "")),
            str(r.get("organization", "")),
            str(r.get("work_type", "")),
            str(r.get("ward", "")),
            str(r.get("description", ""))[:500],
            _safe_date(r.get("date")),
            float(r["longitude"]),
            float(r["latitude"]),
        ))
    execute_values(cur, """
        INSERT INTO historical_work_orders
            (id, source_id, organization, work_type, ward, description, date, geometry)
        SELECT d.id, d.source_id, d.organization, d.work_type, d.ward, d.description,
               d.date::date,
               ST_SetSRID(ST_MakePoint(d.lon, d.lat), 4326)
        FROM (VALUES %s) AS d(id, source_id, organization, work_type, ward, description, date, lon, lat)
        ON CONFLICT DO NOTHING
    """, rows)
    log.info("Loaded %d work orders", len(rows))


def _load_road_repairs(df: pd.DataFrame, cur):
    df = _normalize_latlon(df)
    rows = []
    for _, r in df.iterrows():
        rows.append((
            str(uuid.uuid4()),
            str(r.get("source_id", "")),
            str(r.get("repair_type", "")),
            str(r.get("status", "")),
            _safe_date(r.get("date")),
            float(r["longitude"]),
            float(r["latitude"]),
        ))
    execute_values(cur, """
        INSERT INTO road_repairs (id, source_id, repair_type, status, date, geometry)
        SELECT d.id, d.source_id, d.repair_type, d.status,
               d.date::date,
               ST_SetSRID(ST_MakePoint(d.lon, d.lat), 4326)
        FROM (VALUES %s) AS d(id, source_id, repair_type, status, date, lon, lat)
        ON CONFLICT DO NOTHING
    """, rows)
    log.info("Loaded %d road repairs", len(rows))


def _load_potholes(df: pd.DataFrame, cur):
    df = _normalize_latlon(df)
    rows = []
    for _, r in df.iterrows():
        rows.append((
            str(uuid.uuid4()),
            str(r.get("source_id", "")),
            _safe_date(r.get("reported_date")),
            str(r.get("status", "")),
            float(r["longitude"]),
            float(r["latitude"]),
        ))
    execute_values(cur, """
        INSERT INTO potholes (id, source_id, reported_date, status, geometry)
        SELECT d.id, d.source_id, d.reported_date::date, d.status,
               ST_SetSRID(ST_MakePoint(d.lon, d.lat), 4326)
        FROM (VALUES %s) AS d(id, source_id, reported_date, status, lon, lat)
        ON CONFLICT DO NOTHING
    """, rows)
    log.info("Loaded %d potholes", len(rows))


def _load_grievances(df: pd.DataFrame, cur):
    df = _normalize_latlon(df)
    rows = []
    for _, r in df.iterrows():
        rows.append((
            str(uuid.uuid4()),
            str(r.get("source_id", "")),
            str(r.get("category", "")),
            _safe_date(r.get("date")),
            str(r.get("status", "")),
            float(r["longitude"]),
            float(r["latitude"]),
        ))
    execute_values(cur, """
        INSERT INTO grievances (id, source_id, category, date, status, geometry)
        SELECT d.id, d.source_id, d.category, d.date::date, d.status,
               ST_SetSRID(ST_MakePoint(d.lon, d.lat), 4326)
        FROM (VALUES %s) AS d(id, source_id, category, date, status, lon, lat)
        ON CONFLICT DO NOTHING
    """, rows)
    log.info("Loaded %d grievances", len(rows))


# ── Feature engineering ───────────────────────────────────────────────────────
def compute_segment_features(cur):
    """
    Pre-compute ML feature counts per road segment using PostGIS ST_DWithin.
    Radius = 100m around each segment centroid.
    """
    log.info("Computing road segment features…")
    cur.execute("TRUNCATE road_segment_features")
    cur.execute("""
        INSERT INTO road_segment_features
            (road_segment_id, historical_work_orders, historical_road_repairs,
             pothole_count, grievance_count)
        SELECT
            rs.id,
            (SELECT COUNT(*) FROM historical_work_orders wo
             WHERE wo.geometry IS NOT NULL
               AND ST_DWithin(wo.geometry::geography,
                              ST_Centroid(rs.geometry)::geography, 100)) AS work_orders,
            (SELECT COUNT(*) FROM road_repairs rr
             WHERE rr.geometry IS NOT NULL
               AND ST_DWithin(rr.geometry::geography,
                              ST_Centroid(rs.geometry)::geography, 100)) AS road_repairs,
            (SELECT COUNT(*) FROM potholes p
             WHERE p.geometry IS NOT NULL
               AND ST_DWithin(p.geometry::geography,
                              ST_Centroid(rs.geometry)::geography, 100)) AS potholes,
            (SELECT COUNT(*) FROM grievances g
             WHERE g.geometry IS NOT NULL
               AND ST_DWithin(g.geometry::geography,
                              ST_Centroid(rs.geometry)::geography, 100)) AS grievances
        FROM road_segments rs
    """)
    log.info("Feature computation complete")


# ── Entry point ───────────────────────────────────────────────────────────────
def main():
    db_url = os.environ.get("DATABASE_SYNC_URL")
    if not db_url:
        log.error("DATABASE_SYNC_URL not set. Copy .env.example → .env.local and set it.")
        sys.exit(1)

    wo_df = _read_or_generate("work_orders.csv", _gen_work_orders,
                               ["source_id", "latitude", "longitude"])
    rr_df = _read_or_generate("road_repairs.csv", _gen_road_repairs,
                               ["source_id", "latitude", "longitude"])
    ph_df = _read_or_generate("potholes.csv", _gen_potholes,
                               ["source_id", "latitude", "longitude"])
    gr_df = _read_or_generate("grievances.csv", _gen_grievances,
                               ["source_id", "latitude", "longitude"])

    conn = psycopg2.connect(db_url)
    cur = conn.cursor()

    cur.execute("TRUNCATE historical_work_orders, road_repairs, potholes, grievances CASCADE")

    _load_work_orders(wo_df, cur)
    _load_road_repairs(rr_df, cur)
    _load_potholes(ph_df, cur)
    _load_grievances(gr_df, cur)

    compute_segment_features(cur)

    conn.commit()
    cur.close()
    conn.close()
    log.info("BBMP data ingestion complete")


if __name__ == "__main__":
    main()
