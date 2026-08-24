"""Health / liveness endpoint."""
from fastapi import APIRouter, Depends

from app.api.deps import get_settings
from app.db.base import utcnow

router = APIRouter(tags=["health"])


@router.get("/health")
async def health(settings=Depends(get_settings)):
    return {
        "status": "ok",
        "app_name": settings.app_name,
        "environment": settings.environment,
        "broker_mode": settings.broker_mode,
        "time": utcnow().isoformat(),
    }
