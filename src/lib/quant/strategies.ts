import type { Bar, Direction, StrategyId, StrategyVote } from "./types";
import {
  bollinger,
  clamp,
  ema,
  lastValue,
  normalizedSlope,
  obv,
  realizedVolSeries,
  relativeVolume,
  roc,
  round,
  rsi,
  sma,
} from "./indicators";

export interface StrategyDefinition {
  id: StrategyId;
  name: string;
  minBars: number;
  evaluate(bars: Bar[]): StrategyVote;
}

function vote(
  id: StrategyId,
  name: string,
  direction: Direction,
  strength: number,
  rationale: string,
): StrategyVote {
  return {
    id,
    name,
    direction,
    strength: round(clamp(strength, 0, 1), 2),
    rationale,
  };
}

export const momentumStrategy: StrategyDefinition = {
  id: "MOMENTUM",
  name: "Momentum",
  minBars: 60,
  evaluate(bars) {
    if (bars.length < this.minBars) {
      return vote(this.id, this.name, "HOLD", 0, "Insufficient history");
    }
    const closes = bars.map((b) => b.c);
    const price = closes[closes.length - 1];
    const roc10 = roc(closes, 10);
    const roc21 = roc(closes, 21);
    const sma20 = lastValue(sma(closes, 20));
    const sma50 = lastValue(sma(closes, 50));
    const rsi14 = lastValue(rsi(closes, 14));

    let raw = 0;
    const parts: string[] = [];
    if (roc10 !== null) {
      raw += 0.4 * clamp(roc10 / 0.08, -1, 1);
      parts.push(`10d return ${(roc10 * 100).toFixed(1)}%`);
    }
    if (roc21 !== null) {
      raw += 0.25 * clamp(roc21 / 0.12, -1, 1);
      parts.push(`21d return ${(roc21 * 100).toFixed(1)}%`);
    }
    if (sma20 !== null && sma50 !== null) {
      const aligned =
        (price > sma20 ? 0.5 : -0.5) + (sma20 > sma50 ? 0.5 : -0.5);
      raw += 0.25 * clamp(aligned, -1, 1);
      parts.push(price > sma20 ? "price above SMA20" : "price below SMA20");
    }
    if (rsi14 !== null) {
      const rsiBias = rsi14 >= 75 ? -clamp((rsi14 - 75) / 15, 0, 1) : clamp((rsi14 - 45) / 25, -1, 1);
      raw += 0.1 * rsiBias;
      parts.push(`RSI ${rsi14.toFixed(0)}`);
    }

    const strength = Math.abs(raw);
    const direction: Direction =
      raw > 0.15 ? "BUY" : raw < -0.15 ? "SELL" : "HOLD";
    return vote(
      this.id,
      this.name,
      direction,
      strength,
      `${parts.join(", ")}`,
    );
  },
};

export const meanReversionStrategy: StrategyDefinition = {
  id: "MEAN_REVERSION",
  name: "Mean Reversion",
  minBars: 60,
  evaluate(bars) {
    if (bars.length < this.minBars) {
      return vote(this.id, this.name, "HOLD", 0, "Insufficient history");
    }
    const closes = bars.map((b) => b.c);
    const price = closes[closes.length - 1];
    const bands = bollinger(closes, 20, 2);
    const upper = lastValue(bands.upper);
    const lower = lastValue(bands.lower);
    const middle = lastValue(bands.middle);
    const rsi14 = lastValue(rsi(closes, 14));
    const relVol = relativeVolume(bars.map((b) => b.v), 20);

    if (upper === null || lower === null || middle === null || rsi14 === null) {
      return vote(this.id, this.name, "HOLD", 0, "Indicators not ready");
    }

    const bandWidthPct =
      middle !== 0 ? ((upper - lower) / middle) * 100 : 0;
    const parts = [
      `RSI ${rsi14.toFixed(0)}`,
      `Bollinger width ${bandWidthPct.toFixed(1)}%`,
    ];
    if (relVol !== null) parts.push(`relative volume ${relVol.toFixed(2)}x`);

    if (price <= lower && rsi14 <= 35) {
      const strength =
        clamp((lower - price) / (middle || price), 0, 0.5) +
        clamp((35 - rsi14) / 25, 0, 0.5);
      return vote(
        this.id,
        this.name,
        "BUY",
        strength,
        `Oversold: ${parts.join(", ")}`,
      );
    }
    if (price >= upper && rsi14 >= 65) {
      const strength =
        clamp((price - upper) / (middle || price), 0, 0.5) +
        clamp((rsi14 - 65) / 25, 0, 0.5);
      return vote(
        this.id,
        this.name,
        "SELL",
        strength,
        `Overbought: ${parts.join(", ")}`,
      );
    }
    return vote(this.id, this.name, "HOLD", 0, `No stretch: ${parts.join(", ")}`);
  },
};

export const trendStrategy: StrategyDefinition = {
  id: "TREND",
  name: "Trend Following",
  minBars: 220,
  evaluate(bars) {
    if (bars.length < this.minBars) {
      return vote(this.id, this.name, "HOLD", 0, "Insufficient history");
    }
    const closes = bars.map((b) => b.c);
    const sma20 = lastValue(sma(closes, 20));
    const sma50 = lastValue(sma(closes, 50));
    const sma200 = lastValue(sma(closes, 200));
    const ema20 = lastNonNull(ema(closes, 20));
    const slope20 = ema20 ? normalizedSlope(ema20, 5) : null;

    let raw = 0;
    let weight = 0;
    const parts: string[] = [];
    const add = (contribution: number | null, w: number, label: string) => {
      if (contribution !== null) {
        raw += contribution * w;
        weight += w;
        parts.push(label);
      }
    };

    if (sma50 !== null && sma200 !== null) {
      add(clamp((sma50 / sma200 - 1) / 0.03, -1, 1), 0.4, `SMA50/SMA200 ${((sma50 / sma200 - 1) * 100).toFixed(1)}%`);
    }
    if (sma20 !== null && sma50 !== null) {
      add(clamp((sma20 / sma50 - 1) / 0.02, -1, 1), 0.3, `SMA20/SMA50`);
    }
    if (slope20 !== null) {
      add(clamp(slope20 / 0.03, -1, 1), 0.3, `EMA20 slope ${(slope20 * 100).toFixed(1)}%/5d`);
    }

    const score = weight > 0 ? raw / weight : 0;
    return vote(this.id, this.name, dirFromScore(score), Math.abs(score), parts.join(", "));
  },
};

