"""Deterministic in-memory broker used for development and tests.

Behaves like the Alpaca paper-trading API surface but requires no credentials:
fake account, cash, positions, orders and fills. Order ids are sequential and
deterministic (MOCK-ORDER-000001...). Market orders fill instantly; limit
orders fill once `tick()` moves price across the limit.

Optionally persists its full state (cash, prices, positions, orders) to a JSON
file after every mutation and reloads it on startup, so dev/demo sessions
survive restarts. Disabled unless `persist_path` is given (tests stay isolated).
"""
import asyncio
import hashlib
import itertools
import json
import os
import random
from datetime import datetime

from app.db.base import utcnow
from app.integrations.base import (
    AccountInfo,
    BrokerOrder,
    BrokerPosition,
    BrokerService,
    InsufficientFundsError,
    InvalidOrderError,
    MarketTick,
    OrderNotFoundError,
)

BASE_PRICES: dict[str, float] = {
    "AAPL": 227.50,
    "MSFT": 420.00,
    "NVDA": 175.00,
    "AMD": 140.00,
    "GOOGL": 165.00,
    "META": 505.00,
    "AMZN": 185.00,
    "TSLA": 245.00,
    "JPM": 210.00,
    "BAC": 40.00,
    "GS": 460.00,
    "JNJ": 155.00,
    "PFE": 28.00,
    "UNH": 520.00,
    "XOM": 115.00,
    "CVX": 150.00,
    "WMT": 70.00,
    "KO": 62.00,
    "DIS": 95.00,
}

_TERMINAL_STATUSES = frozenset({"FILLED", "CANCELED", "REJECTED", "FAILED"})


