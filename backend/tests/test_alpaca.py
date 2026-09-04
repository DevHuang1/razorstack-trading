"""AlpacaService unit tests (SDK import is allowed in this environment)."""
import pytest

from app.integrations.alpaca import AlpacaService, _compact_symbol, _crypto_pair
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


# ------------------------------------------------------------------- crypto


def test_crypto_pair_detects_compact_and_pair_forms():
    assert _crypto_pair("BTCUSD") == "BTC/USD"
    assert _crypto_pair("ETHUSD") == "ETH/USD"
    assert _crypto_pair("btcusd") == "BTC/USD"        # case-insensitive
    assert _crypto_pair("BTC/USD") == "BTC/USD"       # pair form passes through
    assert _crypto_pair("AAPL") is None
    assert _crypto_pair("TSLAUSD") is None            # not a crypto base
    assert _crypto_pair("") is None


def test_compact_symbol_normalizes_crypto_orders():
    assert _compact_symbol("BTC/USD") == "BTCUSD"
    assert _compact_symbol("BTCUSD") == "BTCUSD"
    assert _compact_symbol("AAPL") == "AAPL"


def test_get_market_data_uses_crypto_endpoint_for_crypto():
    svc = _make()
    calls: dict = {}

    async def fake_call(fn, request):
        method = getattr(fn, "__func__", fn).__name__
        targets = request.symbol_or_symbols
        key = targets[0] if isinstance(targets, list) else targets
        calls["method"] = method
        calls["target"] = key
        trade = type("Trade", (), {"price": 65432.1, "timestamp": None})()
        return {key: trade}

    svc._call = fake_call  # type: ignore[method-assign]
    tick = _async(svc.get_market_data("BTCUSD"))
    assert calls["method"] == "get_crypto_latest_trade"
    assert calls["target"] == "BTC/USD"
    assert tick.price == 65432.1
    assert tick.symbol == "BTCUSD"


def test_get_market_data_uses_stock_endpoint_for_stocks():
    svc = _make()
    calls: dict = {}

    async def fake_call(fn, request):
        method = getattr(fn, "__func__", fn).__name__
        targets = request.symbol_or_symbols
        key = targets[0] if isinstance(targets, list) else targets
        calls["method"] = method
        calls["target"] = key
        trade = type("Trade", (), {"price": 230.25, "timestamp": None})()
        return {key: trade}

    svc._call = fake_call  # type: ignore[method-assign]
    tick = _async(svc.get_market_data("NVDA"))
    assert calls["method"] == "get_stock_latest_trade"
    assert calls["target"] == "NVDA"
    assert tick.price == 230.25


def test_submit_crypto_order_builds_crypto_request():
    svc = _make()
    captured: dict = {}

    async def fake_call(fn, request):
        captured["request"] = request
        raw = type(
            "Raw",
            (),
            {
                "id": "order-1",
                "symbol": "BTC/USD",
                "side": "buy",
                "type": "market",
                "qty": "1",
                "filled_qty": "0",
                "filled_avg_price": None,
                "status": "accepted_for_bidding",
                "submitted_at": None,
                "filled_at": None,
            },
        )()
        return raw

    svc._call = fake_call  # type: ignore[method-assign]
    order = _async(svc.submit_order(symbol="BTCUSD", side="buy", quantity=1, order_type="market"))

    from alpaca.trading.enums import TimeInForce

    request = captured["request"]
    assert request.symbol == "BTC/USD"
    assert request.time_in_force == TimeInForce.IOC
    # order symbols are normalized back to the account-style form
    assert order.symbol == "BTCUSD"


def test_submit_stock_order_stays_equities_shaped():
    svc = _make()
    captured: dict = {}

    async def fake_call(fn, request):
        captured["request"] = request
        raw = type(
            "Raw",
            (),
            {
                "id": "order-2",
                "symbol": "NVDA",
                "side": "buy",
                "type": "market",
                "qty": "1",
                "filled_qty": "0",
                "filled_avg_price": None,
                "status": "accepted_for_bidding",
                "submitted_at": None,
                "filled_at": None,
            },
        )()
        return raw

    svc._call = fake_call  # type: ignore[method-assign]
    order = _async(svc.submit_order(symbol="NVDA", side="buy", quantity=1, order_type="market"))

    from alpaca.trading.enums import TimeInForce

    request = captured["request"]
    assert request.symbol == "NVDA"
    assert "asset_class" not in (request.model_extra or {})
    assert request.time_in_force == TimeInForce.DAY
    assert order.symbol == "NVDA"


def _async(coro):
    import asyncio

    return asyncio.get_event_loop().run_until_complete(coro)