export const valueStrategy: StrategyDefinition = {
  id: "VALUE",
  name: "Value",
  minBars: 220,
  evaluate(bars) {
    if (bars.length < this.minBars) {
      return vote(this.id, this.name, "HOLD", 0, "Insufficient history");
    }
    const closes = bars.map((b) => b.c);
    const price = closes[closes.length - 1];
    const mean200 = lastValue(sma(closes, 200));
    if (mean200 === null || mean200 <= 0) {
      return vote(this.id, this.name, "HOLD", 0, "Indicators not ready");
    }

    const discount = price / mean200 - 1;
    const rets100 = bars.map((b) => b.c);
    const realized = realizedVolSeries(rets100, 20);
    const currentVol = lastValue(realized);
    const drift21 = roc(closes, 21);

    let raw = 0;
    const parts: string[] = [];
    const valueScore = clamp(-discount / 0.25, -1, 1);
    raw += 0.5 * valueScore;
    parts.push(`price ${discount >= 0 ? "+" : ""}${(discount * 100).toFixed(1)}% vs 200d mean`);

    if (currentVol !== null) {
      const calm = clamp((0.4 - currentVol) / 0.3, 0, 1);
      raw += 0.3 * calm;
      parts.push(`realized vol ${(currentVol * 100).toFixed(0)}%`);
    }
    if (drift21 !== null) {
      const driftScore = clamp(drift21 / 0.05, -0.5, 0.5);
      raw += 0.2 * driftScore;
      parts.push(`21d drift ${(drift21 * 100).toFixed(1)}%`);
    }

    const score = clamp(raw, -1, 1);
    return vote(this.id, this.name, dirFromScore(score), Math.abs(score), parts.join(", "));
  },
};

export const newsStrategy: StrategyDefinition = {
  id: "NEWS",
  name: "News Sentiment",
  minBars: 30,
  evaluate(bars) {
    if (bars.length < this.minBars) {
      return vote(this.id, this.name, "HOLD", 0, "Insufficient history");
    }
    const closes = bars.map((b) => b.c);
    const obvSeries = obv(bars);
    const obvSlope = normalizedSlope(obvSeries.map((v) => Math.abs(v) + 1e-6), 5);
    const relVol = relativeVolume(bars.map((b) => b.v), 20);
    const rsi14 = lastValue(rsi(closes, 14));
    const roc5 = roc(closes, 5);

    let raw = 0;
    const parts: string[] = [];
    if (obvSlope !== null) {
      raw += 0.5 * clamp(obvSlope / 0.02, -1, 1);
      parts.push(`OBV impulse ${(obvSlope * 100).toFixed(2)}%`);
    }
    if (relVol !== null) {
      const volSurge = clamp((relVol - 1) / 2, -0.3, 0.7);
      raw += 0.3 * volSurge;
      parts.push(`relative volume ${relVol.toFixed(2)}x`);
    }
    if (roc5 !== null) {
      const priceFlow = Math.sign(roc5) * clamp(Math.abs(roc5) / 0.03, 0, 0.7);
      raw += 0.2 * priceFlow;
      parts.push(`5d move ${(roc5 * 100).toFixed(1)}%`);
    }
    if (rsi14 !== null && rsi14 > 90) {
      raw -= 0.3;
      parts.push("extreme RSI (overheated)");
    }

    const score = clamp(raw, -1, 1);
    if (Math.abs(score) < 0.1) {
      return vote(this.id, this.name, "HOLD", Math.abs(score), `No news-flow signal: ${parts.join(", ") || "flat"}`);
    }
    return vote(this.id, this.name, dirFromScore(score), Math.abs(score), parts.join(", "));
  },
};

export const optionsStrategy: StrategyDefinition = {
  id: "OPTIONS",
  name: "Options Structure",
  minBars: 30,
  evaluate(bars) {
    void bars.length;
    return vote(this.id, this.name, "HOLD", 0, "Option-structure strategy is owned by the option desk and is not evaluated here");
  },
};

function dirFromScore(raw: number): Direction {
  return raw > 0.15 ? "BUY" : raw < -0.15 ? "SELL" : "HOLD";
}

function lastNonNull(series: (number | null)[]): number[] | null {
  const filtered = series.filter((v): v is number => v !== null);
  return filtered.length > 0 ? filtered : null;
}

const REGISTRY = new Map<StrategyId, StrategyDefinition>([
  [momentumStrategy.id, momentumStrategy],
  [meanReversionStrategy.id, meanReversionStrategy],
  [trendStrategy.id, trendStrategy],
  [valueStrategy.id, valueStrategy],
  [newsStrategy.id, newsStrategy],
  [optionsStrategy.id, optionsStrategy],
]);

export function getStrategy(id: StrategyId): StrategyDefinition | undefined {
  return REGISTRY.get(id);
}

export function listStrategies(): StrategyDefinition[] {
  return [...REGISTRY.values()];
}

export function runStrategies(bars: Bar[]): StrategyVote[] {
  return listStrategies().map((s) => s.evaluate(bars));
}
