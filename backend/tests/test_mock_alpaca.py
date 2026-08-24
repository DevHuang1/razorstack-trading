"""Unit tests for the deterministic MockAlpacaService."""
import pytest

from app.integrations.base import (
    InsufficientFundsError,
    InvalidOrderError,
    OrderNotFoundError,
)
from app.integrations.mock_alpaca import MockAlpacaService


@pytest.fixture
def broker():
    return MockAlpacaService(initial_cash=10_000.0)


async def test_account_defaults(broker):
    account = await broker.get_account()
    assert account.equity == 10_000.0
    assert account.cash == 10_000.0
    assert account.buying_power == 10_000.0
    assert account.paper is True


async def test_market_buy_then_sell_roundtrip(broker):
    order = await broker.submit_order(symbol="aapl", side="buy", quantity=2, order_type="market")
    assert order.status == "FILLED"
    assert order.filled_quantity == 2
    assert order.avg_fill_price == pytest.approx(227.50)

    position = await broker.get_position("AAPL")
    assert position is not None and position.quantity == 2

    sell = await broker.submit_order(symbol="AAPL", side="sell", quantity=2, order_type="market")
    assert sell.status == "FILLED"
    assert await broker.get_position("AAPL") is None

    account = await broker.get_account()
    assert account.cash == pytest.approx(10_000.0, abs=1e-6)


async def test_insufficient_funds_rejected(broker):
    with pytest.raises(InsufficientFundsError):
        await broker.submit_order(symbol="AAPL", side="buy", quantity=50, order_type="market")
    assert await broker.get_orders() == []


async def test_short_sale_rejected(broker):
    await broker.submit_order(symbol="AAPL", side="buy", quantity=1, order_type="market")
    with pytest.raises(InvalidOrderError, match="no shorting"):
        await broker.submit_order(symbol="AAPL", side="sell", quantity=2, order_type="market")


async def test_invalid_order_inputs(broker):
    cases = [
        dict(quantity=0),
        dict(side="hold"),
        dict(order_type="stop"),
        dict(order_type="limit", limit_price=None),
        dict(order_type="limit", limit_price=-5),
    ]
    for overrides in cases:
        params = dict(symbol="AAPL", side="buy", quantity=1, order_type="market")
        params.update(overrides)
        with pytest.raises(InvalidOrderError):
            await broker.submit_order(**params)


async def test_marketable_limit_fills_immediately(broker):
    order = await broker.submit_order(
        symbol="AAPL", side="buy", quantity=1, order_type="limit", limit_price=230.00
    )
    assert order.status == "FILLED"
    assert order.avg_fill_price == pytest.approx(227.50)


async def test_resting_limit_fills_when_tick_crosses(broker):
    resting = await broker.submit_order(
        symbol="AAPL", side="buy", quantity=1, order_type="limit", limit_price=200.00
    )
    assert resting.status == "SUBMITTED"
    assert broker.open_order_ids() == [resting.id]

    broker._prices["AAPL"] = 195.00
    filled_ids = await broker.tick()
    assert filled_ids == [resting.id]

    status = await broker.get_order_status(resting.id)
    assert status.status == "FILLED"
    assert status.avg_fill_price <= 200.00


async def test_tick_does_not_crash_without_limit_orders(broker):
    await broker.submit_order(symbol="KO", side="buy", quantity=1, order_type="market")
    filled = await broker.tick()
    assert filled == []


async def test_cancel_rules(broker):
    resting = await broker.submit_order(
        symbol="MSFT", side="buy", quantity=1, order_type="limit", limit_price=400.00
    )
    canceled = await broker.cancel_order(resting.id)
    assert canceled.status == "CANCELED"
    with pytest.raises(InvalidOrderError):
        await broker.cancel_order(resting.id)
    with pytest.raises(OrderNotFoundError):
        await broker.cancel_order("MOCK-ORDER-999999")

    filled = await broker.submit_order(symbol="KO", side="buy", quantity=1, order_type="market")
    with pytest.raises(InvalidOrderError):
        await broker.cancel_order(filled.id)


async def test_unknown_symbol_gets_stable_hash_price(broker):
    first = broker.price_for("ZZZZZ")
    second = broker.price_for("ZZZZZ")
    other = broker.price_for("YYYYY")
    assert first == second and first != other


async def test_reset_restores_pristine_state(broker):
    await broker.submit_order(symbol="NVDA", side="buy", quantity=3, order_type="market")
    broker.reset()
    account = await broker.get_account()
    assert account.cash == 10_000.0
    assert await broker.get_positions() == []
    fresh = await broker.submit_order(symbol="NVDA", side="buy", quantity=1, order_type="market")
    assert fresh.id == "MOCK-ORDER-000001"
