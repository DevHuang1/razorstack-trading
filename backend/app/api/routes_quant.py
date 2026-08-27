"""Quantitative pre-trade endpoints."""
from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_settings
from app.quant.data_quality import assess_data_quality
from app.quant.execution_costs import estimate_execution_cost
from app.quant.hawkes import fit_exp_hawkes
from app.quant.mc_greeks import mc_greeks
from app.schemas.quant import (
    DataQualityRequest,
    DataQualityResponse,
    ExecutionCostEstimate,
    ExecutionCostRequest,
    HawkesRequest,
    McGreeksRequest,
    McGreeksResponse,
)

router = APIRouter(prefix="/quant", tags=["quant"])


@router.post("/data-quality", response_model=DataQualityResponse)
async def data_quality(payload: DataQualityRequest, settings=Depends(get_settings)):
    return DataQualityResponse(
        quality=assess_data_quality(
            symbol=payload.symbol,
            timeframe=payload.timeframe,
            bars=payload.bars,
            as_of=payload.as_of,
            min_history_bars=settings.quant_min_history_bars,
            max_gap_bars=settings.quant_max_gap_bars,
            stale_after_intervals=settings.quant_stale_after_intervals,
        )
    )


@router.post("/execution-cost", response_model=ExecutionCostEstimate)
async def execution_cost(payload: ExecutionCostRequest, settings=Depends(get_settings)):
    return estimate_execution_cost(payload, settings)


@router.post("/hawkes")
async def hawkes(payload: HawkesRequest):
    try:
        result = fit_exp_hawkes(
            payload.times,
            stationarity_penalty=payload.stationarity_penalty,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return result


@router.post("/mc-greeks", response_model=McGreeksResponse)
async def mc_greeks_endpoint(payload: McGreeksRequest):
    result = mc_greeks(
        spot=payload.spot,
        strike=payload.strike,
        risk_free=payload.risk_free,
        sigma=payload.sigma,
        maturity=payload.maturity,
        option_type=payload.option_type,
        n_paths=payload.n_paths,
    )
    return McGreeksResponse(
        spot=payload.spot,
        strike=payload.strike,
        risk_free=payload.risk_free,
        sigma=payload.sigma,
        maturity=payload.maturity,
        option_type=payload.option_type,
        n_paths=payload.n_paths,
        ad_method=result["ad_method"],
        price=result["price"],
        delta=result["delta"],
        gamma=result["gamma"],
        vega=result["vega"],
        theta=result["theta"],
        rho=result["rho"],
    )
