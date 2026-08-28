"""Risk Engine unit tests: halts, caps, adjustments, cash floor."""
from datetime import timedelta

from app.db.base import utcnow
from app.models.portfolio import PortfolioSnapshotModel
from app.schemas.risk import RiskDecisionStatus
from app.schemas.trade import TradeOrderType, TradeSide, TradeProposal


def prop(symbol: str, quantity: int, side=TradeSide.BUY, order_type=TradeOrderType.MARKET,
         limit_price=None) -> TradeProposal:
    return TradeProposal(
        agent_id="risk-test",
        symbol=symbol,
        side=side,
        quantity=quantity,
        order_type=order_type,
        limit_price=limit_price,
        confidence=0.9,
    )


async def _seed_snapshots(services, rows):
    async with services.db() as session:
        for equity, offset in rows:
            session.add(
                PortfolioSnapshotModel(
                    equity=equity,
                    cash=equity,
                    buying_power=equity,
                    created_at=utcnow() - timedelta(seconds=offset),
                )
            )
        await session.commit()


async def test_small_buy_approved(services):
    result = await services.risk.evaluate(prop("AAPL", 10))
    assert result.status == RiskDecisionStatus.APPROVED
    assert result.approved_quantity == 10
    assert result.code == ""
    assert result.details["reference_price"] > 0


async def test_position_cap_scales_quantity_down(services):
    result = await services.risk.evaluate(prop("NVDA", 500))
    assert result.status == RiskDecisionStatus.ADJUSTED
    assert result.code == "POSITION_CAP"
    assert 0 < result.approved_quantity < 500
    price = result.details["reference_price"]
    notional = result.approved_quantity * price
    assert notional <= services.settings.max_position_percent * 100_000 + 1e-6


async def test_sector_cap_binds_when_tech_is_full(services):
    for symbol, qty in (("NVDA", 74), ("MSFT", 30), ("GOOGL", 80)):
        fill = await services.broker.submit_order(
            symbol=symbol, side="buy", quantity=qty, order_type="market"
        )
        assert fill.status == "FILLED"

    result = await services.risk.evaluate(prop("META", 20))
    assert result.status == RiskDecisionStatus.ADJUSTED
    assert result.code == "SECTOR_CAP"
    assert 0 < result.approved_quantity < 20


async def test_cash_floor_rejects_with_zero_headroom(services):
    services.settings.min_cash_percent = 1.0
    result = await services.risk.evaluate(prop("KO", 300))
    assert result.status == RiskDecisionStatus.REJECTED
    assert result.code == "INSUFFICIENT_CASH"
    assert result.approved_quantity == 0


async def test_daily_loss_halt_rejects_everything(services):
    await _seed_snapshots(services, [(120_000.0, 60)])
    result = await services.risk.evaluate(prop("AAPL", 1))
    assert result.status == RiskDecisionStatus.REJECTED
    assert result.code == "DAILY_LOSS_HALT"


async def test_drawdown_halt_rejects_everything(services):
    await _seed_snapshots(services, [(200_000.0, 3 * 86_400), (100_000.0, 30)])
    result = await services.risk.evaluate(prop("MSFT", 1))
    assert result.status == RiskDecisionStatus.REJECTED
    assert result.code == "DRAWDOWN_HALT"


async def test_sell_rejected_without_holdings(services):
    result = await services.risk.evaluate(prop("KO", 5, side=TradeSide.SELL))
    assert result.status == RiskDecisionStatus.REJECTED
    assert result.code == "INSUFFICIENT_POSITION"
    assert result.approved_quantity == 0


async def test_sell_approved_with_sufficient_holdings(services):
    await services.broker.submit_order(symbol="KO", side="buy", quantity=10, order_type="market")
    result = await services.risk.evaluate(prop("KO", 5, side=TradeSide.SELL))
    assert result.status == RiskDecisionStatus.APPROVED
    assert result.approved_quantity == 5


async def test_limit_order_uses_limit_as_reference_price(services):
    result = await services.risk.evaluate(
        prop("AAPL", 10, order_type=TradeOrderType.LIMIT, limit_price=100.00)
    )
    assert result.status == RiskDecisionStatus.APPROVED
    assert result.details["reference_price"] == 100.00
