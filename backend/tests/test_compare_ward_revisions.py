import csv

import pandas as pd
import pytest
from shapely.geometry import box
from shapely.ops import transform

from data.ingest.compare_ward_revisions import compare, grievance_review, read_historic_wards, write_rows
from data.ingest.validate_wards import PROJECT, Ward


def test_historic_ward_overlap_does_not_assign_complaints():
    old = {"number": "1", "name": "Old", "original_valid": True,
           "geometry": transform(PROJECT, box(77.5, 12.9, 77.52, 12.91))}
    geometries = [box(77.5, 12.9, 77.51, 12.91), box(77.51, 12.9, 77.52, 12.91)]
    current = [Ward(str(i), str(i), geom, geom) for i, geom in enumerate(geometries, 1)]
    rows = compare([old], current)
    assert len(rows) == 2
    assert all(r["status"] == "geometric_candidate_unreviewed" for r in rows)
    assert all(49 < r["pct_historic_ward"] < 51 for r in rows)


def test_name_matching_never_approves_historic_revision(tmp_path):
    source = tmp_path / "grievances.csv"
    pd.DataFrame({"Ward Name": [" ALPHA ", "alpha", "Missing"]}).to_csv(source, index=False)
    rows = grievance_review(source, [{"number": "7", "name": "Alpha"}])
    matched = [r for r in rows if r["status"] == "exact_name_only_unverified_revision"]
    assert sum(r["record_count"] for r in matched) == 2
    assert all(r["historic_exact_ids"] == "7" for r in matched)
    assert next(r for r in rows if r["grievance_ward_name"] == "Missing")["status"] == "unmatched"
    target = tmp_path / "result.csv"
    write_rows(target, rows, list(rows[0]))
    with target.open(encoding="utf-8-sig", newline="") as file:
        assert len(list(csv.DictReader(file))) == 3


def test_rejects_malformed_historic_metadata(tmp_path):
    source = tmp_path / "old.kml"
    source.write_text('<kml xmlns="http://www.opengis.net/kml/2.2"><Placemark>'
                      '<name>Unknown</name></Placemark></kml>', encoding="utf-8")
    with pytest.raises(ValueError, match="Unrecognized"):
        read_historic_wards(source)
