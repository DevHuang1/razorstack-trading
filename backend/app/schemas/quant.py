"""Quantitative metadata and execution-cost API contracts."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


class OHLCVBar(BaseModel):
    t: datetime
    o: float = Field(..., gt=0)
    h: float = Field(..., gt=0)
    l: float = Field(..., gt=0)
    c: float = Field(..., gt=0)
    v: float = Field(..., ge=0)

    @model_validator(mode="after")
    def validate_price_bounds(self):
        if self.h < self.l:
            raise ValueError("high must be greater than or equal to low")
        if not self.l <= self.o <= self.h:
            raise ValueError("open must be between low and high")
        if not self.l <= self.c <= self.h:
            raise ValueError("close must be between low and high")
        return self


class DataQualityMetadata(BaseModel):
    symbol: str
    timeframe: str
    bar_count: int = Field(..., ge=0)
    first_bar_at: datetime | None = None
    last_bar_at: datetime | None = None
    expected_interval_seconds: int | None = Field(default=None, ge=1)
    duplicate_bar_count: int = Field(default=0, ge=0)
    missing_bar_count: int = Field(default=0, ge=0)
    max_gap_bars: int = Field(default=0, ge=0)
    stale: bool = False
    is_actionable: bool
    warnings: list[str] = Field(default_factory=list)


class DataQualityRequest(BaseModel):
    symbol: str = Field(..., min_length=1, max_length=12)
    timeframe: str = "1Day"
    bars: list[OHLCVBar]
    as_of: datetime | None = None

    @field_validator("symbol")
    @classmethod
    def normalize_symbol(cls, value: str) -> str:
        return value.strip().upper()


class DataQualityResponse(BaseModel):
    quality: DataQualityMetadata


class ExecutionCostRequest(BaseModel):
    symbol: str = Field(..., min_length=1, max_length=12)
    side: Literal["buy", "sell"]
    quantity: int = Field(..., gt=0)
    reference_price: float = Field(..., gt=0)
    order_type: Literal["market", "limit"] = "market"
    average_daily_volume: float | None = Field(default=None, gt=0)

    @field_validator("symbol")
    @classmethod
    def normalize_symbol(cls, value: str) -> str:
        return value.strip().upper()


class ExecutionCostEstimate(BaseModel):
    symbol: str
    side: Literal["buy", "sell"]
    order_type: Literal["market", "limit"]
    quantity: int
    reference_price: float
    gross_notional: float
    participation_rate_pct: float | None = None
    base_slippage_bps: float
    market_impact_bps: float
    effective_slippage_bps: float
    estimated_slippage: float
    commission: float
    fixed_fee: float
    total_cost: float
    buy_cash_required: float
    sell_net_proceeds: float


class HawkesRequest(BaseModel):
    """Arrival times (seconds) of market events to fit a self-exciting process."""

    times: list[float] = Field(..., min_length=3)
    stationarity_penalty: float = Field(default=0.0, ge=0)


class McGreeksRequest(BaseModel):
    spot: float = Field(..., gt=0)
    strike: float = Field(..., gt=0)
    risk_free: float = 0.05
    sigma: float = Field(..., gt=0, le=2)
    maturity: float = Field(..., gt=0)
    option_type: Literal["call", "put"] = "call"
    n_paths: int = Field(default=50_000, ge=2_000, le=1_000_000)


class McGreeksResponse(BaseModel):
    spot: float
    strike: float
    risk_free: float
    sigma: float
    maturity: float
    option_type: str
    price: float
    delta: float
    gamma: float
    vega: float
    theta: float
    rho: float
    ad_method: str
    n_paths: int
