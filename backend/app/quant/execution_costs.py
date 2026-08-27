"""Conservative execution-cost estimates for pre-trade risk checks."""
from app.schemas.quant import ExecutionCostEstimate, ExecutionCostRequest


def estimate_execution_cost(request: ExecutionCostRequest, settings) -> ExecutionCostEstimate:
    """Estimate spread/slippage, impact, commission, and all-in cash impact.

    The estimate is deliberately conservative and is not a substitute for the
    broker's final fill report. Market impact is based on order participation
    when average daily volume is available and is capped by configuration.
    """
    gross_notional = request.reference_price * request.quantity
    participation_rate_pct = None
    market_impact_bps = 0.0
    if request.average_daily_volume:
        participation_rate_pct = request.quantity / request.average_daily_volume * 100.0
        market_impact_bps = min(
            settings.execution_max_market_impact_bps,
            participation_rate_pct * settings.execution_market_impact_bps_per_1pct_adv,
        )

    effective_slippage_bps = settings.execution_base_slippage_bps + market_impact_bps
    estimated_slippage = gross_notional * effective_slippage_bps / 10_000
    commission = request.quantity * settings.execution_commission_per_share
    fixed_fee = settings.execution_fixed_fee
    total_cost = estimated_slippage + commission + fixed_fee

    return ExecutionCostEstimate(
        symbol=request.symbol,
        side=request.side,
        order_type=request.order_type,
        quantity=request.quantity,
        reference_price=round(request.reference_price, 6),
        gross_notional=round(gross_notional, 2),
        participation_rate_pct=round(participation_rate_pct, 4) if participation_rate_pct is not None else None,
        base_slippage_bps=round(settings.execution_base_slippage_bps, 4),
        market_impact_bps=round(market_impact_bps, 4),
        effective_slippage_bps=round(effective_slippage_bps, 4),
        estimated_slippage=round(estimated_slippage, 2),
        commission=round(commission, 2),
        fixed_fee=round(fixed_fee, 2),
        total_cost=round(total_cost, 2),
        buy_cash_required=round(gross_notional + total_cost, 2),
        sell_net_proceeds=round(max(gross_notional - total_cost, 0.0), 2),
    )
