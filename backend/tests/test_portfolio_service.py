"""PortfolioService tests: snapshot math, persistence, position mirroring."""
import pytest
from sqlalchemy import select

from app.models.position import PositionModel


async def _buy(services, symbol, qty):
    order = await services.broker.submit_order(
        symbol=symbol, side="buy", quantity=qty, order_type="market"
    )
    assert order.status == "FILLED"
    return order


async def test_snapshot_math_after_buys(services):
    await _buy(services, "NVDA", 40)   # 40 * 175 = 7_000 (technology)
    await _buy(services, "JPM", 20)    # 20 * 210 = 4_200 (financials)

    snapshot, metrics = await services.portfolio.get_snapshot()

    assert snapshot.equity == pytest.approx(100_000.0)
    assert snapshot.cash == pytest.approx(88_800.0)
    assert snapshot.total_pnl == pytest.approx(0.0)
    assert snapshot.daily_pnl == pytest.approx(0.0)

    by_symbol = {p.symbol: p for p in snapshot.positions}
    assert set(by_symbol) == {"NVDA", "JPM"}
    assert by_symbol["NVDA"].weight == pytest.approx(0.07)
    assert by_symbol["JPM"].weight == pytest.approx(0.042)

    assert snapshot.sector_exposure["technology"] == pytest.approx(0.07)
    assert snapshot.sector_exposure["financials"] == pytest.approx(0.042)

    assert metrics["top_symbol"] == "NVDA"
    assert metrics["top_sector_exposure_pct"] == pytest.approx(0.07)

    # worst utilization = 7% / 15% cap
    assert snapshot.risk_score == pytest.approx(0.4667, abs=1e-3)


async def test_persist_current_writes_history(services):
    await _buy(services, "KO", 10)
    first = await services.portfolio.persist_current()
    second = await services.portfolio.persist_current()
    assert second.equity == first.equity

    history = await services.portfolio.recent_snapshots()
    assert len(history) == 2
    assert history[0].created_at <= history[1].created_at


async def test_sync_positions_mirrors_broker(services):
    await _buy(services, "AAPL", 5)
    await _buy(services, "XOM", 30)
    await services.portfolio.sync_positions_from_broker()

    async with services.db() as session:
        symbols = {
            row.symbol
            for row in (await session.execute(select(PositionModel))).scalars()
        }
    assert symbols == {"AAPL", "XOM"}

    sell = await services.broker.submit_order(
        symbol="XOM", side="sell", quantity=30, order_type="market"
    )
    assert sell.status == "FILLED"
    await services.portfolio.sync_positions_from_broker()

    async with services.db() as session:
        rows = (await session.execute(select(PositionModel))).scalars().all()
    assert [row.symbol for row in rows] == ["AAPL"]


async def test_risk_score_clamped_between_zero_and_one(services):
    await _buy(services, "NVDA", 85)  # 14_875 = 14.9% of equity -> near the 15% cap
    snapshot, _metrics = await services.portfolio.get_snapshot()
    assert 0.0 <= snapshot.risk_score <= 1.0
    assert snapshot.risk_score > 0.9
