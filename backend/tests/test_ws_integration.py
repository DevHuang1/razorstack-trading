"""WebSocket integration: /events/ws streams the full lifecycle live."""
from fastapi.testclient import TestClient

EXPECTED_SEQUENCE = [
    "TRADE_PROPOSED",
    "RISK_CHECK_STARTED",
    "TRADE_APPROVED",
    "ORDER_SUBMITTED",
    "ORDER_FILLED",
    "POSITION_UPDATED",
]


def _payload(symbol: str = "MSFT") -> dict:
    return {
        "agent_id": "ws-agent",
        "symbol": symbol,
        "side": "buy",
        "quantity": 2,
        "order_type": "market",
        "confidence": 0.8,
    }


def test_ws_streams_full_trade_lifecycle(client: TestClient):
    with client.websocket_connect("/events/ws") as ws:
        resp = client.post("/trades/propose", json=_payload())
        assert resp.status_code == 200

        received = [ws.receive_json() for _ in EXPECTED_SEQUENCE]

    assert [e["event_type"] for e in received] == EXPECTED_SEQUENCE
    filled = received[4]
    assert filled["payload"]["symbol"] == "MSFT"
    assert filled["payload"]["avg_price"] > 0


def test_ws_receives_only_after_subscribe(client: TestClient):
    # A trade executed BEFORE connecting must not leak into a fresh socket;
    # the in-memory buffer is intentionally not replayed.
    client.post("/trades/propose", json=_payload())

    with client.websocket_connect("/events/ws") as ws:
        resp = client.post("/trades/propose", json=_payload(symbol="KO"))
        assert resp.status_code == 200
        first = ws.receive_json()

    assert first["event_type"] == "TRADE_PROPOSED"
    assert first["payload"]["symbol"] == "KO"
