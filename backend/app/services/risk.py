"""Risk Engine.

Every inbound trade proposal is evaluated here before any order reaches the
broker. Hard halts (daily loss, max drawdown) reject everything; concentration
and cash rules either approve as-is, scale the quantity down (ADJUSTED), or
reject when nothing can be traded.
"""
import logging
import math

from app.integrations.base import BrokerError, BrokerService
from app.quant.execution_costs import estimate_execution_cost
from app.schemas.quant import ExecutionCostRequest
from app.schemas.risk import RiskDecisionStatus, RiskResult
from app.schemas.trade import TradeProposal
from app.services.portfolio import PortfolioService

logger = logging.getLogger(__name__)

CODE_DAILY_LOSS_HALT = "DAILY_LOSS_HALT"
CODE_DRAWDOWN_HALT = "DRAWDOWN_HALT"
CODE_POSITION_CAP = "POSITION_CAP"
CODE_SECTOR_CAP = "SECTOR_CAP"
CODE_INSUFFICIENT_CASH = "INSUFFICIENT_CASH"
CODE_NO_PRICE = "NO_PRICE"
CODE_INSUFFICIENT_POSITION = "INSUFFICIENT_POSITION"

_REJECT_REASONS = {
    CODE_POSITION_CAP: "position cap exceeded for symbol",
    CODE_SECTOR_CAP: "sector exposure cap exceeded",
    CODE_INSUFFICIENT_CASH: "cash would fall below the minimum cash floor",
}


