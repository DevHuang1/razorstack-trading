from datetime import datetime

from sqlalchemy import Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import UTCDateTime, Base, utcnow


class OrderModel(Base):
    __tablename__ = "orders"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    broker_order_id: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    proposal_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("trade_proposals.id"), nullable=True
    )
    agent_id: Mapped[str] = mapped_column(String(120), index=True)
    symbol: Mapped[str] = mapped_column(String(20), index=True)
    side: Mapped[str] = mapped_column(String(10))
    quantity: Mapped[int] = mapped_column(Integer)
    filled_quantity: Mapped[int] = mapped_column(Integer, default=0)
    avg_fill_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    order_type: Mapped[str] = mapped_column(String(10), default="market")
    limit_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="PENDING", index=True)
    reject_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime(), default=utcnow, onupdate=utcnow
    )
    submitted_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
    filled_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), nullable=True)
