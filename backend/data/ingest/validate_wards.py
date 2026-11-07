"""Generate read-only ward-boundary and grievance-name review reports.

Run from backend/:
    python -m data.ingest.validate_wards --kml <file> --output <new-directory> --road-coverage

The output contains proposed repairs and name suggestions, never approved mappings.
"""
import argparse
import csv
import hashlib
import json
import math
import os
import re
import unicodedata
import warnings
import xml.etree.ElementTree as ET
from collections import Counter
from contextlib import closing
from dataclasses import dataclass
from difflib import SequenceMatcher
from pathlib import Path

import pandas as pd
import psycopg2
from pyproj import Transformer
from shapely import make_valid
from shapely.geometry import MultiPolygon, Polygon, box, mapping
from shapely.ops import transform, unary_union
from shapely.strtree import STRtree
from shapely.validation import explain_validity

from app.env import load_project_env
from data.ingest.osm_roads import BBOX, ROOT

NS = {"k": "http://www.opengis.net/kml/2.2"}
PROJECT = Transformer.from_crs("EPSG:4326", "EPSG:32643", always_xy=True).transform
UNPROJECT = Transformer.from_crs("EPSG:32643", "EPSG:4326", always_xy=True).transform
MATCH_THRESHOLD = 0.65
MAX_CANDIDATES = 3


@dataclass
class Ward:
    number: str
    name: str
    original: object
    repaired: object


def parse_ring(element):
    if element is None or not element.text or not element.text.strip():
        raise ValueError("Missing KML polygon coordinate ring")
    points = []
    for token in element.text.split():
        parts = token.split(",")
        if len(parts) < 2:
            raise ValueError(f"Invalid coordinate: {token}")
        points.append((float(parts[0]), float(parts[1])))
    if len(points) < 4 or points[0] != points[-1]:
        raise ValueError("KML polygon ring must be closed with at least four coordinates")
    return points


def polygonal_parts(geometry):
    if geometry.geom_type == "Polygon":
        return [geometry]
    if hasattr(geometry, "geoms"):
        return [part for child in geometry.geoms for part in polygonal_parts(child)]
    return []


def read_wards(path):
    root = ET.parse(path).getroot()
    wards = []
    ids = set()
    for placemark in root.findall(".//k:Placemark", NS):
        fields = {e.attrib["name"]: (e.text or "").strip()
                  for e in placemark.findall(".//k:SimpleData", NS)}
        number, name = fields.get("id", ""), fields.get("name_en", "")
        if not number or not name or number in ids:
            raise ValueError(f"Missing or duplicate ward identifier/name: {number!r}")
        ids.add(number)
        polygons = []
        for element in placemark.findall(".//k:Polygon", NS):
            outer = parse_ring(element.find("./k:outerBoundaryIs/k:LinearRing/k:coordinates", NS))
            holes = [parse_ring(r) for r in element.findall(
                "./k:innerBoundaryIs/k:LinearRing/k:coordinates", NS)]
            polygons.append(Polygon(outer, holes))
        if not polygons:
            raise ValueError(f"Ward {number} has no polygons")
        original = MultiPolygon(polygons)
        parts = polygonal_parts(make_valid(original))
        if not parts:
            raise ValueError(f"Ward {number} has no polygonal geometry after repair")
        repaired = unary_union(parts)
        if repaired.is_empty or not repaired.is_valid:
            raise ValueError(f"Ward {number} repair is empty or invalid")
        wards.append(Ward(number, name, original, repaired))
    if not wards:
        raise ValueError("No KML ward placemarks found")
    return sorted(wards, key=lambda w: (int(w.number) if w.number.isdigit() else float("inf"), w.number))


def normalize_name(value):
    return " ".join(unicodedata.normalize("NFKC", value).casefold().split())


def candidate_name(value):
    return re.sub(r"[^\w]+", " ", normalize_name(value)).strip()


