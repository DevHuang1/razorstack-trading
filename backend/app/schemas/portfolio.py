"""Portfolio contracts (Backend -> Frontend)."""
from datetime import datetime

from pydantic import BaseModel


class PositionOut(BaseModel):
    symbol: str
    sector: str = "other"
    quantity: int
    avg_entry_price: float
    current_price: float
    market_value: float
    unrealized_pnl: float
    weight: float = 0.0  # market_value / equity


class PortfolioSnapshot(BaseModel):
    equity: float
    cash: float
    buying_power: float
    positions: list[PositionOut]
    total_pnl: float
    daily_pnl: float
    daily_pnl_pct: float
    drawdown: float
    sector_exposure: dict[str, float]
    risk_score: float
    peak_equity: float
    timestamp: datetime


class SnapshotOut(BaseModel):
    model_config = {"from_attributes": True}

    equity: float
    cash: float
    buying_power: float
    total_pnl: float
    daily_pnl: float
    drawdown: float
    risk_score: float
    created_at: datetime
