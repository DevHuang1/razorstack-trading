from datetime import datetime

from sqlalchemy import Float, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import UTCDateTime, Base, utcnow


class RiskDecisionModel(Base):
    __tablename__ = "risk_decisions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    proposal_id: Mapped[str | None] = mapped_column(String(36), index=True, nullable=True)
    status: Mapped[str] = mapped_column(String(20), index=True)
    reason: Mapped[str] = mapped_column(Text, default="")
    code: Mapped[str] = mapped_column(String(60), default="")
    risk_score: Mapped[float] = mapped_column(Float, default=0.0)
    original_quantity: Mapped[int] = mapped_column(Integer)
    approved_quantity: Mapped[int] = mapped_column(Integer, default=0)
    details: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, index=True)
