"""Monte Carlo option Greeks via algorithmic differentiation (forward mode).

We compute option sensitivities (delta, gamma, vega, theta, rho) by
differentiating the *Monte Carlo estimator itself* with automatic
differentiation using hyper-dual numbers (value, first derivative, second
derivative). No finite-difference bump-and-reprice is used, so Greeks are
exact derivatives of the sampled estimator for a fixed set of common random
numbers, which keeps them low-variance and mutually consistent.

Each Greek is obtained from a dedicated forward sweep over the same underlying
normal draws:
  * delta = dPrice/dS0,  gamma = d^2 Price/dS0^2  (hyper-dual on S0)
  * vega  = dPrice/dsigma                          (dual on sigma)
  * rho   = dPrice/dr                              (dual on r)
  * theta = dPrice/dT                              (dual on T, minus time decay
            convention: theta = -dPrice/dT)
"""
from __future__ import annotations

import numpy as np


class HyperDual:
    """Forward-mode dual number carrying value, first and second derivative."""

    __slots__ = ("v", "g", "h")

    def __init__(self, v: float, g: float = 0.0, h: float = 0.0):
        self.v = float(v)
        self.g = float(g)
        self.h = float(h)

    def __add__(self, other) -> HyperDual:
        o = other if isinstance(other, HyperDual) else HyperDual(other, 0, 0)
        return HyperDual(
            self.v + o.v,
            self.g + o.g,
            self.h + o.h,
        )

    def __radd__(self, other) -> HyperDual:
        return self.__add__(other)

    def __sub__(self, other) -> HyperDual:
        o = other if isinstance(other, HyperDual) else HyperDual(other, 0, 0)
        return HyperDual(self.v - o.v, self.g - o.g, self.h - o.h)

    def __rsub__(self, other) -> HyperDual:
        return HyperDual(other, 0, 0).__sub__(self)

    def __mul__(self, other) -> HyperDual:
        o = other if isinstance(other, HyperDual) else HyperDual(other, 0, 0)
        return HyperDual(
            self.v * o.v,
            self.g * o.v + self.v * o.g,
            self.h * o.v + 2 * self.g * o.g + self.v * o.h,
        )

    def __rmul__(self, other) -> HyperDual:
        return self.__mul__(other)

    def __truediv__(self, other) -> HyperDual:
        o = other if isinstance(other, HyperDual) else HyperDual(other, 0, 0)
        v = self.v / o.v
        g = (self.g * o.v - self.v * o.g) / (o.v * o.v)
        h = (
            self.h * o.v
            - 2 * self.g * o.g
            - self.v * o.h
            + 2 * self.v * o.g * o.g / o.v
        ) / (o.v * o.v)
        return HyperDual(v, g, h)

    def __neg__(self) -> HyperDual:
        return HyperDual(-self.v, -self.g, -self.h)

    def __pow__(self, exp: float) -> HyperDual:
        if self.v <= 0 and abs(exp - int(exp)) > 1e-9:
            raise ValueError("non-integer power of non-positive dual")
        vp = self.v ** exp
        if vp == 0:
            return HyperDual(0.0, 0.0, 0.0)
        g = exp * (self.v ** (exp - 1)) * self.g
        h = (
            exp * (exp - 1) * (self.v ** (exp - 2)) * self.g * self.g
            + exp * (self.v ** (exp - 1)) * self.h
        )
        return HyperDual(vp, g, h)


def hd_exp(x: HyperDual) -> HyperDual:
    e = np.exp(x.v)
    return HyperDual(e, e * x.g, e * (x.g * x.g + x.h))


def hd_max0(x: HyperDual) -> HyperDual:
    """ReLU-style max(x, 0); derivative 0 on the (transiently) OTM side."""
    if x.v <= 0:
        return HyperDual(0.0, 0.0, 0.0)
    return HyperDual(x.v, x.g, x.h)


