"""Order lifecycle management: broker calls plus a local audit trail.

The broker is the source of truth for execution; every submitted order is
mirrored into the `orders` table so the API can serve history, status and
cancellations without hitting the broker.
"""
import logging
from uuid import uuid4

from sqlalchemy import select

from app.core.errors import ConflictError, NotFoundError
from app.db.base import utcnow
from app.integrations.base import BrokerService, TERMINAL_ORDER_STATUSES
from app.models.order import OrderModel
from app.schemas.order import OrderResult

logger = logging.getLogger(__name__)


class OrderManager:
    def __init__(self, broker: BrokerService, session_factory):
        self.broker = broker
        self.session_factory = session_factory

    # ----------------------------------------------------------------- writes
    async def place_order(
        self,
        *,
        proposal_id: str | None,
        agent_id: str,
        symbol: str,
        side: str,
        quantity: int,
        order_type: str,
        limit_price: float | None = None,
    ) -> OrderResult:
        broker_order = await self.broker.submit_order(
            symbol=symbol,
            side=side,
            quantity=quantity,
            order_type=order_type,
            limit_price=limit_price,
        )
        row = OrderModel(
            id=str(uuid4()),
            broker_order_id=broker_order.id,
            proposal_id=proposal_id,
            agent_id=agent_id,
            symbol=symbol.upper(),
            side=side.lower(),
            quantity=quantity,
            filled_quantity=broker_order.filled_quantity,
            avg_fill_price=broker_order.avg_fill_price,
            order_type=order_type,
            limit_price=limit_price,
            status=broker_order.status,
            submitted_at=broker_order.submitted_at or utcnow(),
            filled_at=broker_order.filled_at,
        )
        async with self.session_factory() as session:
            session.add(row)
            await session.commit()
        logger.info(
            "order placed",
            extra={
                "order_id": row.id,
                "broker_order_id": broker_order.id,
                "symbol": row.symbol,
                "side": row.side,
                "quantity": quantity,
                "status": row.status,
            },
        )
        return self._to_result(row)

    async def cancel_order(self, order_id: str) -> OrderResult:
        row = await self._get_row(order_id)
        if row.status in TERMINAL_ORDER_STATUSES:
            raise ConflictError(f"order {order_id} already terminal ({row.status})")
        broker_order = await self.broker.cancel_order(row.broker_order_id)
        async with self.session_factory() as session:
            merged = await session.merge(row)
            merged.status = broker_order.status
            await session.commit()
            result = self._to_result(merged)
        logger.info("order canceled", extra={"order_id": order_id})
        return result

    async def refresh_status(self, order_id: str) -> OrderResult:
        """Poll the broker for the latest status and update the local row."""
        row = await self._get_row(order_id)
        if row.status in TERMINAL_ORDER_STATUSES or not row.broker_order_id:
            return self._to_result(row)
        latest = await self.broker.get_order_status(row.broker_order_id)
        async with self.session_factory() as session:
            merged = await session.merge(row)
            merged.status = latest.status
            merged.filled_quantity = max(merged.filled_quantity, latest.filled_quantity)
            merged.avg_fill_price = latest.avg_fill_price or merged.avg_fill_price
            merged.filled_at = latest.filled_at or merged.filled_at
            await session.commit()
            return self._to_result(merged)

    async def refresh_by_broker_id(self, broker_order_id: str) -> OrderResult | None:
        """Update the local row that maps to a broker order id (no-op if absent)."""
        async with self.session_factory() as session:
            row = (
                await session.execute(
                    select(OrderModel).where(OrderModel.broker_order_id == broker_order_id)
                )
            ).scalar_one_or_none()
            if row is None:
                return None
            if row.status in TERMINAL_ORDER_STATUSES or not row.broker_order_id:
                return self._to_result(row)
            latest = await self.broker.get_order_status(row.broker_order_id)
            row.status = latest.status
            row.filled_quantity = max(row.filled_quantity, latest.filled_quantity)
            row.avg_fill_price = latest.avg_fill_price or row.avg_fill_price
            row.filled_at = latest.filled_at or row.filled_at
            await session.commit()
            return self._to_result(row)

    async def reconcile_open_orders(self) -> list[OrderResult]:
        """Refresh every non-terminal local order from the broker and persist.

        Returns the orders that transitioned to FILLED during this pass so a
        caller can emit ``ORDER_FILLED`` events (used by the Alpaca poll loop).
        """
        async with self.session_factory() as session:
            rows = (
                await session.execute(
                    select(OrderModel).where(OrderModel.status.notin_(TERMINAL_ORDER_STATUSES))
                )
            ).scalars().all()
            filled: list[OrderResult] = []
            for row in rows:
                if not row.broker_order_id:
                    continue
                latest = await self.broker.get_order_status(row.broker_order_id)
                newly_filled = latest.status == "FILLED" and row.status != "FILLED"
                row.status = latest.status
                row.filled_quantity = max(row.filled_quantity, latest.filled_quantity)
                row.avg_fill_price = latest.avg_fill_price or row.avg_fill_price
                row.filled_at = latest.filled_at or row.filled_at
                if newly_filled:
                    filled.append(self._to_result(row))
            await session.commit()
        return filled

    # ------------------------------------------------------------------ reads
    async def get_order(self, order_id: str) -> OrderResult:
        return self._to_result(await self._get_row(order_id))

    async def list_orders(
        self, limit: int = 50, status: str | None = None
    ) -> list[OrderResult]:
        query = select(OrderModel).order_by(OrderModel.created_at.desc()).limit(limit)
        if status:
            query = query.where(OrderModel.status == status.upper())
        async with self.session_factory() as session:
            rows = (await session.execute(query)).scalars().all()
        return [self._to_result(row) for row in rows]

    # ---------------------------------------------------------------- helpers
    async def _get_row(self, order_id: str) -> OrderModel:
        async with self.session_factory() as session:
            row = (
                await session.execute(
                    select(OrderModel).where(OrderModel.id == order_id)
                )
            ).scalar_one_or_none()
        if row is None:
            raise NotFoundError(f"order {order_id} not found")
        return row

    @staticmethod
    def _to_result(row: OrderModel) -> OrderResult:
        return OrderResult(
            id=row.id,
            broker_order_id=row.broker_order_id,
            proposal_id=row.proposal_id,
            agent_id=row.agent_id,
            symbol=row.symbol,
            side=row.side,
            quantity=row.quantity,
            filled_quantity=row.filled_quantity,
            avg_fill_price=row.avg_fill_price,
            order_type=row.order_type,
            limit_price=row.limit_price,
            status=row.status,
            reject_reason=row.reject_reason,
            created_at=row.created_at,
            submitted_at=row.submitted_at,
            filled_at=row.filled_at,
        )
