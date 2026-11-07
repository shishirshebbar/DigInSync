import csv
import json

import pandas as pd
import pytest
from shapely.geometry import Polygon, box

from data.ingest.validate_wards import (
    Ward, boundary_review, gap_review, name_review, overlap_review, read_wards, run,
)


def ward(number, name, geometry):
    return Ward(number, name, geometry, geometry)


def test_name_matches_are_unreviewed_and_candidates_not_approved(tmp_path):
    path = tmp_path / "grievances.csv"
    pd.DataFrame({"Ward Name": ["  Alpha ", "alpha", "Alphaa", "Other", ""]}).to_csv(path, index=False)
    wards = [ward("1", "Alpha", box(77.5, 12.9, 77.51, 12.91))]
    rows = {r["source_ward_name"]: r for r in name_review(wards, path)}
    assert rows["alpha"]["classification"] == "exact_name_review_required"
    assert rows["Alphaa"]["classification"] == "candidate_review_required"
    assert rows["Alphaa"]["exact_ward_id"] == ""
    assert rows["Alphaa"]["candidate_1_ward_id"] == "1"
    assert rows[""]["classification"] == "unmatched"
    assert all(r["review_status"] == "unreviewed" for r in rows.values())


def test_overlaps_and_internal_holes_are_reported():
    a = box(0, 0, 2, 2)
    b = box(1, 1, 3, 3)
    c = box(2, 0, 4, 1)
    wards = [ward("1", "A", a), ward("2", "B", b), ward("3", "C", c)]
    overlaps = overlap_review(wards, [a, b, c])
    assert len(overlaps) == 1
    assert overlaps[0]["overlap_m2"] == 1
    ring = Polygon([(0, 0), (5, 0), (5, 5), (0, 5)],
                   [[(1, 1), (2, 1), (2, 2), (1, 2)]])
    assert gap_review([ring])[0]["internal_hole_m2"] == 1.0


def test_boundary_validation_reports_invalid_original_and_repair():
    bowtie = Polygon([(77.5, 12.9), (77.51, 12.91), (77.5, 12.91),
                      (77.51, 12.9), (77.5, 12.9)])
    from shapely import make_valid
    rows, _ = boundary_review([Ward("1", "A", bowtie, make_valid(bowtie))])
    assert rows[0]["original_valid"] is False
    assert "Self-intersection" in rows[0]["validity_reason"]
    assert rows[0]["repaired_valid"] is True
    assert rows[0]["review_status"] == "unreviewed"


def test_kml_preserves_holes_and_rejects_duplicate_ids(tmp_path):
    polygon = """<Polygon><outerBoundaryIs><LinearRing><coordinates>
    77.5,12.9 77.6,12.9 77.6,13 77.5,12.9
    </coordinates></LinearRing></outerBoundaryIs></Polygon>"""
    def placemark(name):
        return f'<Placemark><ExtendedData><SchemaData><SimpleData name="id">1</SimpleData><SimpleData name="name_en">{name}</SimpleData></SchemaData></ExtendedData>{polygon}</Placemark>'
    path = tmp_path / "test.kml"
    path.write_text(f'<kml xmlns="http://www.opengis.net/kml/2.2"><Document>{placemark("Alpha")}</Document></kml>', encoding="utf-8")
    assert read_wards(path)[0].name == "Alpha"
    path.write_text(f'<kml xmlns="http://www.opengis.net/kml/2.2"><Document>{placemark("A")}{placemark("B")}</Document></kml>', encoding="utf-8")
    with pytest.raises(ValueError, match="duplicate"):
        read_wards(path)


def test_output_refuses_to_overwrite_existing_directory(tmp_path):
    path = tmp_path / "ward.kml"
    path.write_text("""<kml xmlns="http://www.opengis.net/kml/2.2"><Document>
    <Placemark><ExtendedData><SchemaData><SimpleData name="id">1</SimpleData>
    <SimpleData name="name_en">Alpha</SimpleData></SchemaData></ExtendedData>
    <Polygon><outerBoundaryIs><LinearRing><coordinates>77.5,12.9 77.6,12.9
    77.6,13 77.5,12.9</coordinates></LinearRing></outerBoundaryIs></Polygon>
    </Placemark></Document></kml>""", encoding="utf-8")
    grievances = tmp_path / "grievances.csv"
    pd.DataFrame({"Ward Name": ["Alpha", "Other"]}).to_csv(grievances, index=False)
    output = tmp_path / "report"
    summary = run(path, grievances, output)
    assert summary["grievance_rows"] == 2
    assert json.loads((output / "summary.json").read_text(encoding="utf-8"))["wards"] == 1
    assert json.loads((output / "overlaps.geojson").read_text(encoding="utf-8"))["type"] == "FeatureCollection"
    with (output / "grievance_names.csv").open(encoding="utf-8-sig", newline="") as file:
        assert len(list(csv.DictReader(file))) == 2
    with pytest.raises(FileExistsError):
        run(path, grievances, output)
