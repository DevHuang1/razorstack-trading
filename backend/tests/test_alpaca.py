"""AlpacaService unit tests (SDK import is allowed in this environment)."""
import pytest

from app.integrations.alpaca import AlpacaService
from app.integrations.base import BrokerError


def _make(**overrides) -> AlpacaService:
    params = dict(
        client_id="cid",
        client_secret="csec",
        base_url="https://paper-api.alpaca.markets",
    )
    params.update(overrides)
    return AlpacaService(**params)


def test_construction_does_no_network_io():
    """Token exchange must be deferred until the first API call."""
    calls = []
    original = AlpacaService._fetch_token

    def fake_fetch(self):
        calls.append(1)
        return "real-token"

    AlpacaService._fetch_token = fake_fetch
    try:
        svc = _make()
        assert svc._oauth_token == "pending-refresh"
        assert calls == []  # no network at construction
        svc._ensure_fresh_token()
        assert calls == [1]
        assert svc._oauth_token == "real-token"
    finally:
        AlpacaService._fetch_token = original


def test_missing_credentials_raises():
    with pytest.raises(BrokerError):
        AlpacaService()  # neither key pair nor client credentials


def test_supplied_token_is_not_refreshed_unprompted():
    calls = []
    original = AlpacaService._fetch_token

    def fake_fetch(self):
        calls.append(1)
        return "refreshed"

    AlpacaService._fetch_token = fake_fetch
    try:
        svc = _make(oauth_token="given-token")
        assert svc._oauth_token == "given-token"
        svc._ensure_fresh_token()
        assert calls == []  # pre-supplied token is treated as long-lived
    finally:
        AlpacaService._fetch_token = original
