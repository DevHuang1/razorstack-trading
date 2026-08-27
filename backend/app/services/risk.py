"""Risk Engine.

Every inbound trade proposal is evaluated here before any order reaches the
broker. Hard halts (daily loss, max drawdown) reject everything; concentration
and cash rules either approve as-is, scale the quantity down (ADJUSTED), or
reject when nothing can be traded.
"""
import logging
import math

from app.integrations.base import BrokerService
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
        details["reference_price"] = round(price, 4)
        details["requested_notional"] = round(notional, 2)

        # ---- sells reduce exposure ---------------------------------------
        if proposal.side.value == "sell":
            details["post_trade_cash"] = round(cash + notional, 2)
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

        constraints = {
            CODE_POSITION_CAP: position_cap - symbol_value,
            CODE_SECTOR_CAP: sector_cap - sector_value,
            CODE_INSUFFICIENT_CASH: cash - cash_floor,
        }
        binding_code, allowed_notional = min(constraints.items(), key=lambda kv: kv[1])

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

        if allowed_notional < notional:
            affordable = math.floor(max(allowed_notional, 0.0) / price) if price > 0 else 0
            approved_qty = min(proposal.quantity, affordable)
        else:
            approved_qty = proposal.quantity

        if approved_qty <= 0:
            reason = _REJECT_REASONS.get(binding_code, binding_code.lower())
            return self._reject(binding_code, reason, proposal.quantity, metrics, details)

        post_symbol = symbol_value + approved_qty * price
        post_sector = sector_value + approved_qty * price
        post_cash = cash - approved_qty * price
        details.update(
            {
                "approved_notional": round(approved_qty * price, 2),
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
    async def _reference_price(self, proposal: TradeProposal) -> float:
        if proposal.limit_price is not None:
            return float(proposal.limit_price)
        tick = await self.broker.get_market_data(proposal.symbol)
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