def name_review(wards, grievance_path):
    data = pd.read_csv(grievance_path, usecols=["Ward Name"], dtype=str,
                       keep_default_na=False, encoding="utf-8-sig")
    if data.empty:
        raise ValueError("Grievance CSV is empty")
    counts = Counter(data["Ward Name"].str.strip())
    exact = {}
    for ward in wards:
        exact.setdefault(normalize_name(ward.name), []).append(ward)
    rows = []
    for name, count in sorted(counts.items(), key=lambda item: (-item[1], item[0])):
        matches = exact.get(normalize_name(name), []) if name else []
        ranked = sorted(
            ((SequenceMatcher(None, candidate_name(name), candidate_name(w.name)).ratio(), w)
             for w in wards),
            key=lambda item: (-item[0], item[1].number),
        ) if name else []
        candidates = [(score, w) for score, w in ranked if score >= MATCH_THRESHOLD][:MAX_CANDIDATES]
        status = "exact_name_review_required" if len(matches) == 1 else (
            "ambiguous_exact_name" if matches else ("candidate_review_required" if candidates else "unmatched"))
        row = {
            "source_ward_name": name, "record_count": count, "classification": status,
            "exact_ward_id": matches[0].number if len(matches) == 1 else "",
            "exact_ward_name": matches[0].name if len(matches) == 1 else "",
            "review_status": "unreviewed",
        }
        for i in range(MAX_CANDIDATES):
            candidate = candidates[i] if i < len(candidates) else None
            row[f"candidate_{i+1}_ward_id"] = candidate[1].number if candidate else ""
            row[f"candidate_{i+1}_name"] = candidate[1].name if candidate else ""
            row[f"candidate_{i+1}_similarity"] = round(candidate[0], 3) if candidate else ""
        rows.append(row)
    return rows


def boundary_review(wards):
    bbox = box(BBOX["min_lon"], BBOX["min_lat"], BBOX["max_lon"], BBOX["max_lat"])
    bbox_m = transform(PROJECT, bbox)
    rows, projected = [], []
    for ward in wards:
        original_m = transform(PROJECT, ward.original)
        repaired_m = transform(PROJECT, ward.repaired)
        projected.append(repaired_m)
        before, after = original_m.area, repaired_m.area
        with warnings.catch_warnings(record=True) as issues:
            warnings.simplefilter("always", RuntimeWarning)
            distance = original_m.boundary.hausdorff_distance(repaired_m.boundary)
        distance_warning = "; ".join(dict.fromkeys(str(issue.message) for issue in issues))
        if not math.isfinite(distance):
            distance = None
            distance_warning = distance_warning or "Non-finite boundary distance"
        rows.append({
            "ward_id": ward.number, "ward_name": ward.name,
            "original_valid": ward.original.is_valid,
            "validity_reason": explain_validity(ward.original),
            "repaired_valid": ward.repaired.is_valid,
            "original_area_m2": round(before, 2),
            "repaired_area_m2": round(after, 2),
            "area_change_pct": round((after - before) / before * 100, 4) if before else None,
            "boundary_hausdorff_m": round(distance, 3) if distance is not None else None,
            "boundary_distance_warning": distance_warning,
            "area_inside_road_import_bbox_pct": round(
                repaired_m.intersection(bbox_m).area / after * 100, 3) if after else None,
            "review_status": "unreviewed",
        })
    return rows, projected


def overlap_review(wards, projected):
    tree = STRtree(projected)
    rows = []
    for i, geom in enumerate(projected):
        for j in tree.query(geom, predicate="intersects"):
            j = int(j)
            if j <= i:
                continue
            area = geom.intersection(projected[j]).area
            if area > 0.01:
                rows.append({
                    "ward_id_a": wards[i].number, "ward_name_a": wards[i].name,
                    "ward_id_b": wards[j].number, "ward_name_b": wards[j].name,
                    "overlap_m2": round(area, 2),
                    "pct_smaller_ward": round(area / min(geom.area, projected[j].area) * 100, 4),
                    "_geometry": geom.intersection(projected[j]),
                })
    return sorted(rows, key=lambda r: -r["overlap_m2"])


def gap_review(projected):
    union = unary_union(projected)
    parts = polygonal_parts(union)
    holes = [Polygon(ring) for part in parts for ring in part.interiors]
    return sorted(({"internal_hole_m2": round(hole.area, 2), "_geometry": hole} for hole in holes
                   if hole.area > 0.01), key=lambda r: -r["internal_hole_m2"])


def road_counts(wards, db_url):
    if not db_url:
        raise RuntimeError("DATABASE_SYNC_URL is required for --road-coverage")
    counts = {}
    with closing(psycopg2.connect(db_url)) as conn:
        conn.set_session(readonly=True, autocommit=False)
        with conn.cursor() as cur:
            for ward in wards:
                cur.execute("""
                    SELECT COUNT(*) FROM road_segments
                    WHERE geometry && ST_GeomFromText(%s, 4326)
                      AND ST_Intersects(geometry, ST_GeomFromText(%s, 4326))
                """, (ward.repaired.wkt, ward.repaired.wkt))
                counts[ward.number] = cur.fetchone()[0]
    return counts


