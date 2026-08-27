"""Root route: serves the self-contained live dashboard."""
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import FileResponse

router = APIRouter(tags=["dashboard"])

_DASHBOARD = Path(__file__).resolve().parents[1] / "static" / "dashboard.html"


@router.get("/", include_in_schema=False)
async def dashboard():
    return FileResponse(_DASHBOARD, media_type="text/html")
