from unittest.mock import patch

import pytest

import osmium

from data.ingest.osm_roads import RoadHandler, load_roads


def test_empty_import_is_rejected_without_connecting():
    with patch("data.ingest.osm_roads.psycopg2.connect") as connect:
        with pytest.raises(ValueError, match="No roads"):
            load_roads([], "unused")
        connect.assert_not_called()


def test_missing_node_location_is_counted_and_skipped():
    class Way:
        tags = {"highway": "residential"}

    class BrokenFactory:
        def create_linestring(self, way):
            raise osmium.InvalidLocationError("missing")

    handler = RoadHandler()
    handler._wkb = BrokenFactory()
    handler.way(Way())
    assert handler.invalid_geometry == 1
    assert handler.roads == []


def test_import_updates_existing_osm_ids_without_deleting():
    class Cursor:
        def __init__(self):
            self.sql = []

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def execute(self, sql):
            self.sql.append(sql)

        def __iter__(self):
            return iter([("10", "existing-id")])

    class Conn:
        def __init__(self):
            self.cur = Cursor()

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def cursor(self):
            return self.cur

        def close(self):
            pass

    conn = Conn()
    roads = [("10", "Example Road", "residential", 5.0, "LINESTRING(77.5 12.9,77.6 12.9)")]
    with patch("data.ingest.osm_roads.psycopg2.connect", return_value=conn), \
            patch("data.ingest.osm_roads.execute_values") as execute:
        load_roads(roads, "unused")
    assert execute.call_args.args[2][0][0] == "existing-id"
    assert all("TRUNCATE" not in sql for sql in conn.cur.sql)
    assert "ON CONFLICT" in execute.call_args.args[1]