def write_csv(path, rows, columns):
    with path.open("w", newline="", encoding="utf-8-sig") as file:
        writer = csv.DictWriter(file, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def write_issue_geojson(path, rows):
    features = [
        {"type": "Feature", "properties": {k: v for k, v in row.items() if k != "_geometry"},
         "geometry": mapping(transform(UNPROJECT, row["_geometry"]))}
        for row in rows
    ]
    path.write_text(json.dumps({"type": "FeatureCollection", "features": features},
                               ensure_ascii=False), encoding="utf-8")


def run(kml_path, grievance_path, output, db_url=None, include_roads=False):
    wards = read_wards(kml_path)
    names = name_review(wards, grievance_path)
    boundaries, projected = boundary_review(wards)
    overlaps = overlap_review(wards, projected)
    gaps = gap_review(projected)
    if include_roads:
        counts = road_counts(wards, db_url)
        for row in boundaries:
            row["intersecting_road_ways"] = counts[row["ward_id"]]

    output.mkdir(parents=True, exist_ok=False)
    write_csv(output / "boundaries.csv", boundaries, list(boundaries[0]))
    write_csv(output / "grievance_names.csv", names, list(names[0]))
    write_csv(output / "overlaps.csv", overlaps,
              ["ward_id_a", "ward_name_a", "ward_id_b", "ward_name_b", "overlap_m2", "pct_smaller_ward"])
    write_csv(output / "internal_gaps.csv", gaps, ["internal_hole_m2"])
    write_issue_geojson(output / "overlaps.geojson", overlaps)
    write_issue_geojson(output / "internal_gaps.geojson", gaps)
    geojson = {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"ward_id": w.number, "ward_name": w.name,
                                            "status": "proposed_unreviewed"},
         "geometry": mapping(w.repaired)} for w in wards
    ]}
    (output / "proposed_wards.geojson").write_text(json.dumps(geojson, ensure_ascii=False), encoding="utf-8")
    summary = {
        "kml_sha256": hashlib.sha256(kml_path.read_bytes()).hexdigest(),
        "grievance_csv_sha256": hashlib.sha256(grievance_path.read_bytes()).hexdigest(),
        "wards": len(wards),
        "invalid_original_wards": sum(not w.original.is_valid for w in wards),
        "valid_proposed_wards": sum(w.repaired.is_valid for w in wards),
        "boundary_distance_warnings": sum(bool(r["boundary_distance_warning"]) for r in boundaries),
        "overlapping_ward_pairs_over_0_01_m2": len(overlaps),
        "internal_holes_over_0_01_m2": len(gaps),
        "grievance_rows": sum(r["record_count"] for r in names),
        "grievance_distinct_names": len(names),
        "names_by_classification": dict(Counter(r["classification"] for r in names)),
        "rows_by_classification": dict(sum(
            (Counter({r["classification"]: r["record_count"]}) for r in names), Counter())),
        "road_coverage_checked": include_roads,
        "notes": [
            "All repairs and name matches require review; exact names do not prove ward revision compatibility.",
            "Original invalid polygon area and calculated area differences may be unreliable.",
            "Boundary-distance warnings are recorded per ward; those measurements require caution.",
            "Gaps are internal holes in the union only; external coverage requires an authoritative city boundary.",
            "Bounding-box percentages are not verified road coverage. Road counts are presence, not completeness.",
            "No database changes were made.",
        ],
    }
    (output / "summary.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")
    return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--kml", type=Path, required=True)
    parser.add_argument("--grievances", type=Path, default=ROOT / "data" / "raw" / "grievances.csv")
    parser.add_argument("--output", type=Path, required=True, help="New directory for reports")
    parser.add_argument("--road-coverage", action="store_true", help="Query road intersections (read-only)")
    args = parser.parse_args()
    if args.road_coverage:
        load_project_env(ROOT / ".env.local")
    summary = run(args.kml, args.grievances, args.output, os.environ.get("DATABASE_SYNC_URL"), args.road_coverage)
    print(json.dumps(summary, indent=2, ensure_ascii=True))


if __name__ == "__main__":
    main()
