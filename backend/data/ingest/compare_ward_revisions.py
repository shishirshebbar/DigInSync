"""Compare named historic wards with 2023 polygons; results require review.

Run from backend/:
    python -m data.ingest.compare_ward_revisions --historic <2015.kml> --current <2023.kml> --output <new-directory>
"""
import argparse
import csv
import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path

import pandas as pd
from shapely import make_valid
from shapely.geometry import MultiPolygon, Polygon
from shapely.ops import transform, unary_union
from shapely.strtree import STRtree

from data.ingest.validate_wards import NS, PROJECT, ROOT, normalize_name, parse_ring, polygonal_parts, read_wards


def read_historic_wards(path):
    root = ET.parse(path).getroot()
    wards = []
    numbers = set()
    for placemark in root.findall(".//k:Placemark", NS):
        label = placemark.findtext("k:name", default="", namespaces=NS)
        match = re.fullmatch(r"Ward\s*(\d+)", label.strip())
        description = placemark.findtext("k:description", default="", namespaces=NS)
        name_match = re.search(r"Ward Name:\s*(.*?)(?:<br\s*/?>|$)", description, re.IGNORECASE)
        if not match or not name_match:
            raise ValueError(f"Unrecognized historical ward metadata: {label!r}")
        number, name = match.group(1), name_match.group(1).strip()
        if number in numbers or not name:
            raise ValueError(f"Duplicate ward number or missing name: {number}")
        numbers.add(number)
        polygons = []
        for element in placemark.findall(".//k:Polygon", NS):
            outer = parse_ring(element.find("./k:outerBoundaryIs/k:LinearRing/k:coordinates", NS))
            holes = [parse_ring(r) for r in element.findall(
                "./k:innerBoundaryIs/k:LinearRing/k:coordinates", NS)]
            polygons.append(Polygon(outer, holes))
        if not polygons:
            raise ValueError(f"Historical ward {number} has no polygons")
        original = MultiPolygon(polygons)
        parts = polygonal_parts(make_valid(original))
        if not parts:
            raise ValueError(f"Historical ward {number} has no repairable polygons")
        repaired = unary_union(parts)
        if repaired.is_empty or not repaired.is_valid:
            raise ValueError(f"Historical ward {number} has invalid repaired geometry")
        wards.append({"number": number, "name": name, "original_valid": original.is_valid,
                      "geometry": transform(PROJECT, repaired)})
    if not wards:
        raise ValueError("No historical wards found")
    return wards


def compare(historic, current):
    projected = [transform(PROJECT, ward.repaired) for ward in current]
    tree = STRtree(projected)
    rows = []
    for old in historic:
        old_geometry = old["geometry"]
        intersections = []
        for index in tree.query(old_geometry, predicate="intersects"):
            index = int(index)
            overlap = old_geometry.intersection(projected[index]).area
            if overlap > 1:
                intersections.append((overlap, current[index], projected[index]))
        for area, ward, geometry in sorted(intersections, key=lambda x: -x[0]):
            rows.append({
                "historic_ward_id": old["number"], "historic_ward_name": old["name"],
                "historic_original_valid": old["original_valid"],
                "ward_2023_id": ward.number, "ward_2023_name": ward.name,
                "ward_2023_original_valid": ward.original.is_valid,
                "overlap_m2": round(area, 2),
                "pct_historic_ward": round(area / old_geometry.area * 100, 4),
                "pct_2023_ward": round(area / geometry.area * 100, 4),
                "status": "geometric_candidate_unreviewed",
            })
    return rows


def grievance_review(path, historic):
    data = pd.read_csv(path, usecols=["Ward Name"], dtype=str, keep_default_na=False, encoding="utf-8-sig")
    if data.empty:
        raise ValueError("Grievance CSV is empty")
    names = {}
    for ward in historic:
        names.setdefault(normalize_name(ward["name"]), []).append(ward)
    rows = []
    for name, count in data["Ward Name"].str.strip().value_counts(dropna=False).items():
        matched = names.get(normalize_name(name), []) if name else []
        rows.append({
            "grievance_ward_name": name, "record_count": int(count),
            "historic_exact_ids": ";".join(w["number"] for w in matched),
            "historic_exact_names": ";".join(w["name"] for w in matched),
            "status": "exact_name_only_unverified_revision" if len(matched) == 1
                      else "ambiguous_exact_name" if matched else "unmatched",
        })
    return rows


def write_rows(path, rows, fields):
    with path.open("w", newline="", encoding="utf-8-sig") as file:
        writer = csv.DictWriter(file, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--historic", type=Path, required=True)
    parser.add_argument("--current", type=Path, required=True)
    parser.add_argument("--grievances", type=Path, default=ROOT / "data" / "raw" / "grievances.csv")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    historic, current = read_historic_wards(args.historic), read_wards(args.current)
    overlaps = compare(historic, current)
    names = grievance_review(args.grievances, historic)
    args.output.mkdir(parents=True, exist_ok=False)
    write_rows(args.output / "historic_to_2023_overlap_candidates.csv", overlaps,
               ["historic_ward_id", "historic_ward_name", "historic_original_valid", "ward_2023_id",
                "ward_2023_name", "ward_2023_original_valid", "overlap_m2", "pct_historic_ward",
                "pct_2023_ward", "status"])
    write_rows(args.output / "grievance_historic_name_candidates.csv", names,
               ["grievance_ward_name", "record_count", "historic_exact_ids", "historic_exact_names", "status"])
    summary = {
        "historic_wards": len(historic), "wards_2023": len(current),
        "historic_invalid_original": sum(not w["original_valid"] for w in historic),
        "grievance_rows": sum(r["record_count"] for r in names),
        "grievance_names": len(names),
        "exact_historic_names": sum(r["status"] == "exact_name_only_unverified_revision" for r in names),
        "exact_historic_rows": sum(r["record_count"] for r in names if r["status"] == "exact_name_only_unverified_revision"),
        "historic_wards_overlapping_multiple_2023_wards_at_least_1_pct":
            sum(sum(r["pct_historic_ward"] >= 1 for r in overlaps if r["historic_ward_id"] == w["number"]) > 1 for w in historic),
        "notice": "Geometry repairs and intersections are unreviewed candidates, not approved mappings. "
                  "Exact names do not establish which ward revision grievances use. Areas do not allocate complaints.",
    }
    (args.output / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
