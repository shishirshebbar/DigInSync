"""Import a small real OSM road subset: python -m data.ingest.osm_local."""
import argparse
import hashlib
import json
import math
import os
from datetime import datetime, timezone
from pathlib import Path
from fastapi import HTTPException

import requests
from shapely.geometry import LineString, box

from app.env import load_project_env
from app.services.map_service import parse_bbox
from data.ingest.osm_roads import ROOT, HIGHWAY_INCLUDE, load_roads

DEFAULT_BBOX = "77.63,12.96,77.65,12.98"
ENDPOINT = "https://overpass-api.de/api/interpreter"
ATTRIBUTION = "© OpenStreetMap contributors, ODbL; https://www.openstreetmap.org/copyright"


def validate_bounds(value):
    try:
        bounds = parse_bbox(value)
    except HTTPException as exc:
        raise ValueError(exc.detail) from exc
    west, south, east, north = bounds
    if not (77.45 <= west < east <= 77.78 and 12.83 <= south < north <= 13.08):
        raise ValueError("Import bounds must stay inside the Bengaluru coverage area.")
    if east - west > 0.05 or north - south > 0.05:
        raise ValueError("Import spans must be at most 0.05 degrees each.")
    return bounds


def parse_roads(payload, bounds):
    if not isinstance(payload, dict) or payload.get("remark") or not isinstance(payload.get("elements"), list):
        raise ValueError("Incomplete or invalid Overpass response; no roads imported.")
    rows, seen = [], set()
    for item in payload["elements"]:
        if item.get("type") != "way":
            continue
        tags = item.get("tags", {})
        if tags.get("highway") not in HIGHWAY_INCLUDE:
            continue
        osm_id = str(item["id"])
        if not osm_id.isdigit() or osm_id in seen:
            raise ValueError("Invalid or duplicate OSM way ID.")
        coordinates = [(float(point["lon"]), float(point["lat"])) for point in item.get("geometry", [])]
        if len(coordinates) < 2 or not all(math.isfinite(x) and math.isfinite(y) and -180 <= x <= 180 and -90 <= y <= 90 for x, y in coordinates):
            raise ValueError("Incomplete OSM way geometry; no roads imported.")
        line = LineString(coordinates)
        if not line.is_valid or line.length == 0:
            raise ValueError("Invalid OSM road geometry.")
        if not line.intersects(box(*bounds)):
            continue
        width = None
        try:
            value = float(tags.get("width", ""))
            if math.isfinite(value) and value > 0:
                width = value
        except (ValueError, TypeError):
            pass
        name = tags.get("name") or tags.get("name:en") or tags.get("ref") or f"OSM-{osm_id}"
        rows.append((osm_id, name, tags["highway"], width, line.wkt))
        seen.add(osm_id)
    if not rows:
        raise ValueError("No valid roads returned; database unchanged.")
    return rows


def download(bounds, cache_dir: Path, refresh=False):
    west, south, east, north = bounds
    types = "|".join(sorted(HIGHWAY_INCLUDE))
    query = f'[out:json][timeout:30];way["highway"~"^({types})$"]({south},{west},{north},{east});out geom;'
    digest = hashlib.sha256(query.encode()).hexdigest()
    cache = cache_dir / f"local-{digest[:16]}.json"
    if cache.exists() and not refresh:
        document = json.loads(cache.read_text(encoding="utf-8"))
        if document.get("query_sha256") != digest:
            raise ValueError("Cached query mismatch; use --refresh.")
        parse_roads(document["payload"], bounds)
        return document
    with requests.post(ENDPOINT, data={"data": query}, headers={"User-Agent": "DigInSync-local-road-import/1.0"},
                       timeout=(10, 45), stream=True) as response:
        if response.status_code in (429, 504):
            raise ValueError("Overpass is busy or rate limited. Retry the import later; database unchanged.")
        response.raise_for_status()
        chunks, size = [], 0
        for chunk in response.iter_content(65536):
            size += len(chunk)
            if size > 20 * 1024 * 1024:
                raise ValueError("Road response exceeds 20 MiB; use smaller bounds.")
            chunks.append(chunk)
    payload = json.loads(b"".join(chunks))
    parse_roads(payload, bounds)
    document = {"source": ENDPOINT, "bbox": list(bounds), "retrieved_at": datetime.now(timezone.utc).isoformat(),
                "query_sha256": digest, "query": query, "attribution": ATTRIBUTION, "payload": payload}
    cache_dir.mkdir(parents=True, exist_ok=True)
    temporary = cache.with_suffix(".part")
    temporary.write_text(json.dumps(document, ensure_ascii=False), encoding="utf-8")
    temporary.replace(cache)
    return document


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bbox", default=DEFAULT_BBOX, help="west,south,east,north; max 0.05 degree spans")
    parser.add_argument("--refresh", action="store_true", help="Request fresh OSM data instead of using the saved response")
    args = parser.parse_args()
    try:
        bounds = validate_bounds(args.bbox)
        document = download(bounds, ROOT / "data" / "raw" / "osm", args.refresh)
        rows = parse_roads(document["payload"], bounds)
        load_project_env(ROOT / ".env.local")
        load_roads(rows, os.environ["DATABASE_SYNC_URL"])
        print(f"Imported {len(rows)} real road ways. Source retrieved {document['retrieved_at']}. {ATTRIBUTION}")
    except Exception as exc:
        # Never print connection URLs or credentials from driver exceptions.
        if isinstance(exc, (ValueError, KeyError)):
            parser.exit(1, f"Import failed: {exc}\n")
        parser.exit(1, f"Import failed ({type(exc).__name__}); check provider availability and local database configuration.\n")


if __name__ == "__main__":
    main()
