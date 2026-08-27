"""Order endpoints: list, status, cancel."""
from fastapi import APIRouter, Depends, Query

from app.api.deps import get_orders
from app.schemas.order import OrderResult
from app.schemas.trade import CancelTradeRequest
from app.services.order_manager import OrderManager

router = APIRouter(prefix="/orders", tags=["orders"])


@router.get("", response_model=list[OrderResult])
async def list_orders(
    limit: int = Query(default=50, ge=1, le=500),
    status: str | None = Query(default=None),
    orders: OrderManager = Depends(get_orders),
):
    return await orders.list_orders(limit=limit, status=status)


@router.post("/cancel", response_model=OrderResult)
async def cancel_order_by_body(
    payload: CancelTradeRequest, orders: OrderManager = Depends(get_orders)
):
    return await orders.cancel_order(payload.order_id)


@router.get("/{order_id}", response_model=OrderResult)
async def get_order(order_id: str, orders: OrderManager = Depends(get_orders)):
    order = await orders.get_order(order_id)
    if order.status not in ("FILLED", "CANCELED", "REJECTED", "FAILED"):
        order = await orders.refresh_status(order_id)
    return order


@router.delete("/{order_id}", response_model=OrderResult)
async def cancel_order(order_id: str, orders: OrderManager = Depends(get_orders)):
    return await orders.cancel_order(order_id)
