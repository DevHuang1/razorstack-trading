"""Event stream contracts."""
from datetime import datetime
from enum import Enum
from uuid import uuid4

from pydantic import BaseModel, Field

from app.db.base import utcnow


class EventType(str, Enum):
    TRADE_PROPOSED = "TRADE_PROPOSED"
    RISK_CHECK_STARTED = "RISK_CHECK_STARTED"
    TRADE_APPROVED = "TRADE_APPROVED"
    TRADE_ADJUSTED = "TRADE_ADJUSTED"
    TRADE_REJECTED = "TRADE_REJECTED"
    ORDER_SUBMITTED = "ORDER_SUBMITTED"
    ORDER_FILLED = "ORDER_FILLED"
    ORDER_CANCELED = "ORDER_CANCELED"
    ORDER_FAILED = "ORDER_FAILED"
    POSITION_UPDATED = "POSITION_UPDATED"
    RISK_ALERT = "RISK_ALERT"
    CRISIS_DETECTED = "CRISIS_DETECTED"
    AGENT_STATUS = "AGENT_STATUS"


class TradeEvent(BaseModel):
    event_id: str = Field(default_factory=lambda: str(uuid4()))
    event_type: str
    timestamp: datetime = Field(default_factory=utcnow)
    payload: dict = Field(default_factory=dict)
