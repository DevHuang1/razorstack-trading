"""Hawkes (self-exciting) point-process fitting for market-event clustering.

Models the conditional intensity of a point process as

    lambda(t) = mu + sum_{t_i < t} alpha * exp(-beta * (t - t_i))

where mu is the background rate, alpha controls the excitation size and beta
the decay of each past event's influence. The branching ratio n = alpha / beta
is the expected number of directly-triggered "aftershocks" per event:

  * n < 1  -> subcritical: clusters die out, process is stationary/non-explosive
  * n >= 1 -> supercritical: events trigger on average one or more follow-ups,
              clustering is self-sustaining (market orders beget market orders)

Exact maximum-likelihood is used (no discretization) with a "compensator"
closed form for the exponential kernel.
"""
from __future__ import annotations

import numpy as np
from scipy.optimize import minimize


def _log_likelihood(params: np.ndarray, times: np.ndarray, T: float) -> float:
    mu, alpha, beta = (
        float(params[0]),
        max(float(params[1]), 0.0),
        float(params[2]),
    )
    n = len(times)
    if n == 0 or mu <= 0 or beta <= 0:
        return -1e15

    # comp(0) = 0; A_{k} = sum_{j<k} exp(-beta (t_k - t_j))
    A = 0.0
    ll = 0.0
    prev_t = times[0]
    for k in range(n):
        if k > 0:
            dt = times[k] - prev_t
            A = math_exp(-beta * dt) * (A + 1.0)
            prev_t = times[k]
        ll += math_log(max(mu + alpha * A, 1e-12))

    # compensator integral: mu*T + (alpha/beta) * sum (1 - exp(-beta (T - t_k)))
    compensator = mu * T
    summed = 0.0
    for t in times:
        summed += 1.0 - math_exp(-beta * (T - t))
    compensator += (alpha / beta) * summed

    return -1.0 if beta == 0 else ll - compensator


def math_exp(x: float) -> float:
    return float(np.exp(x))


def math_log(x: float) -> float:
    return float(np.log(x))


def _negative_log_likelihood(params: np.ndarray, times: np.ndarray, T: float) -> float:
    return -_log_likelihood(params, times, T)


def fit_exp_hawkes(
    times,
    *,
    stationarity_penalty: float = 0.0,
) -> dict:
    """Fit an exponential-kernel Hawkes model by exact maximum likelihood.

    Args:
        times: sorted non-negative event times (e.g. seconds since session start
            or bar indexes of volume-spike arrivals).
        stationarity_penalty: adds +penalty * max(0, alpha/beta - 1)**2 to the
            negative log-likelihood when provided, pinning the fit toward the
            stationary (subcritical) region. Default 0 keeps pure MLE.
    """
    t = np.asarray(sorted([float(x) for x in times if x >= 0]))
    if len(t) < 3:
        raise ValueError("at least 3 event times are required to fit a Hawkes model")

    T = float(t[-1])
    if T <= 0:
        raise ValueError("event times must span positive [0, T]")

    # Intial guesses from moment-matching / sensible defaults.
    mu0 = max(float(2.0 / (T + 1e-9)), 1e-4)
    alpha0 = 0.3
    beta0 = 2.0
    x0 = np.array([mu0, alpha0, beta0])

    bounds = [
        (1e-8, None),   # mu > 0
        (0.0, None),    # alpha >= 0
        (1e-8, None),   # beta > 0
    ]

    def objective(params):
        nll = _negative_log_likelihood(params, t, T)
        mu, alpha, beta = params
        br = alpha / beta
        if stationarity_penalty > 0 and br > 1:
            nll += stationarity_penalty * (br - 1.0) ** 2
        return nll

    result = minimize(
        objective,
        x0,
        method="L-BFGS-B",
        bounds=bounds,
        options={"maxiter": 2000, "ftol": 1e-12},
    )

    mu, alpha, beta = result.x
    alpha = max(float(alpha), 0.0)
    branching_ratio = alpha / beta if beta > 0 else 0.0

    intensity = _conditional_intensity(t, mu, alpha, beta)

    # Model vs empirical intensity comparison on a coarse time grid.
    grid = np.linspace(0.0, T, num=min(len(t), 100) + 1)
    model_intensity = np.array(
        [_intensity_at(tau, t, mu, alpha, beta) for tau in grid]
    )
    empirical = _empirical_intensity(t, T)

    return {
        "mu": round(float(mu), 6),
        "alpha": round(float(alpha), 6),
        "beta": round(float(beta), 6),
        "branching_ratio": round(float(branching_ratio), 6),
        "stationary": bool(branching_ratio < 1),
        "self_exciting": bool(alpha > 0),
        "log_likelihood": round(float(result.fun * -1.0), 4),
        "n_events": int(len(t)),
        "T": round(float(T), 4),
        "event_intensity": [round(float(v), 6) for v in intensity[: min(len(intensity), 500)]],
        "model_intensity_grid": {
            "t": [round(float(v), 4) for v in grid.tolist()],
            "lambda": [round(float(v), 6) for v in model_intensity.tolist()],
        },
        "empirical_intensity": round(float(empirical), 6),
        "converged": bool(result.success),
        "branching_pct": round(float(branching_ratio * 100.0), 3),
    }


def _intensity_at(tau: float, times: np.ndarray, mu: float, alpha: float, beta: float) -> float:
    val = mu
    for t in times:
        if t < tau:
            val += alpha * math_exp(-beta * (tau - t))
    return val


def _conditional_intensity(times: np.ndarray, mu: float, alpha: float, beta: float) -> np.ndarray:
    out = np.empty(len(times))
    A = 0.0
    prev = times[0]
    for k in range(len(times)):
        if k > 0:
            dt = times[k] - prev
            A = math_exp(-beta * dt) * (A + 1.0)
            prev = times[k]
        out[k] = mu + alpha * A
    return out


def _empirical_intensity(times: np.ndarray, T: float) -> float:
    return float(len(times) / T) if T > 0 else 0.0
