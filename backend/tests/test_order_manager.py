"""OrderManager reconciliation: local rows must follow broker state."""
from app.services.order_manager import OrderManager


async def test_reconcile_detects_broker_fill(services):
    broker = services.broker
    orders = OrderManager(broker, services.db)

    # place_order submits to the broker (non-marketable limit stays open).
    local = await orders.place_order(
        proposal_id=None,
        agent_id="recon-test",
        symbol="AAPL",
        side="buy",
        quantity=1,
        order_type="limit",
        limit_price=200.0,
    )
    assert local.status.value == "SUBMITTED"
    broker_id = local.broker_order_id

    # Nothing has filled yet -> reconcile is a no-op.
    assert await orders.reconcile_open_orders() == []

    # Broker fills it out-of-band; reconcile must pick it up and update the row.
    await broker.force_fill(broker_id)
    filled = await orders.reconcile_open_orders()
    assert len(filled) == 1
    assert filled[0].status.value == "FILLED"
    assert filled[0].filled_quantity == 1

    refreshed = await orders.get_order(local.id)
    assert refreshed.status.value == "FILLED"


async def test_refresh_by_broker_id_missing_returns_none(services):
    orders = OrderManager(services.broker, services.db)
    assert await orders.refresh_by_broker_id("MOCK-ORDER-000000") is None
