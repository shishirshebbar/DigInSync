import os
from datetime import date

import pandas as pd
import pytest

from data.ingest.bbmp_data import prepare_grievances, prepare_work_orders, read_csv
from app.env import load_project_env


def test_work_orders_keep_duplicate_source_ids_with_distinct_row_ids(tmp_path):
    path = tmp_path / "work_orders.csv"
    pd.DataFrame([
        {"slno": "1", "id": "42", "ward": "60", "wodetails": "Road work"},
        {"slno": "2", "id": "42", "ward": "60", "wodetails": "Road work"},
    ]).to_csv(path, index=False)
    rows = prepare_work_orders(path)
    assert len(rows) == 2
    assert rows[0][0] != rows[1][0]
    assert rows[0][1:] == ("42", "BBMP", "60", "Road work")
    assert prepare_work_orders(path) == rows


def test_grievances_map_ward_and_date_without_private_columns(tmp_path):
    path = tmp_path / "grievances.csv"
    pd.DataFrame([{
        "Complaint ID": "123", "Category": "Roads",
        "Grievance Date": "2025-06-19 10:39:00.000000000",
        "Ward Name": "Example Ward", "Grievance Status": "Registered",
        "Staff Name": "not imported",
    }]).to_csv(path, index=False)
    row = prepare_grievances(path)[0]
    assert row[1:] == ("123", "Roads", date(2025, 6, 19), "Example Ward", "Registered")
    assert len(row) == 6
    assert prepare_grievances(path)[0] == row


def test_missing_columns_or_duplicate_keys_fail_explicitly(tmp_path):
    path = tmp_path / "data.csv"
    pd.DataFrame([{"id": "1"}, {"id": "1"}]).to_csv(path, index=False)
    with pytest.raises(ValueError, match="missing required columns"):
        read_csv(path, ["id", "ward"], "id")
    with pytest.raises(ValueError, match="duplicate"):
        read_csv(path, ["id"], "id")
    with pytest.raises(FileNotFoundError):
        read_csv(tmp_path / "missing.csv", ["id"], "id")
    pd.DataFrame(columns=["id"]).to_csv(path, index=False)
    with pytest.raises(ValueError, match="no records"):
        read_csv(path, ["id"], "id")


def test_invalid_grievance_date_fails(tmp_path):
    path = tmp_path / "grievances.csv"
    pd.DataFrame([{
        "Complaint ID": "123", "Category": "Roads", "Grievance Date": "not-a-date",
        "Ward Name": "Example Ward", "Grievance Status": "Registered",
    }]).to_csv(path, index=False)
    with pytest.raises(ValueError, match="invalid grievance dates"):
        prepare_grievances(path)


def test_environment_file_supports_windows_encoding(tmp_path, monkeypatch):
    monkeypatch.delenv("BBMP_TEST_SETTING", raising=False)
    path = tmp_path / ".env"
    path.write_bytes("# dash \u2014\nBBMP_TEST_SETTING=ready\n".encode("cp1252"))
    load_project_env(path)
    assert os.environ["BBMP_TEST_SETTING"] == "ready"
