"""Market data endpoints (broker-agnostic)."""
from fastapi import APIRouter, Depends

from app.api.deps import get_broker
from app.integrations.base import BrokerService, MarketTick

router = APIRouter(prefix="/market", tags=["market"])


@router.get("/{symbol}", response_model=MarketTick)
async def get_quote(symbol: str, broker: BrokerService = Depends(get_broker)):
    return await broker.get_market_data(symbol)
