"""API-key auth: enforced when configured, open when disabled."""
import os

os.environ["BROKER_MODE"] = "mock"

from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app


def _client(api_key: str = ""):
    settings = Settings(
        environment="test",
        log_level="WARNING",
        database_url="sqlite+aiosqlite:///:memory:",
        broker_mode="mock",
        mock_price_tick_seconds=3600.0,
        mock_state_path="",
        api_key=api_key,
    )
    app = create_app(settings)
    with TestClient(app) as client:
        yield client


def _proposal():
    return {
        "agent_id": "auth-test",
        "symbol": "AAPL",
        "side": "buy",
        "quantity": 1,
        "order_type": "market",
        "confidence": 0.9,
    }


def test_admin_open_when_no_key():
    for client in _client(api_key=""):
        assert client.post("/admin/tick").status_code == 200
        assert client.post("/admin/reset").status_code == 200


def test_admin_requires_key_when_configured():
    for client in _client(api_key="secret"):
        assert client.post("/admin/tick").status_code == 401
        assert client.post("/admin/reset").status_code == 401
        # X-API-Key header works
        assert client.post("/admin/tick", headers={"X-API-Key": "secret"}).status_code == 200
        # Bearer header works
        assert client.post("/admin/reset", headers={"Authorization": "Bearer secret"}).status_code == 200
        # wrong key rejected
        assert client.post("/admin/tick", headers={"X-API-Key": "wrong"}).status_code == 401


def test_trades_requires_key_when_configured():
    for client in _client(api_key="secret"):
        assert client.post("/trades/propose", json=_proposal()).status_code == 401
        resp = client.post(
            "/trades/propose", json=_proposal(), headers={"X-API-Key": "secret"}
        )
        assert resp.status_code == 200
        # cancel (POST) also protected
        assert client.post("/trades/cancel", json={"order_id": "x"}).status_code == 401


def test_read_endpoints_remain_open():
    for client in _client(api_key="secret"):
        assert client.get("/health").status_code == 200
        assert client.get("/risk/status").status_code == 200
        assert client.get("/events/recent").status_code == 200
        assert client.get("/orders").status_code == 200
