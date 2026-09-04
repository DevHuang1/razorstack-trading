"""Real Alpaca Paper Trading implementation of the BrokerService interface.

Uses alpaca-py. Imported lazily so the app runs fine without the SDK when
BROKER_MODE=mock. All blocking SDK calls are wrapped in asyncio.to_thread.
"""
import asyncio
import logging
from datetime import datetime, timedelta, timezone

from app.db.base import utcnow

logger = logging.getLogger(__name__)
from app.integrations.base import (
    AccountInfo,
    BrokerError,
    BrokerOrder,
    BrokerPosition,
    BrokerService,
    InsufficientFundsError,
    InvalidOrderError,
    MarketTick,
    OrderNotFoundError,
)

_STATUS_MAP = {
    "pending_new": "PENDING",
    "new": "SUBMITTED",
    "accepted": "SUBMITTED",
    "accepted_for_bidding": "SUBMITTED",
    "held": "SUBMITTED",
    "calculated": "SUBMITTED",
    "done_for_day": "SUBMITTED",
    "partially_filled": "PARTIALLY_FILLED",
    "filled": "FILLED",
    "canceled": "CANCELED",
    "cancelled": "CANCELED",
    "pending_cancel": "CANCELED",
    "stopped": "CANCELED",
    "expired": "CANCELED",
    "rejected": "REJECTED",
}


def _to_datetime(value) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    try:
        parsed = datetime.fromisoformat(str(value))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _enum_value(value) -> str:
    text = str(value)
    return text.split(".")[-1].lower()


# --- crypto symbol helpers ---------------------------------------------------
# Alpaca splits its feed by asset class: equities use the stock data client,
# crypto uses the crypto client with "BASE/USD" pair notation. The terminal
# speaks bare symbols (BTC, ETH, SOL...), so normalize before hitting either.
_CRYPTO_BASES = frozenset({
    "BTC", "ETH", "SOL", "LTC", "BCH", "XRP", "DOGE", "SHIB",
    "AVAX", "LINK", "DOT", "MATIC", "AAVE", "UNI", "ADA", "TRX",
})


def _is_crypto_symbol(symbol: str) -> bool:
    """True for crypto assets, either bare (BTC) or USD-quoted (BTCUSD)."""
    s = symbol.upper()
    return s in _CRYPTO_BASES or (s.endswith("USD") and s[:-3] in _CRYPTO_BASES)


def _crypto_pair(symbol: str) -> str:
    """Normalize BTC / BTCUSD to the BTC/USD pair the crypto feed uses."""
    s = symbol.upper()
    if s in _CRYPTO_BASES:
        return f"{s}/USD"
    return f"{s[:-3]}/USD"


