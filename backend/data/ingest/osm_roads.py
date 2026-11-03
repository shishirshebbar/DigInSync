"""
OSM Bengaluru road network ingestion.

Downloads the Bengaluru city extract from Geofabrik, filters highway features,
loads them into the road_segments table via PostGIS.

Usage:
    python -m data.ingest.osm_roads

Requirements (beyond requirements.txt):
    pip install osmium requests tqdm
    (osmium = pyosmium)
"""
import os
import sys
import uuid
import logging
import requests
import osmium
from pathlib import Path
from tqdm import tqdm
import psycopg2
from psycopg2.extras import execute_values
from shapely.geometry import mapping
from shapely.wkb import loads as wkb_loads
import shapely

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────
# Karnataka state extract from Geofabrik (~130 MB). We filter to Bengaluru bbox.
OSM_URL = "https://download.geofabrik.de/asia/india/karnataka-latest.osm.pbf"
RAW_DIR = Path(__file__).parents[2] / "data" / "raw" / "osm"
PBF_PATH = RAW_DIR / "karnataka-latest.osm.pbf"

# Bengaluru bounding box (roughly)
BBOX = {
    "min_lon": 77.45,
    "max_lon": 77.78,
    "min_lat": 12.83,
    "max_lat": 13.08,
}

# OSM highway values to include
HIGHWAY_INCLUDE = {
    "motorway", "trunk", "primary", "secondary", "tertiary",
    "unclassified", "residential", "service",
    "motorway_link", "trunk_link", "primary_link", "secondary_link", "tertiary_link",
}

# Approximate road widths by type (metres)
ROAD_WIDTH_MAP = {
    "motorway": 14.0, "trunk": 12.0, "primary": 10.0, "secondary": 8.0,
    "tertiary": 7.0, "unclassified": 6.0, "residential": 5.0, "service": 4.0,
}


# ── Downloader ────────────────────────────────────────────────────────────────
def download_pbf():
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    if PBF_PATH.exists():
        log.info("PBF already downloaded: %s", PBF_PATH)
        return
    log.info("Downloading %s → %s", OSM_URL, PBF_PATH)
    with requests.get(OSM_URL, stream=True, timeout=300) as r:
        r.raise_for_status()
        total = int(r.headers.get("content-length", 0))
        with open(PBF_PATH, "wb") as f, tqdm(total=total, unit="B", unit_scale=True) as bar:
            for chunk in r.iter_content(chunk_size=1 << 20):
                f.write(chunk)
                bar.update(len(chunk))
    log.info("Download complete")


# ── OSM handler ───────────────────────────────────────────────────────────────
class RoadHandler(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.roads: list[dict] = []
        self._wkb = osmium.geom.WKBFactory()

    def way(self, w):
        tags = w.tags
        highway = tags.get("highway")
        if highway not in HIGHWAY_INCLUDE:
            return

        try:
            wkb = self._wkb.create_linestring(w)
        except Exception:
            return

        try:
            geom = wkb_loads(bytes.fromhex(wkb))
        except Exception:
            return

        # Filter to Bengaluru bbox
        lon, lat = geom.centroid.x, geom.centroid.y
        if not (BBOX["min_lon"] <= lon <= BBOX["max_lon"] and
                BBOX["min_lat"] <= lat <= BBOX["max_lat"]):
            return

        name = tags.get("name") or tags.get("name:en") or tags.get("ref") or f"OSM-{w.id}"
        width_tag = tags.get("width")
        try:
            width = float(width_tag) if width_tag else ROAD_WIDTH_MAP.get(highway)
        except ValueError:
            width = ROAD_WIDTH_MAP.get(highway)

        self.roads.append({
            "id": str(uuid.uuid4()),
            "osm_id": str(w.id),
            "road_name": name,
            "geometry_wkt": geom.wkt,
            "road_type": highway,
            "road_width": width,
            "length_m": round(
                shapely.measurement.length(
                    shapely.from_wkt(geom.wkt),
                    transformation=shapely.GeometryType,
                ) * 111_320, 1  # rough degree→metre at equator
            ) if False else None,  # length computed in PostGIS below
        })


# ── DB loader ─────────────────────────────────────────────────────────────────
def load_roads(roads: list[dict], db_url: str):
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()

    # Truncate for idempotent re-runs
    cur.execute("TRUNCATE road_segments CASCADE")

    rows = [
        (
            r["id"],
            r["road_name"],
            r["osm_id"],
            r["road_type"],
            r["road_width"],
            r["geometry_wkt"],
        )
        for r in roads
    ]

    execute_values(cur, """
        INSERT INTO road_segments (id, road_name, osm_id, road_type, road_width, geometry, length_m)
        SELECT
            d.id, d.road_name, d.osm_id, d.road_type, d.road_width,
            ST_GeomFromText(d.geom_wkt, 4326) AS geometry,
            ST_Length(ST_GeomFromText(d.geom_wkt, 4326)::geography) AS length_m
        FROM (VALUES %s) AS d(id, road_name, osm_id, road_type, road_width, geom_wkt)
    """, rows)

    conn.commit()
    cur.close()
    conn.close()
    log.info("Loaded %d road segments", len(rows))


# ── Entry point ───────────────────────────────────────────────────────────────
def main():
    db_url = os.environ.get("DATABASE_SYNC_URL")
    if not db_url:
        log.error("DATABASE_SYNC_URL not set. Copy .env.example → .env.local and set it.")
        sys.exit(1)

    download_pbf()

    log.info("Parsing OSM PBF (filtering to Bengaluru bbox)…")
    handler = RoadHandler()
    handler.apply_file(str(PBF_PATH), locations=True)
    log.info("Found %d road segments in Bengaluru bbox", len(handler.roads))

    load_roads(handler.roads, db_url)
    log.info("OSM road ingestion complete")


if __name__ == "__main__":
    main()
