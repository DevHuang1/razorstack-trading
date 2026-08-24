"""HTTP tests for portfolio, risk status and events endpoints."""
from fastapi.testclient import TestClient


def _propose(client: TestClient, **overrides) -> dict:
    body = {
        "agent_id": "pytest-agent",
        "symbol": "AAPL",
        "side": "buy",
        "quantity": 10,
        "order_type": "market",
        "confidence": 0.9,
    }
    body.update(overrides)
    resp = client.post("/trades/propose", json=body)
    assert resp.status_code == 200
    return resp.json()


def test_portfolio_empty_state(client: TestClient):
    snapshot = client.get("/portfolio").json()
    assert snapshot["equity"] == 100_000.0
    assert snapshot["cash"] == 100_000.0
    assert snapshot["positions"] == []
    assert snapshot["risk_score"] == 0.0

    positions = client.get("/portfolio/positions").json()
    assert positions == []


def test_portfolio_after_trade(client: TestClient):
    _propose(client)
    snapshot = client.get("/portfolio").json()
    assert len(snapshot["positions"]) == 1
    position = snapshot["positions"][0]
    assert position["symbol"] == "AAPL"
    assert position["sector"] == "technology"

    account = client.get("/portfolio/account").json()
    assert account["cash"] < 100_000.0


def test_portfolio_history_persists(client: TestClient):
    _propose(client)  # pipeline persists a snapshot after execution
    history = client.get("/portfolio/history").json()
    assert len(history) == 1
    assert history[0]["equity"] > 0


def test_risk_status_shape_and_limits_echo(client: TestClient):
    body = client.get("/risk/status").json()
    assert body["broker_mode"] == "mock"
    assert body["restricted_mode"] is False
    assert body["restrictions"] == []
    limits = body["limits"]
    assert limits["max_position_percent"] == 0.15
    assert limits["min_cash_percent"] == 0.10
    metrics = body["metrics"]
    assert metrics["equity"] == 100_000.0
    assert metrics["drawdown_pct"] == 0.0


def test_events_filtering_and_limit(client: TestClient):
    _propose(client)

    everything = client.get("/events", params={"limit": 100}).json()
    assert len(everything) >= 6

    limited = client.get("/events", params={"limit": 2}).json()
    assert len(limited) == 2

    filtered = client.get("/events", params={"type": "TRADE_PROPOSED"}).json()
    assert filtered and all(e["event_type"] == "TRADE_PROPOSED" for e in filtered)

    empty = client.get("/events", params={"type": "NO_SUCH_TYPE"}).json()
    assert empty == []
