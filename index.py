"""Vercel entrypoint. The FastAPI app lives in backend.app.main."""

from backend.app.main import app

__all__ = ["app"]
