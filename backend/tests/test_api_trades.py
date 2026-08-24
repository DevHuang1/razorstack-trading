"""End-to-end trade lifecycle over HTTP: propose/execute/cancel/orders."""
from fastapi.testclient import TestClient

BASE = {"agent_id": "pytest-agent", "confidence": 0.9, "strategy": "unit-test"}


def payload(**overrides) -> dict:
    body = {
        **BASE,
        "symbol": "AAPL",
        "side": "buy",
        "quantity": 5,
        "order_type": "market",
    }
    body.update(overrides)
    return body


def test_health(client: TestClient):
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["broker_mode"] == "mock"


def test_propose_market_order_executes_and_fills(client: TestClient):
    resp = client.post("/trades/propose", json=payload())
    assert resp.status_code == 200
    body = resp.json()
    assert body["proposal"]["status"] == "EXECUTED"
    assert body["risk"]["status"] == "APPROVED"
    assert body["order"]["status"] == "FILLED"
    assert body["order"]["quantity"] == 5
    assert body["message"].startswith("trade approved")

    proposals = client.get("/trades/proposals").json()
    assert proposals[0]["id"] == body["proposal"]["id"]

    fetched = client.get(f"/trades/proposals/{body['proposal']['id']}")
    assert fetched.status_code == 200


def test_propose_adjusted_by_position_cap(client: TestClient):
    body = client.post("/trades/propose", json=payload(symbol="TSLA", quantity=100)).json()
    assert body["risk"]["status"] == "ADJUSTED"
    assert body["risk"]["code"] == "POSITION_CAP"
    assert 0 < body["order"]["quantity"] < 100
    assert "adjusted" in body["message"]


def test_propose_rejected_when_nothing_affordable(client: TestClient):
    # A limit price far above the position cap means not even one share fits,
    # so the engine must reject outright instead of scaling down.
    resp = client.post(
        "/trades/propose",
        json=payload(symbol="NVDA", quantity=1_000_000, order_type="limit", limit_price=50_000.0),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["proposal"]["status"] == "REJECTED"
    assert body["risk"]["approved_quantity"] == 0
    assert body["order"] is None
    assert body["message"].startswith("trade rejected")


def test_events_recorded_for_full_lifecycle(client: TestClient):
    client.post("/trades/propose", json=payload())
    filled = client.get("/events", params={"type": "ORDER_FILLED"}).json()
    assert len(filled) == 1
    recent_types = [e["event_type"] for e in client.get("/events/recent").json()]
    assert "TRADE_PROPOSED" in recent_types
    assert "RISK_CHECK_STARTED" in recent_types
    assert "TRADE_APPROVED" in recent_types
    assert "ORDER_SUBMITTED" in recent_types
    assert "POSITION_UPDATED" in recent_types
    assert all(e["payload"] for e in client.get("/events?limit=10").json())


def test_execute_unknown_proposal_404_envelope(client: TestClient):
    resp = client.post("/trades/execute", json={"proposal_id": "does-not-exist"})
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "NOT_FOUND"


def test_execute_conflicts_after_auto_execution(client: TestClient):
    # propose() already executes approved trades, so re-executing conflicts.
    proposal_id = client.post("/trades/propose", json=payload()).json()["proposal"]["id"]
    conflict = client.post("/trades/execute", json={"proposal_id": proposal_id})
    assert conflict.status_code == 409
    assert conflict.json()["error"]["code"] == "CONFLICT"


def test_execute_reruns_risk_for_rejected_proposal(client: TestClient):
    created = client.post(
        "/trades/propose",
        json=payload(symbol="NVDA", quantity=1_000_000, order_type="limit", limit_price=50_000.0),
    ).json()
    assert created["proposal"]["status"] == "REJECTED"

    # Only EXECUTED proposals are locked; rejected ones may be retried.
    again = client.post("/trades/execute", json={"proposal_id": created["proposal"]["id"]})
    assert again.status_code == 200
    body = again.json()
    assert body["proposal"]["id"] == created["proposal"]["id"]
    assert body["risk"]["approved_quantity"] == 0
    assert body["order"] is None


def test_cancel_open_limit_order_then_conflict_on_repeat(client: TestClient):
    created = client.post(
        "/trades/propose",
        json=payload(order_type="limit", limit_price=100.00, quantity=1),
    ).json()
    order_id = created["order"]["id"]
    assert created["order"]["status"] == "SUBMITTED"

    canceled = client.delete(f"/orders/{order_id}")
    assert canceled.status_code == 200
    assert canceled.json()["status"] == "CANCELED"

    repeat = client.delete(f"/orders/{order_id}")
    assert repeat.status_code == 409


def test_orders_listing_and_lookup(client: TestClient):
    order = client.post("/trades/propose", json=payload()).json()["order"]
    listing = client.get("/orders").json()
    assert any(o["id"] == order["id"] for o in listing)

    single = client.get(f"/orders/{order['id']}")
    assert single.status_code == 200
    assert single.json()["status"] == "FILLED"

    missing = client.get("/orders/nope")
    assert missing.status_code == 404

    filtered = client.get("/orders", params={"status": "CANCELED"}).json()
    assert filtered == []


def test_validation_error_envelope(client: TestClient):
    resp = client.post("/trades/propose", json=payload(quantity=0))
    assert resp.status_code == 422
    error = resp.json()["error"]
    assert error["code"] == "VALIDATION_ERROR"

    bad_side = client.post("/trades/propose", json=payload(side="hold"))
    assert bad_side.status_code == 422

    bad_symbol = client.post("/trades/propose", json=payload(symbol="!!!"))
    assert bad_symbol.status_code == 422

    missing_limit = client.post(
        "/trades/propose", json=payload(order_type="limit", limit_price=None)
    )
    assert missing_limit.status_code == 422
