"""Admin endpoints for demos and manual testing.

Available only when BROKER_MODE=mock; real Alpaca deployments get a 409 so
production state can never be wiped or simulated by accident.
"""
from fastapi import APIRouter, Depends, FastAPI, Request
from sqlalchemy import delete

from app.core.auth import require_api_key
from app.core.errors import ConflictError, NotFoundError
from app.events.manager import EventBus
from app.integrations.base import InvalidOrderError, OrderNotFoundError
from app.integrations.mock_alpaca import MockAlpacaService
from app.models.event import EventModel
from app.models.order import OrderModel
from app.models.position import PositionModel
from app.models.portfolio import PortfolioSnapshotModel
from app.models.risk_decision import RiskDecisionModel
from app.models.trade import TradeProposalModel
from app.schemas.event import EventType
from app.schemas.order import OrderResult

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_api_key)])

_LOCAL_TABLES = (
    EventModel,
    RiskDecisionModel,
    OrderModel,
    TradeProposalModel,
    PortfolioSnapshotModel,
    PositionModel,
)


def _mock_broker(request: Request) -> MockAlpacaService:
    broker = request.app.state.broker
    if not isinstance(broker, MockAlpacaService):
        raise ConflictError("admin simulation endpoints require BROKER_MODE=mock")
    return broker


async def publish_fills(app: FastAPI, fills: list[OrderResult]) -> list[dict]:
    """Emit ORDER_FILLED for each freshly-filled order and refresh analytics."""
    if not fills:
        return []
    bus: EventBus = app.state.bus

    published: list[dict] = []
    for f in fills:
        payload = {
            "order_id": f.broker_order_id,
            "broker_order_id": f.broker_order_id,
            "proposal_id": f.proposal_id,
            "symbol": f.symbol,
            "quantity": f.filled_quantity,
            "avg_price": f.avg_fill_price,
            "source": "tick",
        }
        await bus.publish(EventType.ORDER_FILLED.value, payload)
        published.append(payload)

    portfolio = app.state.portfolio
    snapshot = await portfolio.persist_current()
    await bus.publish(
        EventType.POSITION_UPDATED.value,
        {"equity": snapshot.equity, "risk_score": snapshot.risk_score},
    )
    return published


async def apply_tick_results(app: FastAPI, filled_ids: list[str]) -> list[dict]:
    """Reconcile locally-stored orders, then publish fills + refresh analytics."""
    if not filled_ids:
        return []
    orders = app.state.orders

    results: list[OrderResult] = []
    for order_id in filled_ids:
        row = await orders.refresh_by_broker_id(order_id)
        if row is not None:
            results.append(row)
    return await publish_fills(app, results)


@router.post("/reset")
async def reset_state(request: Request):
    """Wipe broker state AND every local table; back to a fresh demo."""
    broker = _mock_broker(request)
    broker.reset()
    async with request.app.state.session_factory() as session:
        for model in _LOCAL_TABLES:
            await session.execute(delete(model))
        await session.commit()
    request.app.state.bus.clear()
    return {"status": "ok", "action": "reset", "broker_mode": request.app.state.settings.broker_mode}


@router.post("/tick")
async def force_tick(request: Request):
    """Advance mock prices once and fill any crossed limit orders."""
    broker = _mock_broker(request)
    filled_ids = await broker.tick()
    published = await apply_tick_results(request.app, filled_ids)
    return {"status": "ok", "filled_order_ids": [p["order_id"] for p in published], "fills": published}


@router.post("/fill-now/{order_id}")
async def fill_order_now(order_id: str, request: Request):
    """Force-fill a resting limit order at the current price (demo shortcut).

    Accepts either the local order id (UUID) or the broker order id.
    """
    from sqlalchemy import select

    broker = _mock_broker(request)

    # Resolve local UUID -> broker order id; fall back to direct key.
    async with request.app.state.session_factory() as session:
        row = (
            await session.execute(
                select(OrderModel).where(OrderModel.id == order_id)
            )
        ).scalar_one_or_none()
    broker_order_id = row.broker_order_id if row and row.broker_order_id else order_id

    try:
        await broker.force_fill(broker_order_id)
    except OrderNotFoundError as exc:
        raise NotFoundError(str(exc))
    except InvalidOrderError as exc:
        raise ConflictError(str(exc))
    published = await apply_tick_results(request.app, [broker_order_id])
    return {"status": "ok", "fills": published}