class AlpacaService(BrokerService):
    def __init__(
        self,
        api_key: str = "",
        secret_key: str = "",
        paper: bool = True,
        *,
        client_id: str = "",
        client_secret: str = "",
        base_url: str = "",
        token_url: str = "",
        oauth_token: str = "",
        oauth_scope: str = "",
        request_timeout: float = 15.0,
    ):
        # --- auth: prefer OAuth2 client-credentials (new "API Keys") --------
        self._client_id = client_id
        self._client_secret = client_secret
        self._scope = oauth_scope
        self._token_url = (
            token_url or f"{base_url.rstrip('/')}/oauth/token" if base_url else ""
        )
        self._token_expires_at: datetime | None = None
        if client_id and client_secret and not oauth_token:
            # Defer the OAuth exchange to the first API call so constructing the
            # service (e.g. at import / app startup) never performs network I/O.
            # "pending-refresh" is replaced with the real token on first _call.
            oauth_token = "pending-refresh"
            self._token_expires_at = None
        elif oauth_token:
            # A token was supplied; treat it as long-lived and don't refresh it.
            self._token_expires_at = utcnow() + timedelta(days=365)
        if not api_key and not oauth_token:
            raise BrokerError(
                "set ALPACA_API_KEY/ALPACA_SECRET_KEY or "
                "ALPACA_CLIENT_ID/ALPACA_CLIENT_SECRET when BROKER_MODE=alpaca"
            )
        try:
            from alpaca.data.historical import CryptoHistoricalDataClient, StockHistoricalDataClient
            from alpaca.trading.client import TradingClient
        except ImportError as exc:  # pragma: no cover - depends on env
            raise BrokerError("alpaca-py is not installed; run pip install alpaca-py") from exc

        self.paper = paper
        # Hard cap for every SDK call: a dropped network/proxy must return a
        # fast BrokerError instead of hanging an endpoint forever.
        self._request_timeout = max(float(request_timeout), 0.5)
        url_override = base_url or None
        # alpaca-py rejects passing both a key pair and an oauth_token.
        use_token = bool(oauth_token)
        # Persist the token (real, supplied, or the "pending-refresh" sentinel)
        # so _ensure_fresh_token can refresh it lazily on first use.
        self._oauth_token = oauth_token
        self._trading = TradingClient(
            api_key=None if use_token else api_key,
            secret_key=None if use_token else secret_key,
            oauth_token=oauth_token or None,
            paper=paper,
            url_override=url_override,
        )
        self._data = StockHistoricalDataClient(
            api_key=None if use_token else api_key,
            secret_key=None if use_token else secret_key,
            oauth_token=oauth_token or None,
            url_override=url_override,
        )
        # Crypto data lives on a separate client (separate feed, BASE/USD pairs).
        self._crypto_data = CryptoHistoricalDataClient(
            api_key=None if use_token else api_key,
            secret_key=None if use_token else secret_key,
            oauth_token=oauth_token or None,
        )

    # --------------------------------------------------------------- oauth
    _TOKEN_REFRESH_BUFFER_SECONDS = 120.0

    def _fetch_token(self) -> str:
        """Exchange client_id/secret for an access token (client-credentials)."""
        import httpx

        payload = {
            "grant_type": "client_credentials",
            "client_id": self._client_id,
            "client_secret": self._client_secret,
        }
        if self._scope:
            payload["scope"] = self._scope
        try:
            resp = httpx.post(self._token_url, data=payload, timeout=15.0)
            resp.raise_for_status()
            body = resp.json()
        except Exception as exc:  # noqa: BLE001
            raise BrokerError(f"alpaca oauth token exchange failed: {exc}") from exc

        token = str(body.get("access_token") or "")
        expires_in = float(body.get("expires_in") or 0)
        self._token_expires_at = (
            utcnow() + timedelta(seconds=max(expires_in - 1.0, 1.0))
            if expires_in > 0
            else None
        )
        return token

    def _ensure_fresh_token(self) -> None:
        """Refresh the OAuth token when it is at/near expiry (no-op for keys).

        The initial token is fetched here on first use (see ``__init__``), so no
        network call happens at construction time.
        """
        if not (self._client_id and self._client_secret):
            return  # static API key pair; nothing to refresh
        if (
            self._oauth_token
            and self._oauth_token != "pending-refresh"
            and self._token_expires_at is not None
            and utcnow()
            < self._token_expires_at - timedelta(seconds=self._TOKEN_REFRESH_BUFFER_SECONDS)
        ):
            return
        try:
            token = self._fetch_token()
        except BrokerError:
            logger.warning("alpaca oauth token refresh failed", exc_info=True)
            return
        # RESTClient reads _oauth_token on every request, so update in place.
        self._oauth_token = token
        self._trading._oauth_token = token
        self._data._oauth_token = token

    async def _call(self, fn, /, *args, **kwargs):
        """Run a blocking SDK call after ensuring the OAuth token is fresh.

        Bounded by ``request_timeout``: on a dropped network/proxy the caller
        gets a fast BrokerError (-> 502 envelope) instead of an endless hang.
        Note the worker thread itself cannot be interrupted, but the endpoint
        no longer blocks on it.
        """

        def _run():
            self._ensure_fresh_token()
            return fn(*args, **kwargs)

        try:
            return await asyncio.wait_for(
                asyncio.to_thread(_run), timeout=self._request_timeout
            )
        except asyncio.TimeoutError as exc:
            name = getattr(fn, "__name__", "alpaca call")
            raise BrokerError(
                f"alpaca {name} timed out after {self._request_timeout:.0f}s "
                "(network/proxy to Alpaca down?)"
            ) from exc

    # ----------------------------------------------------------------- account
    async def get_account(self) -> AccountInfo:
        raw = await self._call(self._trading.get_account)
        buying_power = max(float(raw.buying_power or 0), 0.0)
        return AccountInfo(
            equity=float(raw.equity or 0),
            cash=float(raw.cash or 0),
            buying_power=buying_power,
            currency=str(getattr(raw, "currency", "USD") or "USD"),
            paper=self.paper,
        )

    # --------------------------------------------------------------- positions
    @staticmethod
    def _map_position(p) -> BrokerPosition:
        qty = int(round(float(p.qty)))
        current = float(p.current_price or 0)
        avg = float(p.avg_entry_price or 0)
        market_value = float(p.market_value) if p.market_value else qty * current
        unrealized = float(p.unrealized_pl) if p.unrealized_pl else market_value - qty * avg
        return BrokerPosition(
            symbol=str(p.symbol).upper(),
            quantity=qty,
            avg_entry_price=avg,
            current_price=current,
            market_value=round(market_value, 2),
            unrealized_pnl=round(unrealized, 2),
        )

    async def get_positions(self) -> list[BrokerPosition]:
        raw_positions = await self._call(self._trading.get_all_positions)
        return sorted((self._map_position(p) for p in raw_positions), key=lambda x: x.symbol)

    async def get_position(self, symbol: str) -> BrokerPosition | None:
        try:
            raw = await self._call(self._trading.get_open_position, symbol.upper())
        except Exception as exc:
            status = getattr(exc, "status_code", None)
            if status == 404 or "position does not exist" in str(exc).lower():
                return None
            raise BrokerError(f"alpaca position lookup failed: {exc}") from exc
        return self._map_position(raw)

    # ------------------------------------------------------------------ orders
    def _map_order(self, raw) -> BrokerOrder:
        status = _STATUS_MAP.get(_enum_value(raw.status), "SUBMITTED")
        return BrokerOrder(
            id=str(raw.id),
            symbol=str(raw.symbol).upper(),
            side=_enum_value(raw.side),
            order_type=_enum_value(getattr(raw, "type", getattr(raw, "order_type", "market"))),
            quantity=int(float(raw.qty or 0)),
            filled_quantity=int(float(getattr(raw, "filled_qty", 0) or 0)),
            avg_fill_price=float(raw.filled_avg_price) if getattr(raw, "filled_avg_price", None) else None,
            status=status,
            submitted_at=_to_datetime(getattr(raw, "submitted_at", None)) or utcnow(),
            filled_at=_to_datetime(getattr(raw, "filled_at", None)),
        )

    async def submit_order(
        self,
        *,
        symbol: str,
        side: str,
        quantity: int,
        order_type: str,
        limit_price: float | None = None,
    ) -> BrokerOrder:
        from alpaca.trading.enums import OrderSide, TimeInForce
        from alpaca.trading.requests import LimitOrderRequest, MarketOrderRequest

        alpaca_side = OrderSide.BUY if side.lower() == "buy" else OrderSide.SELL
        # Route crypto (BTC, ETH, BTCUSD, ...) to the BASE/USD pair the crypto
        # book trades; otherwise a bare "BTC" order would hit the equity ticker.
        is_crypto = _is_crypto_symbol(symbol)
        target = _crypto_pair(symbol) if is_crypto else symbol.upper()
        time_in_force = TimeInForce.GTC if is_crypto else TimeInForce.DAY
        try:
            if order_type == "market":
                request = MarketOrderRequest(
                    symbol=target,
                    qty=int(quantity),
                    side=alpaca_side,
                    time_in_force=time_in_force,
                )
            elif order_type == "limit":
                if limit_price is None or limit_price <= 0:
                    raise InvalidOrderError("limit orders require a positive limit_price")
                request = LimitOrderRequest(
                    symbol=target,
                    qty=int(quantity),
                    side=alpaca_side,
                    time_in_force=time_in_force,
                    limit_price=float(limit_price),
                )
            else:
                raise InvalidOrderError(f"unsupported order type: {order_type}")
            raw = await self._call(self._trading.submit_order, request)
        except InvalidOrderError:
            raise
        except Exception as exc:
            message = str(exc).lower()
            if "insufficient buying power" in message:
                raise InsufficientFundsError(str(exc)) from exc
            raise BrokerError(f"alpaca submit_order failed: {exc}") from exc
        return self._map_order(raw)

    async def cancel_order(self, order_id: str) -> BrokerOrder:
        try:
            await self._call(self._trading.cancel_order_by_id, order_id)
        except Exception as exc:
            message = str(exc).lower()
            status = getattr(exc, "status_code", None)
            if status == 404 or "not found" in message:
                raise OrderNotFoundError(f"order {order_id} not found") from exc
            if status == 422 or "cannot be cancelled" in message:
                raise InvalidOrderError(f"order {order_id} cannot be canceled") from exc
            raise BrokerError(f"alpaca cancel_order failed: {exc}") from exc
        return await self.get_order_status(order_id)

    async def get_order_status(self, order_id: str) -> BrokerOrder:
        try:
            raw = await self._call(self._trading.get_order_by_id, order_id)
        except Exception as exc:
            status = getattr(exc, "status_code", None)
            if status == 404 or "not found" in str(exc).lower():
                raise OrderNotFoundError(f"order {order_id} not found") from exc
            raise BrokerError(f"alpaca get_order_status failed: {exc}") from exc
        return self._map_order(raw)

    async def get_orders(self, *, limit: int = 50, status: str | None = None) -> list[BrokerOrder]:
        from alpaca.trading.enums import QueryOrderStatus
        from alpaca.trading.requests import GetOrdersRequest

        open_statuses = {"OPEN", "PENDING", "SUBMITTED", "PARTIALLY_FILLED"}
        wanted = (status or "").upper()
        query_status = None
        if wanted:
            # Alpaca only exposes OPEN/CLOSED query buckets; fetch the matching
            # bucket, then filter precisely on the requested status so e.g.
            # ?status=FILLED returns only filled orders, not every closed one.
            query_status = (
                QueryOrderStatus.OPEN if wanted in open_statuses else QueryOrderStatus.CLOSED
            )
        request = GetOrdersRequest(status=query_status, limit=min(int(limit), 500))
        try:
            raw_orders = await self._call(self._trading.get_orders, request)
        except Exception as exc:
            raise BrokerError(f"alpaca get_orders failed: {exc}") from exc
        orders = [self._map_order(o) for o in raw_orders]
        if wanted:
            orders = [o for o in orders if o.status == wanted]
        return orders

    # ------------------------------------------------------------- market data
    async def get_market_data(self, symbol: str) -> MarketTick:
        target = symbol.upper()
        try:
            if _is_crypto_symbol(target):
                from alpaca.data.requests import CryptoLatestTradeRequest

                pair = _crypto_pair(target)
                request = CryptoLatestTradeRequest(symbol_or_symbols=pair)
                trades = await self._call(self._crypto_data.get_crypto_latest_trade, request)
                trade = trades[pair]
            else:
                from alpaca.data.requests import StockLatestTradeRequest

                request = StockLatestTradeRequest(symbol_or_symbols=target)
                trades = await self._call(self._data.get_stock_latest_trade, request)
                trade = trades[target]
        except Exception as exc:
            raise BrokerError(f"alpaca get_market_data failed: {exc}") from exc
        return MarketTick(
            symbol=target,
            price=float(trade.price),
            timestamp=_to_datetime(getattr(trade, "timestamp", None)) or utcnow(),
        )