class MockAlpacaService(BrokerService):
    def __init__(
        self,
        initial_cash: float = 100_000.0,
        seed: int = 42,
        persist_path: str | None = None,
    ):
        self._lock = asyncio.Lock()
        self._seq = itertools.count(1)
        self._initial_cash = float(initial_cash)
        self._cash = float(initial_cash)
        self.paper = True
        # symbol -> {"quantity": int, "avg_entry_price": float}
        self._positions: dict[str, dict] = {}
        # order_id -> mutable order dict
        self._orders: dict[str, dict] = {}
        self._prices: dict[str, float] = {k: float(v) for k, v in BASE_PRICES.items()}
        self._rng = random.Random(seed)
        self._persist_path = persist_path
        if persist_path:
            self._load(persist_path)

    # ------------------------------------------------------- state persistence
    def _save(self) -> None:
        """Atomically snapshot the broker state (call while holding the lock)."""
        path = self._persist_path
        if not path:
            return

        def _encode(value):
            return value.isoformat() if isinstance(value, datetime) else value

        data = {
            "cash": self._cash,
            "positions": self._positions,
            "prices": self._prices,
            "orders": {
                oid: {k: _encode(v) for k, v in record.items()}
                for oid, record in self._orders.items()
            },
        }
        tmp = f"{path}.tmp"
        try:
            with open(tmp, "w", encoding="utf-8") as fh:
                json.dump(data, fh)
            os.replace(tmp, path)
        except OSError as exc:  # pragma: no cover - disk issues are non-fatal
            import logging

            logging.getLogger(__name__).warning(
                "mock broker state save failed", extra={"detail": str(exc)}
            )

    def _load(self, path: str) -> None:
        try:
            with open(path, encoding="utf-8") as fh:
                data = json.load(fh)
        except FileNotFoundError:
            return
        except (OSError, json.JSONDecodeError):
            return  # corrupt file -> start fresh

        def _decode(value):
            if isinstance(value, str):
                try:
                    return datetime.fromisoformat(value)
                except ValueError:
                    return value
            return value

        self._cash = float(data.get("cash", self._initial_cash))
        self._positions = {
            sym.upper(): dict(pos) for sym, pos in data.get("positions", {}).items()
        }
        self._prices = {sym.upper(): float(px) for sym, px in data.get("prices", {}).items()}
        self._orders = {}
        for oid, record in data.get("orders", {}).items():
            restored = {k: _decode(v) if k.endswith("_at") else v for k, v in record.items()}
            self._orders[str(oid)] = restored
        numbers = [int(oid.rsplit("-", 1)[-1]) for oid in self._orders if oid.startswith("MOCK-ORDER-")]
        self._seq = itertools.count(max(numbers, default=0) + 1)

    # ------------------------------------------------------------------ prices
    def price_for(self, symbol: str) -> float:
        """Deterministic price per symbol; unknown tickers get a stable hash price."""
        symbol = symbol.upper()
        if symbol not in self._prices:
            digest = hashlib.sha256(symbol.encode()).hexdigest()
            self._prices[symbol] = round(10.0 + (int(digest[:12], 16) % 49_000) / 100.0, 2)
        return self._prices[symbol]

    def equity_value(self) -> float:
        total = self._cash
        for sym, pos in self._positions.items():
            total += pos["quantity"] * self.price_for(sym)
        return total

    # ----------------------------------------------------------------- account
    async def get_account(self) -> AccountInfo:
        return AccountInfo(
            equity=round(self.equity_value(), 2),
            cash=round(max(self._cash, 0.0), 2),
            buying_power=round(max(self._cash, 0.0), 2),
            paper=self.paper,
        )

    # --------------------------------------------------------------- positions
    async def get_positions(self) -> list[BrokerPosition]:
        out: list[BrokerPosition] = []
        for sym, pos in self._positions.items():
            px = self.price_for(sym)
            qty, avg = pos["quantity"], pos["avg_entry_price"]
            market_value = qty * px
            out.append(
                BrokerPosition(
                    symbol=sym,
                    quantity=qty,
                    avg_entry_price=avg,
                    current_price=px,
                    market_value=round(market_value, 2),
                    unrealized_pnl=round(market_value - qty * avg, 2),
                )
            )
        return sorted(out, key=lambda p: p.symbol)

    async def get_position(self, symbol: str) -> BrokerPosition | None:
        target = symbol.upper()
        pos = self._positions.get(target)
        if pos is None:
            return None
        px = self.price_for(target)
        qty, avg = pos["quantity"], pos["avg_entry_price"]
        market_value = qty * px
        return BrokerPosition(
            symbol=target,
            quantity=qty,
            avg_entry_price=avg,
            current_price=px,
            market_value=round(market_value, 2),
            unrealized_pnl=round(market_value - qty * avg, 2),
        )

    # ------------------------------------------------------------------ orders
    async def submit_order(
        self,
        *,
        symbol: str,
        side: str,
        quantity: int,
        order_type: str,
        limit_price: float | None = None,
    ) -> BrokerOrder:
        symbol = symbol.upper()
        quantity = int(quantity)
        if quantity <= 0:
            raise InvalidOrderError("quantity must be greater than zero")
        if side not in ("buy", "sell"):
            raise InvalidOrderError(f"invalid side: {side}")
        if order_type not in ("market", "limit"):
            raise InvalidOrderError(f"unsupported order type: {order_type}")
        if order_type == "limit" and (limit_price is None or limit_price <= 0):
            raise InvalidOrderError("limit orders require a positive limit_price")

        async with self._lock:
            price = self.price_for(symbol)
            if side == "buy":
                cost = quantity * (limit_price if order_type == "limit" else price)
                if cost > self._cash + 1e-6:
                    raise InsufficientFundsError(
                        f"insufficient funds: need ${cost:.2f}, available ${self._cash:.2f}"
                    )
            else:
                held = self._positions.get(symbol, {}).get("quantity", 0)
                if quantity > held:
                    raise InvalidOrderError(
                        f"cannot sell {quantity} {symbol}: only {held} share(s) held (no shorting)"
                    )

            order_id = f"MOCK-ORDER-{next(self._seq):06d}"
            record = {
                "id": order_id,
                "symbol": symbol,
                "side": side,
                "order_type": order_type,
                "quantity": quantity,
                "limit_price": float(limit_price) if limit_price is not None else None,
                "filled_quantity": 0,
                "avg_fill_price": None,
                "status": "SUBMITTED",
                "submitted_at": utcnow(),
                "filled_at": None,
                "reject_reason": None,
            }
            self._orders[order_id] = record

            if order_type == "market":
                self._fill(order_id, price)
            else:
                marketable = (
                    side == "buy" and limit_price >= price
                ) or (side == "sell" and limit_price <= price)
                if marketable:
                    self._fill(order_id, min(price, float(limit_price)) if side == "buy" else max(price, float(limit_price)))
            self._save()
            return self._to_broker_order(record)

    def _fill(self, order_id: str, price: float) -> None:
        order = self._orders[order_id]
        qty = order["quantity"]
        order["filled_quantity"] = qty
        order["avg_fill_price"] = round(price, 2)
        order["status"] = "FILLED"
        order["filled_at"] = utcnow()

        symbol = order["symbol"]
        if order["side"] == "buy":
            self._cash -= qty * price
            position = self._positions.setdefault(symbol, {"quantity": 0, "avg_entry_price": 0.0})
            total_cost = position["quantity"] * position["avg_entry_price"] + qty * price
            position["quantity"] += qty
            position["avg_entry_price"] = round(total_cost / position["quantity"], 4)
        else:
            self._cash += qty * price
            position = self._positions.get(symbol)
            if position is None or position["quantity"] < qty:
                raise InvalidOrderError(f"inconsistent position state for {symbol}")
            position["quantity"] -= qty
            if position["quantity"] == 0:
                del self._positions[symbol]

    @staticmethod
    def _to_broker_order(record: dict) -> BrokerOrder:
        return BrokerOrder(**{k: v for k, v in record.items()})

    async def get_orders(self, *, limit: int = 50, status: str | None = None) -> list[BrokerOrder]:
        orders = list(self._orders.values())
        if status:
            wanted = status.upper()
            orders = [o for o in orders if o["status"] == wanted]
        orders.sort(key=lambda o: o["submitted_at"], reverse=True)
        return [self._to_broker_order(o) for o in orders[:limit]]

    async def get_order_status(self, order_id: str) -> BrokerOrder:
        record = self._orders.get(order_id)
        if record is None:
            raise OrderNotFoundError(f"order {order_id} not found")
        return self._to_broker_order(record)

    async def cancel_order(self, order_id: str) -> BrokerOrder:
        async with self._lock:
            record = self._orders.get(order_id)
            if record is None:
                raise OrderNotFoundError(f"order {order_id} not found")
            if record["status"] in _TERMINAL_STATUSES:
                raise InvalidOrderError(
                    f"cannot cancel order {order_id} in terminal status {record['status']}"
                )
            record["status"] = "CANCELED"
            self._save()
            return self._to_broker_order(record)

    async def get_market_data(self, symbol: str) -> MarketTick:
        return MarketTick(symbol=symbol.upper(), price=self.price_for(symbol), timestamp=utcnow())

    # -------------------------------------------------------------- simulation
    def open_order_ids(self) -> list[str]:
        return [
            oid
            for oid, order in self._orders.items()
            if order["status"] in ("SUBMITTED", "PARTIALLY_FILLED")
        ]

    async def tick(self) -> list[str]:
        """Advance prices with a seeded random walk; fill crossed limit orders."""
        async with self._lock:
            for symbol in list(self._prices):
                drift = self._rng.uniform(-0.004, 0.004)
                self._prices[symbol] = max(0.01, round(self._prices[symbol] * (1 + drift), 2))
            filled: list[str] = []
            for order_id in self.open_order_ids():
                order = self._orders[order_id]
                price = self.price_for(order["symbol"])
                limit = float(order["limit_price"])
                crosses = (order["side"] == "buy" and price <= limit) or (
                    order["side"] == "sell" and price >= limit
                )
                if crosses:
                    self._fill(order_id, price)
                    filled.append(order_id)
            self._save()
            return filled

    def reset(self) -> None:
        """Restore pristine demo state (handy between demos/tests)."""
        self._cash = self._initial_cash
        self._positions.clear()
        self._orders.clear()
        self._prices = {k: float(v) for k, v in BASE_PRICES.items()}
        self._seq = itertools.count(1)
        if self._persist_path:
            try:
                os.remove(self._persist_path)
            except FileNotFoundError:
                pass
            self._save()
