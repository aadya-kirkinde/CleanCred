"""Vercel ASGI entry point for the CleanCred FastAPI backend."""

from backend.main import app as backend_app


async def app(scope, receive, send):
    """Accept both Vercel's original /api path and a stripped function path."""
    if scope.get("type") == "http" and scope.get("path", "").startswith("/api"):
        scope = dict(scope)
        stripped = scope["path"][4:] or "/"
        scope["path"] = stripped
        scope["raw_path"] = stripped.encode("utf-8")
    await backend_app(scope, receive, send)
