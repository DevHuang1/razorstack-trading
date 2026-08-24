"""Broker abstraction.

The whole application depends on `BrokerService`, never on the Alpaca SDK
directly. Two implementations exist:

* MockAlpacaService - deterministic in-memory broker (no credentials needed)
* AlpacaService     - real Alpaca Paper Trading API via alpaca-py
"""
from abc import ABC, abstractmethod
from datetime import datetime
from enum import Enum

from pydantic import BaseModel


class BrokerOrderStatus(str, Enum):
    PENDING = "PENDING"
    SUBMITTED = "SUBMITTED"
    PARTIALLY_FILLED = "PARTIALLY_FILLED"
    FILLED = "FILLED"
    CANCELED = "CANCELED"
    REJECTED = "REJECTED"
    FAILED = "FAILED"


TERMINAL_ORDER_STATUSES = frozenset({"FILLED", "CANCELED", "REJECTED", "FAILED"})


class AccountInfo(BaseModel):
    equity: float
    cash: float
    buying_power: float
    currency: str = "USD"
    paper: bool = True


class BrokerPosition(BaseModel):
    symbol: str
    quantity: int
    avg_entry_price: float
    current_price: float
    market_value: float
    unrealized_pnl: float


class BrokerOrder(BaseModel):
    id: str
    symbol: str
    side: str
    order_type: str
    quantity: int
    filled_quantity: int = 0
    avg_fill_price: float | None = None
    status: str = "PENDING"
    submitted_at: datetime
    filled_at: datetime | None = None
    reject_reason: str | None = None


class MarketTick(BaseModel):
    symbol: str
    price: float
    timestamp: datetime


class BrokerError(Exception):
    """Base exception for broker failures."""


class BrokerConnectionError(BrokerError):
    pass


class InsufficientFundsError(BrokerError):
    pass


class InvalidOrderError(BrokerError):
    pass


class OrderNotFoundError(BrokerError):
    pass


class BrokerService(ABC):
    """Interface every broker implementation must satisfy."""

    @abstractmethod
    async def get_account(self) -> AccountInfo: ...

    @abstractmethod
    async def get_positions(self) -> list[BrokerPosition]: ...

    @abstractmethod
    async def get_position(self, symbol: str) -> BrokerPosition | None: ...

    @abstractmethod
    async def get_orders(
        self, *, limit: int = 50, status: str | None = None
    ) -> list[BrokerOrder]: ...

    @abstractmethod
    async def get_order_status(self, order_id: str) -> BrokerOrder: ...

    @abstractmethod
    async def submit_order(
        self,
        *,
        symbol: str,
        side: str,
        quantity: int,
        order_type: str,
        limit_price: float | None = None,
    ) -> BrokerOrder: ...

    @abstractmethod
    async def cancel_order(self, order_id: str) -> BrokerOrder: ...

    @abstractmethod
    async def get_market_data(self, symbol: str) -> MarketTick: ...
