"""P0 quant metadata and execution-cost coverage."""
from datetime import datetime, timedelta, timezone

import numpy as np
from fastapi.testclient import TestClient

from app.quant.data_quality import assess_data_quality
from app.quant.execution_costs import estimate_execution_cost
from app.schemas.quant import ExecutionCostRequest, OHLCVBar


def _bars(count: int = 60, *, gap_after: int | None = None, duplicate_at: int | None = None):
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    result = []
    for index in range(count):
        timestamp = start + timedelta(days=index)
        if gap_after is not None and index > gap_after:
            timestamp += timedelta(days=2)
        result.append(
            {
                "t": timestamp,
                "o": 100 + index,
                "h": 102 + index,
                "l": 99 + index,
                "c": 101 + index,
                "v": 100_000,
            }
        )
    if duplicate_at is not None:
        result.insert(duplicate_at + 1, dict(result[duplicate_at]))
    return [OHLCVBar.model_validate(bar) for bar in result]


def test_clean_history_is_actionable():
    bars = _bars()
    quality = assess_data_quality(
        symbol="aapl",
        timeframe="1Day",
        bars=bars,
        as_of=bars[-1].t + timedelta(days=1),
        min_history_bars=60,
        max_gap_bars=3,
        stale_after_intervals=3,
    )

    assert quality.symbol == "AAPL"
    assert quality.bar_count == 60
    assert quality.duplicate_bar_count == 0
    assert quality.missing_bar_count == 0
    assert quality.is_actionable is True
    assert quality.warnings == []


def test_quality_flags_duplicate_gap_short_history_and_staleness():
    bars = _bars(10, gap_after=3, duplicate_at=2)
    quality = assess_data_quality(
        symbol="MSFT",
        timeframe="1Day",
        bars=bars,
        as_of=bars[-1].t + timedelta(days=10),
        min_history_bars=60,
        max_gap_bars=0,
        stale_after_intervals=3,
    )

    assert quality.is_actionable is False
    assert quality.bar_count == 10
    assert quality.duplicate_bar_count == 1
    assert quality.missing_bar_count >= 1
    assert quality.max_gap_bars >= 1
    assert quality.stale is True
    assert {warning.split(":", 1)[0] for warning in quality.warnings} == {
        "history_short",
        "duplicate_bars",
        "gap_too_large",
        "stale_last_bar",
    }


def test_execution_cost_model_accounts_for_impact_and_direction(settings):
    request = ExecutionCostRequest(
        symbol="AAPL",
        side="buy",
        quantity=100,
        reference_price=100,
        order_type="market",
        average_daily_volume=10_000,
    )
    estimate = estimate_execution_cost(request, settings)

    assert estimate.gross_notional == 10_000
    assert estimate.participation_rate_pct == 1
    assert estimate.market_impact_bps == 2
    assert estimate.effective_slippage_bps == 7
    assert estimate.estimated_slippage == 7
    assert estimate.total_cost == 7
    assert estimate.buy_cash_required == 10_007
    assert estimate.sell_net_proceeds == 9_993


def test_execution_cost_impact_is_capped(settings):
    request = ExecutionCostRequest(
        symbol="AAPL",
        side="buy",
        quantity=1_000_000,
        reference_price=10,
        average_daily_volume=100,
    )
    estimate = estimate_execution_cost(request, settings)

    assert estimate.market_impact_bps == settings.execution_max_market_impact_bps
    assert estimate.effective_slippage_bps == 55


def test_quant_api_returns_typed_quality_and_cost_metadata(client: TestClient):
    bars = [bar.model_dump(mode="json") for bar in _bars()]
    quality_response = client.post(
        "/quant/data-quality",
        json={
            "symbol": "aapl",
            "timeframe": "1Day",
            "bars": bars,
            "as_of": (datetime(2026, 3, 3, tzinfo=timezone.utc)).isoformat(),
        },
    )
    assert quality_response.status_code == 200
    assert quality_response.json()["quality"]["is_actionable"] is True
    assert quality_response.json()["quality"]["bar_count"] == 60

    cost_response = client.post(
        "/quant/execution-cost",
        json={
            "symbol": "AAPL",
            "side": "buy",
            "quantity": 100,
            "reference_price": 100,
            "average_daily_volume": 10_000,
        },
    )
    assert cost_response.status_code == 200
    assert cost_response.json()["total_cost"] == 7


def test_trade_proposal_includes_cost_breakdown_in_risk_details(client: TestClient):
    response = client.post(
        "/trades/propose",
        json={
            "agent_id": "quant-engine-v1",
            "symbol": "AAPL",
            "side": "buy",
            "quantity": 5,
            "order_type": "market",
            "confidence": 0.8,
            "strategy": "quant-composite-v1",
        },
    )

    assert response.status_code == 200
    risk = response.json()["risk"]
    assert risk["details"]["execution_cost"]["total_cost"] > 0
    assert risk["details"]["approved_execution_cost"]["quantity"] == 5
    assert risk["details"]["post_trade_cash"] < 100_000


