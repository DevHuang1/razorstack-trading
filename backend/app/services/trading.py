"""Trading orchestration: proposal -> risk check -> order -> events.

The public pipeline is `propose()` / `execute()`. Nothing ever reaches the
broker without a risk decision, and every step emits an event so the AI and
frontend teams can follow the full lifecycle over /events or the WebSocket.
"""
import asyncio
import logging
from uuid import uuid4

from sqlalchemy import select

from app.core.errors import ConflictError, NotFoundError
from app.events.manager import EventBus
from app.models.risk_decision import RiskDecisionModel
from app.models.trade import TradeProposalModel
from app.schemas.event import EventType
from app.schemas.order import OrderResult
from app.schemas.risk import RiskDecisionStatus, RiskResult
from app.schemas.trade import (
    ExecuteTradeRequest,
    ProposalStatus,
    ProposeResponse,
    TradeProposal,
    TradeProposalOut,
)
from app.services.order_manager import OrderManager
from app.services.risk import RiskEngine

logger = logging.getLogger(__name__)

_DECISION_EVENTS = {
    RiskDecisionStatus.APPROVED: EventType.TRADE_APPROVED.value,
    RiskDecisionStatus.ADJUSTED: EventType.TRADE_ADJUSTED.value,
    RiskDecisionStatus.REJECTED: EventType.TRADE_REJECTED.value,
}


