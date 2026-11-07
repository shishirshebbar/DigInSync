import asyncio

import pytest
from fastapi import HTTPException

from app.api.routes.wards import ward_context


class FakeResult:
    def scalar_one(self):
        return 12


class FakeDB:
    def __init__(self):
        self.statement = None
        self.params = None

    async def execute(self, statement, params):
        self.statement = str(statement)
        self.params = params
        return FakeResult()


@pytest.mark.parametrize(
    ("dataset", "ward", "table"),
    [("work_orders", " 60 ", "historical_work_orders"),
     ("grievances", " Example Ward ", "grievances")],
)
def test_context_uses_separate_source_ward_ids(dataset, ward, table):
    db = FakeDB()
    result = asyncio.run(ward_context(dataset=dataset, ward=ward, db=db))
    assert table in db.statement
    assert db.params == {"ward": ward.strip()}
    assert result.record_count == 12
    assert result.geographic_precision == "ward"


def test_context_rejects_blank_ward():
    with pytest.raises(HTTPException) as exc:
        asyncio.run(ward_context(dataset="grievances", ward="  ", db=FakeDB()))
    assert exc.value.status_code == 422