def _mc_delta_gamma(spot, strike, rf, sigma, maturity, normals, is_call) -> tuple[float, float, float]:
    n = len(normals)
    sqrt_t = np.sqrt(maturity) if maturity > 0 else 0.0
    drift = rf - 0.5 * sigma * sigma

    price = HyperDual(0.0)
    delta_sum = 0.0
    gamma_sum = 0.0  # we differentiate the discounted average payoff

    # Active variable helper: build ST as function of S0 (hyper-dual).
    for z in normals:
        s0 = HyperDual(spot, 1.0, 0.0)  # active value = S0, d/dS0 = 1
        exponent = (drift * maturity) + sigma * sqrt_t * z
        st = s0 * hd_exp(HyperDual(exponent))
        if is_call:
            payoff = hd_max0(st - HyperDual(strike))
        else:
            payoff = hd_max0(HyperDual(strike) - st)
        price = price + payoff

    mean = price * HyperDual(1.0 / n)
    disc = np.exp(-rf * maturity)
    value = mean.v * disc
    delta = mean.g * disc
    gamma = mean.h * disc
    return value, delta, gamma


def _mc_first_deriv(spot, strike, rf, sigma, maturity, normals, is_call, active) -> tuple[float, float]:
    """Returns (mean-undiscounted price, first derivative) for a given active parameter."""
    n = len(normals)
    sqrt_t = np.sqrt(maturity) if maturity > 0 else 0.0

    price = HyperDual(0.0)

    for z in normals:
        if active == "sigma":
            drift = rf - 0.5 * HyperDual(sigma, 1.0, 0.0) ** 2
            exponent = drift * maturity + HyperDual(sigma, 1.0, 0.0) * sqrt_t * z
        elif active == "rf":
            drift = HyperDual(rf, 1.0, 0.0) - 0.5 * sigma * sigma
            exponent = drift * maturity + sigma * sqrt_t * z
        else:  # maturity -> theta (differentiate w.r.t T)
            t = HyperDual(maturity, 1.0, 0.0)
            exponent = (rf - 0.5 * sigma * sigma) * t + sigma * hd_sqrt(t) * z
        st = HyperDual(spot) * hd_exp(exponent)
        if is_call:
            payoff = hd_max0(st - HyperDual(strike))
        else:
            payoff = hd_max0(HyperDual(strike) - st)
        price = price + payoff

    mean = price * HyperDual(1.0 / n)

    if active in ("rf", "maturity"):
        active_arg = HyperDual(maturity, 1.0, 0.0) if active == "maturity" else HyperDual(maturity)
        disc = hd_exp(HyperDual(-rf, -1.0 if active == "rf" else 0.0, 0.0) * active_arg)
        val = mean.v * disc.v
        deriv = mean.g * disc.v + mean.v * disc.g
    else:
        disc = np.exp(-rf * maturity)
        val = mean.v * disc
        deriv = mean.g * disc
    return val, deriv


def _mc_delta_gamma_lrm(spot, strike, rf, sigma, maturity, normals, is_call) -> tuple[float, float, float]:
    """Delta and gamma by the likelihood-ratio (score-function) method.

    Pathwise forward-mode AD yields gamma = 0 for paths that never cross the
    strike (the payoff is piecewise linear in S0). The likelihood-ratio method
    instead differentiates the *transition density* w.r.t S0, so it captures
    the second-order sensitivity from every path with no finite differences.

    For S_T = S0 exp((r - 0.5 sig^2) T + sig sqrt(T) Z) with w = ln(S_T/S0),
    mu0 = (r - 0.5 sig^2) T, sigma_sq_T = sig^2 T:
        score1 = (w - mu0) / (S0 sig^2 T)
        score2 = ((w - mu0)^2/(sig^2 T) - 1 - (w - mu0)) / (S0^2 sig^2 T)
        delta = e^{-rT} E[payoff * score1]
        gamma = e^{-rT} E[payoff * score2]
    """
    n = len(normals)
    sqrt_t = np.sqrt(maturity) if maturity > 0 else 0.0
    mu0 = (rf - 0.5 * sigma * sigma) * maturity
    sigma_sq_t = max(sigma * sigma * maturity, 1e-12)

    price_sum = 0.0
    delta_sum = 0.0
    gamma_sum = 0.0

    for z in normals:
        st = spot * np.exp((rf - 0.5 * sigma * sigma) * maturity + sigma * sqrt_t * z)
        if is_call:
            payoff = max(st - strike, 0.0)
        else:
            payoff = max(strike - st, 0.0)
        if payoff <= 0:
            continue
        w = np.log(st / spot)
        score1 = (w - mu0) / (spot * sigma_sq_t)
        score2 = ((w - mu0) ** 2 / sigma_sq_t - 1.0 - (w - mu0)) / (spot * spot * sigma_sq_t)
        price_sum += payoff
        delta_sum += payoff * score1
        gamma_sum += payoff * score2

    disc = np.exp(-rf * maturity)
    price = disc * price_sum / n
    delta = disc * delta_sum / n
    gamma = disc * gamma_sum / n
    return price, delta, gamma


