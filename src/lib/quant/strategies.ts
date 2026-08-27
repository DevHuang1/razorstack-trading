import type { Bar, Direction, StrategyId, StrategyVote } from "./types";
import {
  bollinger,
  clamp,
  lastValue,
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

const REGISTRY = new Map<StrategyId, StrategyDefinition>([
  [momentumStrategy.id, momentumStrategy],
  [meanReversionStrategy.id, meanReversionStrategy],
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
