import asyncio

import httpx
import pytest
from fastapi import FastAPI, Request

from app.api.demo_access import require_direct_loopback
from app.api.router import api_router


@pytest.mark.parametrize(("peer", "base", "headers", "expected"), [
    ("127.0.0.1", "http://localhost", {}, 200),
    ("::1", "http://[::1]", {}, 200),
    ("192.168.1.25", "http://localhost", {}, 403),
    ("127.0.0.1", "http://localhost", {"x-forwarded-for": "1.2.3.4"}, 403),
    ("127.0.0.1", "http://example.org", {}, 403),
])
def test_direct_loopback_restriction(peer, base, headers, expected):
    app = FastAPI()

    @app.post("/")
    def endpoint(request: Request):
        require_direct_loopback(request)
        return {"ok": True}

    async def run():
        transport = httpx.ASGITransport(app=app, client=(peer, 1234))
        async with httpx.AsyncClient(transport=transport, base_url=base) as client:
            response = await client.post("/", headers=headers)
            assert response.status_code == expected

    asyncio.run(run())


@pytest.mark.parametrize(("path", "method"), [
    ("/api/coordination-plans", "POST"),
    ("/api/coordination-plans/test", "PATCH"),
    ("/api/coordination-plans/test/approve", "POST"),
    ("/api/coordination-plans/test/reject", "POST"),
    ("/api/workplans/coordination-plans/test/approve", "POST"),
])
def test_remote_mutations_rejected(path, method):
    app = FastAPI()
    app.include_router(api_router, prefix="/api")

    async def run():
        transport = httpx.ASGITransport(app=app, client=("192.168.1.25", 1234))
        async with httpx.AsyncClient(transport=transport, base_url="http://localhost") as client:
            response = await client.request(method, path, json={})
            assert response.status_code == 403

    asyncio.run(run())
