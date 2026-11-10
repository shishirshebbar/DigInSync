"""Restrict explicitly enabled demo mutations to direct loopback requests or a demo token."""
from ipaddress import ip_address
from urllib.parse import urlsplit

from fastapi import HTTPException, Request


def is_direct_loopback(request: Request) -> bool:
    if request.client is None or any(
        name in request.headers for name in ("forwarded", "x-forwarded-for", "x-real-ip")
    ):
        return False
    try:
        if not ip_address(request.client.host).is_loopback:
            return False
        host = urlsplit(f"//{request.headers.get('host', '')}").hostname
    except ValueError:
        return False
    return host in {"localhost", "127.0.0.1", "::1"}


def _has_valid_demo_token(request: Request) -> bool:
    from app.config import get_settings
    token = get_settings().demo_token
    if not token:
        return False
    return request.headers.get("x-demo-token") == token


def require_direct_loopback(request: Request) -> None:
    if not is_direct_loopback(request) and not _has_valid_demo_token(request):
        raise HTTPException(403, "Demo decisions require a direct local connection; proxy and remote requests are not supported.")
