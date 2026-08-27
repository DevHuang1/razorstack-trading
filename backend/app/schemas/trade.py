"""Trade-related API contracts (shared with AI / Quant / Frontend teams)."""
import re
from datetime import datetime
from enum import Enum
from uuid import uuid4

from pydantic import BaseModel, Field, field_validator, model_validator

from app.db.base import utcnow
from app.schemas.order import OrderResult
from app.schemas.risk import RiskResult

SYMBOL_PATTERN = re.compile(r"^(?=.*[A-Z])[A-Z0-9.\-]{1,10}$")


class TradeSide(str, Enum):
    BUY = "buy"
    SELL = "sell"


class TradeOrderType(str, Enum):
    MARKET = "market"
    LIMIT = "limit"


class ProposalStatus(str, Enum):
    PROPOSED = "PROPOSED"
    APPROVED = "APPROVED"
    ADJUSTED = "ADJUSTED"
    REJECTED = "REJECTED"
    EXECUTED = "EXECUTED"


class TradeProposal(BaseModel):
    """Inbound proposal created by an AI agent. Never executed directly."""

    id: str = Field(default_factory=lambda: str(uuid4()))
    agent_id: str = Field(..., min_length=1, max_length=120, examples=["momentum-agent"])
    symbol: str = Field(..., examples=["NVDA"])
    side: TradeSide
    quantity: int = Field(..., gt=0, description="Number of shares (must be > 0)")
    order_type: TradeOrderType = TradeOrderType.MARKET
    limit_price: float | None = Field(default=None, gt=0)
    strategy: str = Field(default="unknown", max_length=64)
    confidence: float = Field(..., ge=0.0, le=1.0)
    reasoning: str = ""
    created_at: datetime = Field(default_factory=utcnow)

    @field_validator("symbol")
    @classmethod
    def validate_symbol(cls, value: str) -> str:
        value = value.strip().upper()
        if not SYMBOL_PATTERN.match(value):
            raise ValueError(
                "symbol must be 1-10 characters (letters, digits, '.', '-') and contain at least one letter"
            )
        return value

    @model_validator(mode="after")
    def validate_limit_order(self) -> "TradeProposal":
        if self.order_type == TradeOrderType.LIMIT and (self.limit_price is None or self.limit_price <= 0):
            raise ValueError("limit_price is required and must be > 0 for limit orders")
        return self


class TradeProposalOut(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    agent_id: str
    symbol: str
    side: TradeSide
    quantity: int
    order_type: TradeOrderType
    limit_price: float | None
    strategy: str
    confidence: float
    reasoning: str
    status: str = ProposalStatus.PROPOSED.value
    created_at: datetime


class ExecuteTradeRequest(BaseModel):
    proposal_id: str = Field(..., min_length=1)


class CancelTradeRequest(BaseModel):
    order_id: str = Field(..., min_length=1)


class ProposeResponse(BaseModel):
    """Result of POST /trades/propose (and /trades/execute)."""

    proposal: TradeProposalOut
    risk: RiskResult
    order: OrderResult | None
    message: str
