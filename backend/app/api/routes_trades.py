"""Trade lifecycle endpoints: propose, execute, cancel, history."""
from fastapi import APIRouter, Depends, Query

from app.api.deps import get_trading
from app.core.auth import require_api_key
from app.schemas.order import OrderResult
from app.schemas.trade import (
    CancelTradeRequest,
    ExecuteTradeRequest,
    ProposeResponse,
    TradeProposal,
    TradeProposalOut,
)
from app.services.trading import TradingService

router = APIRouter(prefix="/trades", tags=["trading"])


@router.post("/propose", response_model=ProposeResponse, dependencies=[Depends(require_api_key)])
async def propose_trade(payload: TradeProposal, trading: TradingService = Depends(get_trading)):
    """Submit an agent proposal: risk-checked, then executed if approved."""
    return await trading.propose(payload)


@router.post("/execute", response_model=ProposeResponse, dependencies=[Depends(require_api_key)])
async def execute_proposal(
    payload: ExecuteTradeRequest, trading: TradingService = Depends(get_trading)
):
    """Re-run risk + execution for a previously stored proposal id."""
    return await trading.execute(payload)


@router.post("/cancel", response_model=OrderResult, dependencies=[Depends(require_api_key)])
async def cancel_order(payload: CancelTradeRequest, trading: TradingService = Depends(get_trading)):
    return await trading.cancel_order(payload.order_id)


@router.get("/proposals", response_model=list[TradeProposalOut])
async def list_proposals(
    limit: int = Query(default=50, ge=1, le=500),
    trading: TradingService = Depends(get_trading),
):
    return await trading.list_proposals(limit)


@router.get("/proposals/{proposal_id}", response_model=TradeProposalOut)
async def get_proposal(proposal_id: str, trading: TradingService = Depends(get_trading)):
    return await trading.get_proposal(proposal_id)
