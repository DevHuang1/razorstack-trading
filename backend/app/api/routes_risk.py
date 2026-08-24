"""Risk status endpoint: live metrics, configured limits, halt flags."""
from fastapi import APIRouter, Depends

from app.api.deps import get_portfolio, get_settings
from app.schemas.risk import RiskLimits, RiskMetrics, RiskStatusResponse
from app.services.portfolio import PortfolioService

router = APIRouter(prefix="/risk", tags=["risk"])


@router.get("/status", response_model=RiskStatusResponse)
async def risk_status(
    settings=Depends(get_settings),
    portfolio: PortfolioService = Depends(get_portfolio),
):
    snapshot, metrics = await portfolio.get_snapshot()

    restrictions: list[str] = []
    if (
        settings.max_daily_loss_percent > 0
        and metrics["daily_loss_pct"] >= settings.max_daily_loss_percent
    ):
        restrictions.append("DAILY_LOSS_HALT")
    if (
        settings.max_drawdown_percent > 0
        and metrics["drawdown_pct"] >= settings.max_drawdown_percent
    ):
        restrictions.append("DRAWDOWN_HALT")

    return RiskStatusResponse(
        broker_mode=settings.broker_mode,
        restricted_mode=bool(restrictions),
        restrictions=restrictions,
        limits=RiskLimits(
            max_position_percent=settings.max_position_percent,
            max_sector_exposure_percent=settings.max_sector_exposure_percent,
            min_cash_percent=settings.min_cash_percent,
            max_daily_loss_percent=settings.max_daily_loss_percent,
            max_drawdown_percent=settings.max_drawdown_percent,
        ),
        metrics=RiskMetrics(
            equity=snapshot.equity,
            cash=snapshot.cash,
            buying_power=snapshot.buying_power,
            daily_pnl=snapshot.daily_pnl,
            daily_loss_pct=round(metrics["daily_loss_pct"], 4),
            drawdown_pct=round(metrics["drawdown_pct"], 4),
            peak_equity=metrics["peak_equity"],
            top_symbol=metrics["top_symbol"],
            top_symbol_exposure_pct=metrics["top_symbol_exposure_pct"],
            top_sector=metrics["top_sector"],
            top_sector_exposure_pct=metrics["top_sector_exposure_pct"],
            risk_score=snapshot.risk_score,
        ),
    )
