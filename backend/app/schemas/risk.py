"""Risk engine contracts (Backend -> AI / Frontend)."""
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class RiskDecisionStatus(str, Enum):
    APPROVED = "APPROVED"
    ADJUSTED = "ADJUSTED"
    REJECTED = "REJECTED"


class RiskResult(BaseModel):
    status: RiskDecisionStatus
    reason: str
    code: str = ""
    risk_score: float = 0.0
    original_quantity: int
    approved_quantity: int = 0
    details: dict[str, Any] = Field(default_factory=dict)


class RiskLimits(BaseModel):
    max_position_percent: float
    max_sector_exposure_percent: float
    min_cash_percent: float
    max_daily_loss_percent: float
    max_drawdown_percent: float


class RiskMetrics(BaseModel):
    equity: float
    cash: float
    buying_power: float
    daily_pnl: float
    daily_loss_pct: float
    drawdown_pct: float
    peak_equity: float
    top_symbol: str | None = None
    top_symbol_exposure_pct: float = 0.0
    top_sector: str | None = None
    top_sector_exposure_pct: float = 0.0
    risk_score: float = 0.0


class RiskStatusResponse(BaseModel):
    broker_mode: str
    restricted_mode: bool
    restrictions: list[str] = Field(default_factory=list)
    limits: RiskLimits
    metrics: RiskMetrics
