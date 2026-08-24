"""Portfolio endpoints: snapshot, positions, history, broker account."""
from fastapi import APIRouter, Depends, Query

from app.api.deps import get_broker, get_portfolio
from app.integrations.base import AccountInfo, BrokerService
from app.schemas.portfolio import PortfolioSnapshot, PositionOut, SnapshotOut
from app.services.portfolio import PortfolioService

router = APIRouter(prefix="/portfolio", tags=["portfolio"])


@router.get("", response_model=PortfolioSnapshot)
async def get_snapshot(
    persist: bool = Query(default=False),
    portfolio: PortfolioService = Depends(get_portfolio),
):
    """Current portfolio snapshot; pass ?persist=true to store it."""
    snapshot, _metrics = await portfolio.get_snapshot()
    if persist:
        await portfolio.persist_current()
    return snapshot


@router.get("/positions", response_model=list[PositionOut])
async def get_positions(portfolio: PortfolioService = Depends(get_portfolio)):
    return await portfolio.get_positions()


@router.get("/history", response_model=list[SnapshotOut])
async def get_history(
    limit: int = Query(default=100, ge=1, le=1000),
    portfolio: PortfolioService = Depends(get_portfolio),
):
    return await portfolio.recent_snapshots(limit=limit)


@router.get("/account", response_model=AccountInfo)
async def get_account(broker: BrokerService = Depends(get_broker)):
    return await broker.get_account()
