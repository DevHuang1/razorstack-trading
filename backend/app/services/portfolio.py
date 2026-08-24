"""Portfolio state: snapshots, exposure, P&L, drawdown, risk metrics.

The broker is the source of truth for cash/positions; this service enriches it
with persisted analytics (peak equity, day baseline) and mirrors positions
into the local database after every fill.
"""
import logging
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, func, select

from app.db.base import utcnow
from app.models.portfolio import PortfolioSnapshotModel
from app.models.position import PositionModel
from app.schemas.portfolio import PortfolioSnapshot, PositionOut

logger = logging.getLogger(__name__)


class PortfolioService:
    def __init__(self, broker, session_factory, settings):
        self.broker = broker
        self.session_factory = session_factory
        self.settings = settings

    # ----------------------------------------------------------------- reads
    async def _baseline_equity(self) -> tuple[float | None, float | None, float | None]:
        """Cheaply fetch (initial, day_start, peak) equity without loading rows.

        Each value is a single aggregate/point query backed by the
        `created_at` index instead of materialising every snapshot row.
        """
        today = utcnow().date()
        day_start = datetime(today.year, today.month, today.day)
        day_end = day_start + timedelta(days=1)
        async with self.session_factory() as session:
            peak = (
                await session.execute(select(func.max(PortfolioSnapshotModel.equity)))
            ).scalar()
            initial = (
                await session.execute(
                    select(PortfolioSnapshotModel.equity)
                    .order_by(PortfolioSnapshotModel.created_at.asc())
                    .limit(1)
                )
            ).scalar()
            day = (
                await session.execute(
                    select(PortfolioSnapshotModel.equity)
                    .where(PortfolioSnapshotModel.created_at >= day_start)
                    .where(PortfolioSnapshotModel.created_at < day_end)
                    .order_by(PortfolioSnapshotModel.created_at.asc())
                    .limit(1)
                )
            ).scalar()
        return initial, day, peak

    async def get_snapshot(self) -> tuple[PortfolioSnapshot, dict]:
        account = await self.broker.get_account()
        broker_positions = await self.broker.get_positions()
        initial_equity, day_start_equity, peak_db = await self._baseline_equity()

        equity = float(account.equity or 0.0)
        peak_equity = max(peak_db or equity, equity)

        day_base = day_start_equity if day_start_equity is not None else equity
        daily_pnl = equity - day_base
        daily_pnl_pct = (daily_pnl / day_base) if day_base > 0 else 0.0
        drawdown = ((peak_equity - equity) / peak_equity) if peak_equity > 0 else 0.0
        initial_equity = initial_equity if initial_equity is not None else equity
        total_pnl = equity - initial_equity

        sector_values: dict[str, float] = defaultdict(float)
        positions_out: list[PositionOut] = []
        for position in broker_positions:
            sector = self.settings.sector_map.get(position.symbol, "other")
            sector_values[sector] += float(position.market_value or 0.0)
            positions_out.append(
                PositionOut(
                    symbol=position.symbol,
                    sector=sector,
                    quantity=position.quantity,
                    avg_entry_price=round(position.avg_entry_price, 4),
                    current_price=round(position.current_price, 4),
                    market_value=round(position.market_value, 2),
                    unrealized_pnl=round(position.unrealized_pnl, 2),
                    weight=round((float(position.market_value) / equity) if equity > 0 else 0.0, 4),
                )
            )

        sector_exposure = (
            {k: round(v / equity, 4) for k, v in sector_values.items()} if equity > 0 else {}
        )

        top_position = max(positions_out, key=lambda p: p.weight, default=None)
        top_sector_pair = max(sector_exposure.items(), key=lambda kv: kv[1], default=None)

        metrics = {
            "day_start_equity": day_base,
            "peak_equity": peak_equity,
            "daily_loss_pct": max(0.0, -daily_pnl_pct),
            "drawdown_pct": drawdown,
            "sector_values": dict(sector_values),
            "top_symbol": top_position.symbol if top_position else None,
            "top_symbol_exposure_pct": top_position.weight if top_position else 0.0,
            "top_sector": top_sector_pair[0] if top_sector_pair else None,
            "top_sector_exposure_pct": top_sector_pair[1] if top_sector_pair else 0.0,
        }

        snapshot = PortfolioSnapshot(
            equity=round(equity, 2),
            cash=round(float(account.cash or 0.0), 2),
            buying_power=round(float(account.buying_power or 0.0), 2),
            positions=positions_out,
            total_pnl=round(total_pnl, 2),
            daily_pnl=round(daily_pnl, 2),
            daily_pnl_pct=round(daily_pnl_pct, 4),
            drawdown=round(drawdown, 4),
            sector_exposure=sector_exposure,
            risk_score=self.compute_risk_score(metrics),
            peak_equity=round(peak_equity, 2),
            timestamp=utcnow(),
        )
        return snapshot, metrics

    async def get_positions(self) -> list[PositionOut]:
        snapshot, _metrics = await self.get_snapshot()
        return snapshot.positions

    async def recent_snapshots(self, limit: int = 1000) -> list:
        async with self.session_factory() as session:
            rows = (
                await session.execute(
                    select(PortfolioSnapshotModel)
                    .order_by(PortfolioSnapshotModel.created_at.desc())
                    .limit(limit)
                )
            ).scalars().all()
        return list(reversed(rows))  # oldest first

    # ------------------------------------------------------------- analytics
    def compute_risk_score(self, metrics: dict) -> float:
        """Deterministic utilization score: worst limit utilization, clamped to [0,1]."""
        limits = self.settings
        ratios: list[float] = []
        if limits.max_position_percent > 0:
            ratios.append(metrics["top_symbol_exposure_pct"] / limits.max_position_percent)
        if limits.max_sector_exposure_percent > 0:
            ratios.append(metrics["top_sector_exposure_pct"] / limits.max_sector_exposure_percent)
        if limits.max_drawdown_percent > 0:
            ratios.append(metrics["drawdown_pct"] / limits.max_drawdown_percent)
        if limits.max_daily_loss_percent > 0:
            ratios.append(metrics["daily_loss_pct"] / limits.max_daily_loss_percent)
        return round(min(1.0, max(0.0, max(ratios, default=0.0))), 3)

    # -------------------------------------------------------------- persistence
    async def persist_current(self) -> PortfolioSnapshot:
        """Write a snapshot row and mirror broker positions locally."""
        snapshot, _metrics = await self.get_snapshot()
        async with self.session_factory() as session:
            session.add(
                PortfolioSnapshotModel(
                    equity=snapshot.equity,
                    cash=snapshot.cash,
                    buying_power=snapshot.buying_power,
                    total_pnl=snapshot.total_pnl,
                    daily_pnl=snapshot.daily_pnl,
                    drawdown=snapshot.drawdown,
                    risk_score=snapshot.risk_score,
                )
            )
            await session.commit()
        await self.sync_positions_from_broker()
        logger.debug(
            "portfolio snapshot persisted",
            extra={"equity": snapshot.equity, "risk_score": snapshot.risk_score},
        )
        return snapshot

    async def sync_positions_from_broker(self) -> None:
        broker_positions = await self.broker.get_positions()
        async with self.session_factory() as session:
            existing_rows = (
                await session.execute(select(PositionModel))
            ).scalars().all()
            existing = {row.symbol: row for row in existing_rows}

            seen: set[str] = set()
            for bp in broker_positions:
                seen.add(bp.symbol)
                sector = self.settings.sector_map.get(bp.symbol, "other")
                row = existing.get(bp.symbol)
                if row is None:
                    session.add(
                        PositionModel(
                            symbol=bp.symbol,
                            quantity=bp.quantity,
                            avg_entry_price=bp.avg_entry_price,
                            current_price=bp.current_price,
                            sector=sector,
                            unrealized_pnl=bp.unrealized_pnl,
                        )
                    )
                else:
                    row.quantity = bp.quantity
                    row.avg_entry_price = bp.avg_entry_price
                    row.current_price = bp.current_price
                    row.sector = sector
                    row.unrealized_pnl = bp.unrealized_pnl

            stale = [symbol for symbol in existing if symbol not in seen]
            if stale:
                await session.execute(delete(PositionModel).where(PositionModel.symbol.in_(stale)))
            await session.commit()
