"""Import Bengaluru-area OSM road ways without deleting existing records.

Run from backend/: python -m data.ingest.osm_roads
Data: OpenStreetMap contributors, via download.openstreetmap.fr (ODbL).
"""
import logging
import os
import uuid
from contextlib import closing
from pathlib import Path

import osmium
import psycopg2
import requests
from psycopg2.extras import execute_values
from shapely.wkb import loads as wkb_loads
from tqdm import tqdm

from app.env import load_project_env

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parents[3]
OSM_URL = "https://download.openstreetmap.fr/extracts/asia/india/karnataka.osm.pbf"
PBF_PATH = ROOT / "data" / "raw" / "osm" / "karnataka.osm.pbf"
NAMESPACE = uuid.UUID("808d981b-8766-4337-81f4-304971d4f5b0")
BBOX = {"min_lon": 77.45, "max_lon": 77.78, "min_lat": 12.83, "max_lat": 13.08}
HIGHWAY_INCLUDE = {
    "motorway", "trunk", "primary", "secondary", "tertiary",
    "unclassified", "residential", "service",
    "motorway_link", "trunk_link", "primary_link", "secondary_link", "tertiary_link",
}
ROAD_WIDTH_MAP = {
    "motorway": 14.0, "trunk": 12.0, "primary": 10.0, "secondary": 8.0,
    "tertiary": 7.0, "unclassified": 6.0, "residential": 5.0, "service": 4.0,
}


def download_pbf():
    if PBF_PATH.exists():
        log.info("Using existing OSM extract: %s", PBF_PATH)
        return
    PBF_PATH.parent.mkdir(parents=True, exist_ok=True)
    partial = PBF_PATH.with_suffix(".pbf.part")
    log.info("Downloading public OSM extract from %s", OSM_URL)
    try:
        with requests.get(OSM_URL, stream=True, timeout=(30, 300)) as response:
            response.raise_for_status()
            expected = int(response.headers.get("content-length", 0))
            with partial.open("wb") as file, tqdm(
                total=expected or None, unit="B", unit_scale=True
            ) as progress:
                for chunk in response.iter_content(chunk_size=1024 * 1024):
                    if chunk:
                        file.write(chunk)
                        progress.update(len(chunk))
        if not partial.stat().st_size or (expected and partial.stat().st_size != expected):
            raise ValueError("OSM download was empty or incomplete")
        partial.replace(PBF_PATH)
    finally:
        if partial.exists():
            partial.unlink()


class RoadHandler(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.roads = []
        self.invalid_geometry = 0
        self._wkb = osmium.geom.WKBFactory()

    def way(self, way):
        highway = way.tags.get("highway")
        if highway not in HIGHWAY_INCLUDE:
            return
        try:
            geometry = wkb_loads(bytes.fromhex(self._wkb.create_linestring(way)))
        except (osmium.InvalidLocationError, RuntimeError, ValueError):
            self.invalid_geometry += 1
            return
        lon, lat = geometry.centroid.x, geometry.centroid.y
        if not (BBOX["min_lon"] <= lon <= BBOX["max_lon"] and
                BBOX["min_lat"] <= lat <= BBOX["max_lat"]):
            return
        name = way.tags.get("name") or way.tags.get("name:en") or way.tags.get("ref") or f"OSM-{way.id}"
        try:
            width = float(way.tags.get("width")) if way.tags.get("width") else ROAD_WIDTH_MAP.get(highway)
        except ValueError:
            width = ROAD_WIDTH_MAP.get(highway)
        self.roads.append((str(way.id), name, highway, width, geometry.wkt))


def load_roads(roads, db_url):
    if not roads:
        raise ValueError("No roads found; refusing to import an empty extract")
    # psycopg2 misparses URLs with a dotted username (e.g. Supabase pooler).
    # Parse manually and pass keyword arguments to avoid the issue.
    from urllib.parse import urlparse, unquote
    parsed = urlparse(db_url)
    connect_kwargs = {
        "host": parsed.hostname,
        "port": parsed.port or 5432,
        "dbname": parsed.path.lstrip("/"),
        "user": unquote(parsed.username or ""),
        "password": unquote(parsed.password or ""),
        "sslmode": "require",
    }
    with closing(psycopg2.connect(**connect_kwargs)) as conn:
        with conn:
            with conn.cursor() as cur:
                cur.execute("SELECT osm_id, id FROM road_segments WHERE osm_id IS NOT NULL")
                existing = {}
                for osm_id, record_id in cur:
                    if osm_id in existing:
                        raise ValueError(f"Duplicate existing OSM way ID: {osm_id}")
                    existing[osm_id] = record_id
                rows = [
                    (existing.get(osm_id) or str(uuid.uuid5(NAMESPACE, osm_id)),
                     osm_id, name, highway, width, wkt)
                    for osm_id, name, highway, width, wkt in roads
                ]
                execute_values(cur, """
                    INSERT INTO road_segments
                        (id, osm_id, road_name, road_type, road_width, geometry, length_m)
                    SELECT d.id, d.osm_id, d.name, d.highway, d.width::double precision,
                           ST_GeomFromText(d.wkt, 4326),
                           ST_Length(ST_GeomFromText(d.wkt, 4326)::geography)
                    FROM (VALUES %s) AS d(id, osm_id, name, highway, width, wkt)
                    ON CONFLICT (id) DO UPDATE SET
                        road_name = EXCLUDED.road_name, road_type = EXCLUDED.road_type,
                        road_width = EXCLUDED.road_width, geometry = EXCLUDED.geometry,
                        length_m = EXCLUDED.length_m
                """, rows, page_size=500)
    log.info("Imported or updated %d OSM road ways", len(roads))


def main():
    load_project_env(ROOT / ".env.local")
    db_url = os.environ.get("DATABASE_SYNC_URL")
    if not db_url:
        raise RuntimeError("DATABASE_SYNC_URL must be set in the environment or .env.local")
    download_pbf()
    handler = RoadHandler()
    handler.apply_file(str(PBF_PATH), locations=True)
    log.info("Found %d roads; skipped %d invalid geometries", len(handler.roads), handler.invalid_geometry)
    load_roads(handler.roads, db_url)


if __name__ == "__main__":
    main()
