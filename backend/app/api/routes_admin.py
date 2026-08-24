"""Admin endpoints for demos and manual testing.

Available only when BROKER_MODE=mock; real Alpaca deployments get a 409 so
production state can never be wiped or simulated by accident.
"""
from fastapi import APIRouter, FastAPI, Request
from sqlalchemy import delete

from app.core.errors import ConflictError, NotFoundError
from app.events.manager import EventBus
from app.integrations.mock_alpaca import MockAlpacaService
from app.models.event import EventModel
from app.models.order import OrderModel
from app.models.position import PositionModel
from app.models.portfolio import PortfolioSnapshotModel
from app.models.risk_decision import RiskDecisionModel
from app.models.trade import TradeProposalModel
from app.schemas.event import EventType

router = APIRouter(prefix="/admin", tags=["admin"])

_TERMINAL = frozenset({"FILLED", "CANCELED", "REJECTED", "FAILED"})

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


async def apply_tick_results(app: FastAPI, filled_ids: list[str]) -> list[dict]:
    """Publish ORDER_FILLED for tick fills, then refresh snapshot + positions."""
    if not filled_ids:
        return []
    broker = app.state.broker
    bus: EventBus = app.state.bus

    published: list[dict] = []
    batch: list[tuple[str, dict]] = []
    for order_id in filled_ids:
        filled = await broker.get_order_status(order_id)
        payload = {
            "order_id": order_id,
            "broker_order_id": order_id,
            "symbol": filled.symbol,
            "quantity": filled.filled_quantity,
            "avg_price": filled.avg_fill_price,
            "source": "tick",
        }
        batch.append((EventType.ORDER_FILLED.value, payload))
        published.append(payload)
    if batch:
        await bus.publish_many(batch)

    portfolio = app.state.portfolio
    snapshot = await portfolio.persist_current()
    await bus.publish(
        EventType.POSITION_UPDATED.value,
        {"equity": snapshot.equity, "risk_score": snapshot.risk_score},
    )
    return published


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

    record = broker._orders.get(broker_order_id)
    if record is None:
        raise NotFoundError(f"order {order_id} not found")
    if record["status"] in _TERMINAL:
        raise ConflictError(f"order {order_id} already terminal ({record['status']})")

    async with broker._lock:
        broker._fill(broker_order_id, broker.price_for(record["symbol"]))
        broker._save()
    published = await apply_tick_results(request.app, [broker_order_id])
    return {"status": "ok", "fills": published}