async def test_risk_cash_floor_accounts_for_execution_cost(services):
    from app.schemas.trade import TradeProposal
    from app.services.risk import CODE_INSUFFICIENT_CASH

    services.settings.min_cash_percent = 0.99773
    proposal = TradeProposal(
        agent_id="quant-engine-v1",
        symbol="AAPL",
        side="buy",
        quantity=1,
        order_type="market",
        confidence=0.8,
        strategy="quant-composite-v1",
    )

    result = await services.risk.evaluate(proposal)

    assert result.status.value == "REJECTED"
    assert result.code == CODE_INSUFFICIENT_CASH
    assert result.details["execution_cost"]["total_cost"] > 0


def test_agent_status_endpoint_publishes_event(client: TestClient):
    response = client.post(
        "/agents/status",
        json={
            "agent_id": "bull-agent-v1",
            "role": "bull",
            "status": "thinking",
            "run_id": "run-123",
            "headline": "Reviewing upside catalysts",
            "progress": 42,
        },
    )

    assert response.status_code == 200
    assert response.json() == {
        "event_type": "AGENT_STATUS",
        "agent": {
            "agent_id": "bull-agent-v1",
            "role": "bull",
            "status": "thinking",
            "run_id": "run-123",
            "headline": "Reviewing upside catalysts",
            "detail": None,
            "progress": 42,
            "metadata": {},
        },
    }

    recent = client.get("/events/recent", params={"limit": 10}).json()
    status_event = next(event for event in recent if event["event_type"] == "AGENT_STATUS")
    assert status_event["payload"]["role"] == "bull"
    assert status_event["payload"]["status"] == "thinking"


def test_agent_status_endpoint_validates_role_and_status(client: TestClient):
    response = client.post(
        "/agents/status",
        json={"agent_id": "agent", "role": "unknown", "status": "working"},
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_hawkes_fit_recovers_subcritical_branching_ratio():
    from app.quant.hawkes import fit_exp_hawkes

    times = [0.0, 2.0, 5.0, 9.0, 14.0, 20.0, 27.0, 35.0, 44.0, 54.0, 65.0, 77.0]
    fit = fit_exp_hawkes(times)

    assert fit["n_events"] == len(times)
    assert fit["mu"] > 0
    assert fit["beta"] > 0
    assert 0 <= fit["branching_ratio"] < 1
    assert fit["stationary"] is True
    assert fit["converged"] is True
    assert fit["log_likelihood"] <= 0


def test_hawkes_rejects_too_few_events(client: TestClient):
    response = client.post("/quant/hawkes", json={"times": [0.0, 1.0]})
    assert response.status_code == 422


def test_hawkes_api_returns_typed_fit(client: TestClient):
    response = client.post(
        "/quant/hawkes",
        json={"times": [0.0, 1.5, 3.0, 5.0, 8.0, 12.0, 16.0, 21.0, 27.0]},
    )
    assert response.status_code == 200
    body = response.json()
    assert {"mu", "alpha", "beta", "branching_ratio", "branching_pct", "converged"} <= set(body)
    assert all(key in body for key in ("mu", "alpha", "beta"))
    assert body["stationary"] is True


def test_mc_greeks_call_matches_black_scholes_within_noise():
    from scipy.stats import norm

    from app.quant.mc_greeks import mc_greeks

    spot = strike = 100.0
    r, sigma, T = 0.05, 0.2, 1.0
    d1 = (np.log(spot / strike) + (r + 0.5 * sigma**2) * T) / (sigma * np.sqrt(T))
    d2 = d1 - sigma * np.sqrt(T)

    result = mc_greeks(
        spot=spot, strike=strike, risk_free=r, sigma=sigma, maturity=T,
        option_type="call", n_paths=200_000, seed=42,
    )

    assert abs(result["price"] - (spot * norm.cdf(d1) - strike * np.exp(-r * T) * norm.cdf(d2))) < 0.20
    assert abs(result["delta"] - norm.cdf(d1)) < 0.03
    assert abs(result["gamma"] - norm.pdf(d1) / (spot * sigma * np.sqrt(T))) < 0.004
    assert abs(result["vega"] - spot * norm.pdf(d1) * np.sqrt(T)) < 1.5
    assert abs(result["rho"] - strike * T * np.exp(-r * T) * norm.cdf(d2)) < 1.5
    expected_theta = -(spot * norm.pdf(d1) * sigma / (2 * np.sqrt(T)) + r * strike * np.exp(-r * T) * norm.cdf(d2))
    assert abs(result["theta"] - expected_theta) < 1.0
    assert "algorithmic differentiation" in result["ad_method"]


def test_mc_greeks_put_atm_approximately_at_the_money(client: TestClient):
    response = client.post(
        "/quant/mc-greeks",
        json={
            "spot": 100, "strike": 100, "risk_free": 0.05, "sigma": 0.2,
            "maturity": 1.0, "option_type": "put", "n_paths": 200_000,
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["price"] > 0
    assert -1.0 < body["delta"] < 0.0
    assert body["gamma"] > 0
    assert body["n_paths"] == 200_000
