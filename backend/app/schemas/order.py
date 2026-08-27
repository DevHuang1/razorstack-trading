"""Order contracts."""
from datetime import datetime
from enum import Enum

from pydantic import BaseModel


class OrderStatus(str, Enum):
    PENDING = "PENDING"
    SUBMITTED = "SUBMITTED"
    PARTIALLY_FILLED = "PARTIALLY_FILLED"
    FILLED = "FILLED"
    CANCELED = "CANCELED"
    REJECTED = "REJECTED"
    FAILED = "FAILED"


class OrderResult(BaseModel):
    id: str
    broker_order_id: str | None = None
    proposal_id: str | None = None
    agent_id: str
    symbol: str
    side: str
    quantity: int
    filled_quantity: int = 0
    avg_fill_price: float | None = None
    order_type: str
    limit_price: float | None = None
    status: OrderStatus
    reject_reason: str | None = None
    created_at: datetime
    submitted_at: datetime | None = None
    filled_at: datetime | None = None
