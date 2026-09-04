"""Admin endpoints for demos and manual testing.

Available only when BROKER_MODE=mock; real Alpaca deployments get a 409 so
production state can never be wiped or simulated by accident.
"""
from fastapi import APIRouter, Depends, FastAPI, Request
from sqlalchemy import delete

from app.core.auth import require_api_key
from app.core.errors import ConflictError, NotFoundError
from app.events.manager import EventBus
from app.integrations.base import (
    InvalidOrderError,
    OrderNotFoundError,
    TERMINAL_ORDER_STATUSES,
)
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


def _stack(request: Request) -> dict:
    from app.api.deps import get_role

    return request.app.state.stacks[get_role(request)]


def _mock_broker(request: Request) -> MockAlpacaService:
    broker = _stack(request)["broker"]
    if not isinstance(broker, MockAlpacaService):
        raise ConflictError("admin simulation endpoints require BROKER_MODE=mock")
    return broker


async def publish_fills_app(app: FastAPI, fills: list[OrderResult]) -> list[dict]:
    """Role-aware wrapper: publish fills for every role's stack."""
    published: list[dict] = []
    for stack in app.state.stacks.values():
        published.extend(await publish_fills_stack(stack, fills))
    return published


async def publish_fills_stack(stack: dict, fills: list[OrderResult]) -> list[dict]:
    """Emit ORDER_FILLED for each freshly-filled order and refresh analytics."""
    if not fills:
        return []
    bus: EventBus = stack["bus"]

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

    portfolio = stack["portfolio"]
    snapshot = await portfolio.persist_current()
    await bus.publish(
        EventType.POSITION_UPDATED.value,
        {"equity": snapshot.equity, "risk_score": snapshot.risk_score},
    )
    return published


async def apply_tick_results_app(app: FastAPI, filled_ids: list[str]) -> list[dict]:
    """Role-aware wrapper: reconcile + publish fills for every role's stack."""
    if not filled_ids:
        return []
    published: list[dict] = []
    for stack in app.state.stacks.values():
        results = await _reconcile_filled(stack, filled_ids)
        published.extend(await publish_fills_stack(stack, results))
    return published


async def _reconcile_filled(stack: dict, filled_ids: list[str]) -> list[OrderResult]:
    orders = stack["orders"]
    results: list[OrderResult] = []
    for order_id in filled_ids:
        result = await orders.refresh_by_broker_id(order_id)
        if result and result.status in TERMINAL_ORDER_STATUSES:
            results.append(result)
    return results


@router.post("/reset")
async def reset_state(request: Request):
    """Wipe broker state AND every local table; back to a fresh demo."""
    stack = _stack(request)
    broker = _mock_broker(request)
    broker.reset()
    async with stack["session_factory"]() as session:
        for model in _LOCAL_TABLES:
            await session.execute(delete(model))
        await session.commit()
    stack["bus"].clear()
    return {"status": "ok", "action": "reset", "broker_mode": request.app.state.settings.broker_mode}


@router.post("/tick")
async def force_tick(request: Request):
    """Advance mock prices once and fill any crossed limit orders."""
    stack = _stack(request)
    broker = _mock_broker(request)
    filled_ids = await broker.tick()
    published = await publish_fills_stack(stack, await _reconcile_filled(stack, filled_ids))
    return {"status": "ok", "filled_order_ids": [p["order_id"] for p in published], "fills": published}


@router.post("/fill-now/{order_id}")
async def fill_order_now(order_id: str, request: Request):
    """Force-fill a resting limit order at the current price (demo shortcut).

    Accepts either the local order id (UUID) or the broker order id.
    """
    from sqlalchemy import select

    stack = _stack(request)
    broker = _mock_broker(request)

    # Resolve local UUID -> broker order id; fall back to direct key.
    async with stack["session_factory"]() as session:
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
    published = await publish_fills_stack(stack, await _reconcile_filled(stack, [broker_order_id]))
    return {"status": "ok", "fills": published}