class RiskEngine:
    def __init__(self, portfolio: PortfolioService, broker: BrokerService, settings):
        self.portfolio = portfolio
        self.broker = broker
        self.settings = settings

    # ----------------------------------------------------------------- public
    async def evaluate(self, proposal: TradeProposal) -> RiskResult:
        snapshot, metrics = await self.portfolio.get_snapshot()
        equity = snapshot.equity
        cash = snapshot.cash
        limits = self.settings

        details: dict = {
            "equity": round(equity, 2),
            "cash": round(cash, 2),
            "side": proposal.side.value,
        }

        # ---- hard halts -------------------------------------------------
        if (
            limits.max_daily_loss_percent > 0
            and metrics["daily_loss_pct"] >= limits.max_daily_loss_percent
        ):
            return self._reject(
                CODE_DAILY_LOSS_HALT,
                "daily loss limit reached; trading halted until next session",
                proposal.quantity,
                metrics,
                details,
            )
        if (
            limits.max_drawdown_percent > 0
            and metrics["drawdown_pct"] >= limits.max_drawdown_percent
        ):
            return self._reject(
                CODE_DRAWDOWN_HALT,
                "max drawdown exceeded; crisis mode active",
                proposal.quantity,
                metrics,
                details,
            )

        price = await self._reference_price(proposal)
        if price <= 0:
            return self._reject(
                CODE_NO_PRICE,
                f"no valid reference price available for {proposal.symbol}",
                proposal.quantity,
                metrics,
                details,
            )

        notional = price * proposal.quantity
        requested_cost = estimate_execution_cost(
            ExecutionCostRequest(
                symbol=proposal.symbol,
                side=proposal.side.value,
                quantity=proposal.quantity,
                reference_price=price,
                order_type=proposal.order_type.value,
            ),
            self.settings,
        )
        details["reference_price"] = round(price, 4)
        details["requested_notional"] = round(notional, 2)
        details["execution_cost"] = requested_cost.model_dump()

        # ---- sells reduce exposure ---------------------------------------
        if proposal.side.value == "sell":
            held = sum(
                p.quantity for p in snapshot.positions if p.symbol == proposal.symbol.upper()
            )
            if proposal.quantity > held:
                return self._reject(
                    CODE_INSUFFICIENT_POSITION,
                    f"cannot sell {proposal.quantity} {proposal.symbol}: "
                    f"only {held} share(s) held (no shorting)",
                    proposal.quantity,
                    metrics,
                    details,
                )
            details["post_trade_cash"] = round(cash + requested_cost.sell_net_proceeds, 2)
            return RiskResult(
                status=RiskDecisionStatus.APPROVED,
                reason="sell reduces exposure; approved",
                risk_score=self._score(metrics),
                original_quantity=proposal.quantity,
                approved_quantity=proposal.quantity,
                details=details,
            )

        # ---- buys: concentration & cash rules -----------------------------
        symbol_value = sum(
            float(p.market_value) for p in snapshot.positions if p.symbol == proposal.symbol
        )
        sector = self.settings.sector_map.get(proposal.symbol, "other")
        sector_value = float(metrics["sector_values"].get(sector, 0.0))

        position_cap = limits.max_position_percent * equity
        sector_cap = limits.max_sector_exposure_percent * equity
        cash_floor = limits.min_cash_percent * equity

        max_position_qty = math.floor(max(position_cap - symbol_value, 0.0) / price)
        max_sector_qty = math.floor(max(sector_cap - sector_value, 0.0) / price)
        max_cash_qty = self._max_cash_quantity(
            proposal=proposal,
            price=price,
            cash_available=max(cash - cash_floor, 0.0),
        )
        quantity_limits = {
            CODE_POSITION_CAP: max_position_qty,
            CODE_SECTOR_CAP: max_sector_qty,
            CODE_INSUFFICIENT_CASH: max_cash_qty,
        }
        binding_code, allowed_qty = min(quantity_limits.items(), key=lambda kv: kv[1])

        details.update(
            {
                "sector": sector,
                "current_symbol_value": round(symbol_value, 2),
                "position_cap": round(position_cap, 2),
                "current_sector_value": round(sector_value, 2),
                "sector_cap": round(sector_cap, 2),
                "cash_floor": round(cash_floor, 2),
            }
        )

        approved_qty = min(proposal.quantity, max(0, allowed_qty))

        if approved_qty <= 0:
            reason = _REJECT_REASONS.get(binding_code, binding_code.lower())
            return self._reject(binding_code, reason, proposal.quantity, metrics, details)

        approved_cost = estimate_execution_cost(
            ExecutionCostRequest(
                symbol=proposal.symbol,
                side=proposal.side.value,
                quantity=approved_qty,
                reference_price=price,
                order_type=proposal.order_type.value,
            ),
            self.settings,
        )
        post_symbol = symbol_value + approved_qty * price
        post_sector = sector_value + approved_qty * price
        post_cash = cash - approved_cost.buy_cash_required
        details.update(
            {
                "approved_notional": round(approved_qty * price, 2),
                "approved_execution_cost": approved_cost.model_dump(),
                "post_trade_symbol_exposure_pct": round(post_symbol / equity, 4) if equity > 0 else 0.0,
                "post_trade_sector_exposure_pct": round(post_sector / equity, 4) if equity > 0 else 0.0,
                "post_trade_cash": round(post_cash, 2),
            }
        )
        score = self._score(metrics)

        if approved_qty == proposal.quantity:
            return RiskResult(
                status=RiskDecisionStatus.APPROVED,
                reason="within all risk limits",
                risk_score=score,
                original_quantity=proposal.quantity,
                approved_quantity=approved_qty,
                details=details,
            )
        return RiskResult(
            status=RiskDecisionStatus.ADJUSTED,
            reason=(
                f"quantity scaled from {proposal.quantity} to {approved_qty} "
                f"due to {_REJECT_REASONS[binding_code]}"
            ),
            code=binding_code,
            risk_score=score,
            original_quantity=proposal.quantity,
            approved_quantity=approved_qty,
            details=details,
        )

    # ---------------------------------------------------------------- helpers
    def _max_cash_quantity(self, *, proposal: TradeProposal, price: float, cash_available: float) -> int:
        """Find the largest buy quantity whose all-in estimate fits the cash floor."""
        if proposal.side.value != "buy" or cash_available <= 0:
            return 0
        low, high = 0, proposal.quantity
        while low < high:
            candidate = (low + high + 1) // 2
            estimate = estimate_execution_cost(
                ExecutionCostRequest(
                    symbol=proposal.symbol,
                    side="buy",
                    quantity=candidate,
                    reference_price=price,
                    order_type=proposal.order_type.value,
                ),
                self.settings,
            )
            if estimate.buy_cash_required <= cash_available + 1e-9:
                low = candidate
            else:
                high = candidate - 1
        return low

    async def _reference_price(self, proposal: TradeProposal) -> float:
        if proposal.limit_price is not None:
            return float(proposal.limit_price)
        try:
            tick = await self.broker.get_market_data(proposal.symbol)
        except BrokerError:
            # No quote / unknown symbol: let the NO_PRICE rejection path handle it
            # rather than bubbling up as a 502 broker error.
            return 0.0
        return float(tick.price)

    def _score(self, metrics: dict) -> float:
        return self.portfolio.compute_risk_score(metrics)

    def _reject(
        self, code: str, reason: str, original_quantity: int, metrics: dict, details: dict
    ) -> RiskResult:
        return RiskResult(
            status=RiskDecisionStatus.REJECTED,
            reason=reason,
            code=code,
            risk_score=self._score(metrics),
            original_quantity=original_quantity,
            approved_quantity=0,
            details=details,
        )
