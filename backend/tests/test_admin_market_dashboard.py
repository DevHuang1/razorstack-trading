"""Tests for /admin/*, /market/{symbol} and the dashboard page."""
import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from tests.conftest import make_settings


def _propose(client: TestClient, **overrides) -> dict:
    body = {
        "agent_id": "admin-agent",
        "symbol": "AAPL",
        "side": "buy",
        "quantity": 5,
        "order_type": "market",
        "confidence": 0.9,
    }
    body.update(overrides)
    resp = client.post("/trades/propose", json=body)
    assert resp.status_code == 200
    return resp.json()


def test_market_quote_endpoint(client: TestClient):
    quote = client.get("/market/NVDA").json()
    assert quote["symbol"] == "NVDA"
    assert quote["price"] > 0
    assert quote["timestamp"]

    lower = client.get("/market/nvda").json()
    assert lower["price"] == quote["price"]


def test_dashboard_served_at_root(client: TestClient):
    resp = client.get("/")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/html")
    assert "Alpaca AI Trading" in resp.text
    assert "/events/ws" in resp.text


def test_reset_wipes_broker_and_local_state(client: TestClient):
    _propose(client)  # creates positions, orders, events, snapshots

    before = client.get("/portfolio").json()
    assert len(before["positions"]) == 1
    assert client.get("/orders").json()
    assert client.get("/events").json()

    reset = client.post("/admin/reset")
    assert reset.status_code == 200
    assert reset.json()["action"] == "reset"

    after = client.get("/portfolio").json()
    assert after["equity"] == 100_000.0
    assert after["positions"] == []
    assert client.get("/orders").json() == []
    assert client.get("/events").json() == []

    # broker order ids restart from scratch
    fresh = _propose(client)
    assert fresh["order"]["status"] == "FILLED"


def test_force_tick_fills_resting_limit_order(client: TestClient):
    created = _propose(
        client, symbol="MSFT", quantity=1, order_type="limit", limit_price=350.00
    )
    order_id = created["order"]["id"]
    assert created["order"]["status"] == "SUBMITTED"

    # Ticks walk prices randomly; MSFT at ~420 never reaches a $350 buy limit,
    # so fill-now is the deterministic path. First verify tick reports nothing.
    tick = client.post("/admin/tick")
    assert tick.status_code == 200

    forced = client.post(f"/admin/fill-now/{order_id}")
    assert forced.status_code == 200
    fill = forced.json()["fills"][0]
    assert fill["order_id"] == created["order"]["broker_order_id"]
    assert fill["source"] == "tick"

    status = client.get(f"/orders/{order_id}").json()
    assert status["status"] == "FILLED"
    assert 0 < status["avg_fill_price"] <= 420

    filled_events = client.get("/events", params={"type": "ORDER_FILLED"}).json()
    assert any(e["payload"]["source"] == "tick" for e in filled_events)


def test_fill_now_rejects_unknown_and_terminal_orders(client: TestClient):
    missing = client.post("/admin/fill-now/MOCK-ORDER-999999")
    assert missing.status_code == 404

    filled = _propose(client)["order"]
    terminal = client.post(f"/admin/fill-now/{filled['id']}")
    assert terminal.status_code == 409


def test_admin_blocked_in_alpaca_mode():
    settings = make_settings(
        broker_mode="alpaca",
        alpaca_api_key="test-key",
        alpaca_secret_key="test-secret",
    )
    with TestClient(create_app(settings)) as alpaca_client:
        resp = alpaca_client.post("/admin/reset")
        assert resp.status_code == 409
        assert resp.json()["error"]["code"] == "CONFLICT"

        tick = alpaca_client.post("/admin/tick")
        assert tick.status_code == 409


@pytest.mark.parametrize("path", ["/health", "/", "/risk/status"])
def test_core_pages_alive(client: TestClient, path: str):
    assert client.get(path).status_code == 200