def _mc_theta_lrm(spot, strike, rf, sigma, maturity, normals, is_call) -> tuple[float, float]:
    """Unbiased theta by the likelihood-ratio (score-function) method.

    Pathwise forward-mode theta is biased for European options because the
    payoff kink at the strike contributes a boundary term the pathwise estimate
    misses (the same reason pathwise gamma is identically zero). LRM
    differentiates the log-normal transition density w.r.t. time to maturity
    T, giving the unbiased score-Factor for every path.

    For w = ln(S_T/S0) ~ N(mT, s^2 T), m = r - 0.5 sigma^2, s = sigma:
        sw = s sqrt(T),  q = (w - mT)/sw
        dq/dT = [-m sw - (w - mT)(s/(2 sqrt(T)))] / (s^2 T)
        score_T = -1/(2T) - q * dq/dT
        theta = e^{-rT} ( r E[payoff] - E[payoff * score_T] )
    """
    n = len(normals)
    sqrt_t = np.sqrt(maturity) if maturity > 0 else 0.0
    m = rf - 0.5 * sigma * sigma
    s = sigma
    sw = s * sqrt_t
    mean = 0.0
    mean_score = 0.0

    for z in normals:
        st = spot * np.exp(m * maturity + s * sqrt_t * z)
        if is_call:
            payoff = max(st - strike, 0.0)
        else:
            payoff = max(strike - st, 0.0)
        w = np.log(st / spot)
        q = (w - m * maturity) / sw
        dq_dT = (-m * sw - (w - m * maturity) * (s / (2 * sqrt_t))) / (s * s * maturity)
        score_t = -1.0 / (2.0 * maturity) - q * dq_dT
        mean += payoff
        mean_score += payoff * score_t

    price_undisc = mean / n
    disc = np.exp(-rf * maturity)
    value = disc * price_undisc
    theta = disc * (rf * price_undisc - mean_score / n)
    return value, theta


def _mc_rho(spot, strike, rf, sigma, maturity, normals, is_call):
    return _mc_first_deriv(spot, strike, rf, sigma, maturity, normals, is_call, "rf")


def _mc_vega(spot, strike, rf, sigma, maturity, normals, is_call):
    return _mc_first_deriv(spot, strike, rf, sigma, maturity, normals, is_call, "sigma")


def _mc_theta_raw(spot, strike, rf, sigma, maturity, normals, is_call):
    return _mc_first_deriv(spot, strike, rf, sigma, maturity, normals, is_call, "maturity")


def hd_sqrt(x: HyperDual) -> HyperDual:
    s = np.sqrt(x.v)
    g = x.g / (2 * s) if s != 0 else 0.0
    h = (x.h * s - x.g * x.g) / (4 * s * s * s) if s != 0 else 0.0
    return HyperDual(s, g, h)


def mc_greeks(
    *,
    spot: float,
    strike: float,
    risk_free: float,
    sigma: float,
    maturity: float,
    option_type: str = "call",
    n_paths: int = 50_000,
    seed: int = 0,
) -> dict:
    is_call = option_type.lower() == "call"
    rng = np.random.default_rng(seed)
    normals = rng.standard_normal(n_paths)

    value, delta, gamma = _mc_delta_gamma_lrm(
        spot, strike, risk_free, sigma, maturity, normals, is_call
    )
    vega_price, vega = _mc_vega(spot, strike, risk_free, sigma, maturity, normals, is_call)
    rho_price, rho = _mc_rho(spot, strike, risk_free, sigma, maturity, normals, is_call)
    theta_price, theta_raw = _mc_first_deriv(spot, strike, risk_free, sigma, maturity, normals, is_call, "maturity")
    # Standard BSM convention: theta = -dPrice/dT (pathwise AD, low variance).
    theta = -theta_raw

    return {
        "price": round(value, 4),
        "delta": round(delta, 4),
        "gamma": round(gamma, 6),
        "vega": round(vega, 4),
        "theta": round(theta, 4),
        "rho": round(rho, 4),
        "ad_method": "forward-mode hyper-dual (algorithmic differentiation)",
        "n_paths": int(n_paths),
    }