class TradingService:
    def __init__(self, session_factory, portfolio, risk: RiskEngine, orders: OrderManager, bus: EventBus):
        self.session_factory = session_factory
        self.portfolio = portfolio
        self.risk = risk
        self.orders = orders
        self.bus = bus
        # Serializes the risk-evaluate -> place-order critical section so two
        # concurrent proposals can't both read the same snapshot and over-trade.
        self._lock = asyncio.Lock()

    # ----------------------------------------------------------------- public
    async def propose(self, proposal: TradeProposal) -> ProposeResponse:
        return await self._process(proposal)

    async def execute(self, payload: ExecuteTradeRequest) -> ProposeResponse:
        row = await self._get_proposal_row(payload.proposal_id)
        if row.status == ProposalStatus.EXECUTED.value:
            raise ConflictError(f"proposal {payload.proposal_id} was already executed")
        proposal = TradeProposal(
            id=row.id,
            agent_id=row.agent_id,
            symbol=row.symbol,
            side=row.side,
            quantity=row.quantity,
            order_type=row.order_type,
            limit_price=row.limit_price,
            strategy=row.strategy,
            confidence=row.confidence,
            reasoning=row.reasoning,
            created_at=row.created_at,
        )
        return await self._process(proposal)

    async def cancel_order(self, order_id: str) -> OrderResult:
        order = await self.orders.cancel_order(order_id)
        await self.bus.publish(
            EventType.ORDER_CANCELED.value,
            {"order_id": order.id, "symbol": order.symbol, "broker_order_id": order.broker_order_id},
        )
        return order

    async def list_proposals(self, limit: int = 50) -> list[TradeProposalOut]:
        async with self.session_factory() as session:
            rows = (
                await session.execute(
                    select(TradeProposalModel)
                    .order_by(TradeProposalModel.created_at.desc())
                    .limit(limit)
                )
            ).scalars().all()
        return [TradeProposalOut.model_validate(row) for row in rows]

    async def get_proposal(self, proposal_id: str) -> TradeProposalOut:
        return TradeProposalOut.model_validate(await self._get_proposal_row(proposal_id))

    # ---------------------------------------------------------------- internal
    async def _process(self, proposal: TradeProposal) -> ProposeResponse:
        async with self._lock:
            return await self._run_pipeline(proposal)

    async def _run_pipeline(self, proposal: TradeProposal) -> ProposeResponse:
        out = await self._persist_proposal(proposal)
        await self.bus.publish(
            EventType.TRADE_PROPOSED.value,
            {
                "proposal_id": proposal.id,
                "agent_id": proposal.agent_id,
                "symbol": proposal.symbol,
                "side": proposal.side.value,
                "quantity": proposal.quantity,
                "order_type": proposal.order_type.value,
                "strategy": proposal.strategy,
                "confidence": proposal.confidence,
            },
        )
        await self.bus.publish(
            EventType.RISK_CHECK_STARTED.value,
            {"proposal_id": proposal.id, "symbol": proposal.symbol},
        )

        decision = await self.risk.evaluate(proposal)
        await self._persist_decision(decision, proposal.id)
        await self.bus.publish(
            _DECISION_EVENTS[decision.status],
            {
                "proposal_id": proposal.id,
                "status": decision.status.value,
                "code": decision.code,
                "reason": decision.reason,
                "original_quantity": decision.original_quantity,
                "approved_quantity": decision.approved_quantity,
            },
        )

        if decision.status == RiskDecisionStatus.REJECTED:
            out = await self._set_proposal_status(proposal.id, ProposalStatus.REJECTED.value)
            return ProposeResponse(
                proposal=out,
                risk=decision,
                order=None,
                message=f"trade rejected: {decision.reason}",
            )

        try:
            order = await self.orders.place_order(
                proposal_id=proposal.id,
                agent_id=proposal.agent_id,
                symbol=proposal.symbol,
                side=proposal.side.value,
                quantity=decision.approved_quantity,
                order_type=proposal.order_type.value,
                limit_price=proposal.limit_price,
            )
        except Exception as exc:
            logger.exception("order placement failed after risk approval")
            await self.bus.publish(
                EventType.ORDER_FAILED.value,
                {
                    "proposal_id": proposal.id,
                    "symbol": proposal.symbol,
                    "error": str(exc),
                },
            )
            out = await self._set_proposal_status(proposal.id, ProposalStatus.REJECTED.value)
            return ProposeResponse(
                proposal=out,
                risk=decision,
                order=None,
                message=f"order rejected by broker: {exc}",
            )

        await self.bus.publish(
            EventType.ORDER_SUBMITTED.value,
            {"order_id": order.id, "proposal_id": proposal.id, "symbol": order.symbol, "quantity": order.quantity},
        )
        if order.status == "FILLED":
            await self._publish_fill(order)

        out = await self._set_proposal_status(proposal.id, ProposalStatus.EXECUTED.value)

        snapshot = await self.portfolio.persist_current()
        await self.bus.publish(
            EventType.POSITION_UPDATED.value,
            {"equity": snapshot.equity, "risk_score": snapshot.risk_score},
        )

        if decision.status == RiskDecisionStatus.ADJUSTED:
            message = (
                f"risk adjusted {proposal.side.value} {proposal.symbol}: "
                f"{decision.original_quantity} -> {decision.approved_quantity} shares; order executed"
            )
        else:
            message = f"trade approved; {order.side} {order.quantity} {order.symbol} {order.status.lower()}"
        return ProposeResponse(proposal=out, risk=decision, order=order, message=message)

    async def _publish_fill(self, order: OrderResult) -> None:
        await self.bus.publish(
            EventType.ORDER_FILLED.value,
            {
                "order_id": order.id,
                "proposal_id": order.proposal_id,
                "symbol": order.symbol,
                "quantity": order.filled_quantity,
                "avg_price": order.avg_fill_price,
            },
        )

    # -------------------------------------------------------------- persistence
    async def _persist_proposal(self, proposal: TradeProposal) -> TradeProposalOut:
        row = TradeProposalModel(
            id=proposal.id,
            agent_id=proposal.agent_id,
            symbol=proposal.symbol,
            side=proposal.side.value,
            quantity=proposal.quantity,
            order_type=proposal.order_type.value,
            limit_price=proposal.limit_price,
            strategy=proposal.strategy,
            confidence=proposal.confidence,
            reasoning=proposal.reasoning,
            status=ProposalStatus.PROPOSED.value,
            created_at=proposal.created_at,
        )
        async with self.session_factory() as session:
            await session.merge(row)
            await session.commit()
        return TradeProposalOut.model_validate(row)

    async def _set_proposal_status(self, proposal_id: str, status: str) -> TradeProposalOut:
        async with self.session_factory() as session:
            row = await session.get(TradeProposalModel, proposal_id)
            if row is None:
                raise NotFoundError(f"proposal {proposal_id} not found")
            row.status = status
            await session.commit()
            return TradeProposalOut.model_validate(row)

    async def _persist_decision(self, decision: RiskResult, proposal_id: str) -> None:
        # Upsert by proposal_id so re-running risk (e.g. via /trades/execute on a
        # rejected proposal) updates the existing decision instead of appending
        # a new row every time. One decision per proposal.
        async with self.session_factory() as session:
            existing = (
                await session.execute(
                    select(RiskDecisionModel).where(RiskDecisionModel.proposal_id == proposal_id)
                )
            ).scalar_one_or_none()
            if existing is None:
                existing = RiskDecisionModel(id=str(uuid4()), proposal_id=proposal_id)
                session.add(existing)
            existing.status = decision.status.value
            existing.reason = decision.reason
            existing.code = decision.code
            existing.risk_score = decision.risk_score
            existing.original_quantity = decision.original_quantity
            existing.approved_quantity = decision.approved_quantity
            existing.details = decision.details
            await session.commit()

    async def _get_proposal_row(self, proposal_id: str) -> TradeProposalModel:
        async with self.session_factory() as session:
            row = (
                await session.execute(
                    select(TradeProposalModel).where(TradeProposalModel.id == proposal_id)
                )
            ).scalar_one_or_none()
        if row is None:
            raise NotFoundError(f"proposal {proposal_id} not found")
        return row


def build_trading_service(session_factory, portfolio, risk, orders, bus) -> TradingService:
    """Convenience factory used by main.create_app."""
    return TradingService(session_factory, portfolio, risk, orders, bus)
