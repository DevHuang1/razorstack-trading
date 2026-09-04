import { getBars } from "./datafeed";
import { runStrategies } from "./strategies";
import { drawdownStats, lastValue, realizedVolSeries, sma, round } from "./indicators";
import type { Bar, StrategyVote } from "./types";
function weightedVote(votes: StrategyVote[]) {
  let bull = 0, bear = 0, total = 0;
  for (const v of votes) { if (v.direction === "BUY") bull += v.strength; else if (v.direction === "SELL") bear += v.strength; total += v.strength; }
  const s = total > 0 ? (bull - bear) / total : 0;
  const d = s > 0.15 ? "BUY" : s < -0.15 ? "SELL" : "HOLD";
  const agreeing = votes.filter(v => v.direction === d).length;
  return { direction: d, score: round(s, 4), confidence: round(votes.length > 0 ? agreeing / votes.length : 0, 4), strength: round(total > 0 ? Math.max(bull, bear) / total * 100 : 0, 1) };
}
function computeRisk(bars: Bar[], closes: number[]) { return { realizedVolAnnualized: round((lastValue(realizedVolSeries(closes, 30)) ?? 0.2) * 100, 2), ...drawdownStats(closes) }; }
export async function generateSignalResponse(symbols: string[]) {
  const [regime, ...results] = await Promise.all([computeRegime(), ...symbols.map(s => computeSignal(s))]);
  return { generatedAt: new Date().toISOString(), source: results[0]?.source ?? "SYNTHETIC", regime, signals: results.map(r => r.signal) };
}
async function computeSignal(symbol: string, timeframe = "1Day") {
  const { bars, source } = await getBars(symbol, timeframe, 750);
  const closes = bars.map(b => b.c);
  const price = closes[closes.length - 1] ?? 0;
  const strategies = runStrategies(bars);
  const overall = weightedVote(strategies);
  const pct = (n: number) => closes.length > n ? round((price / closes[closes.length - 1 - n] - 1) * 100, 2) : 0;
  return { signal: { symbol: symbol.toUpperCase(), timeframe, generatedAt: new Date().toISOString(), source, price, changePct: { d1: pct(1), d5: pct(5), d21: pct(21) }, overall, strategies, riskMetrics: computeRisk(bars, closes), riskChecks: { modelVersion: "v1" }, dataQuality: { symbol, timeframe, barCount: bars.length, isActionable: bars.length >= 60 } }, source };
}
async function computeRegime(benchmark: string = "SPY") {
  try {
    const { bars } = await getBars(benchmark, "1Day", 300);
    const closes = bars.map(b => b.c);
    const price = closes[closes.length - 1];
    const sm20 = lastValue(sma(closes, 20));
    const sm50 = lastValue(sma(closes, 50));
    const vol = lastValue(realizedVolSeries(closes, 30)) ?? 0.15;
    const isBull = sm20 && sm50 && sm20 > sm50 && price > sm20;
    const isBear = !sm50 || price < sm50;
    const isCrisis = vol > 0.40;
    return { label: isCrisis ? "CRISIS" : isBull ? "BULL" : isBear ? "BEAR" : "RANGE", trend: isBull ? "BULL_TREND" : isBear ? "BEAR_TREND" : "RANGE", volatility: isCrisis ? "CRISIS" : vol > 0.25 ? "VOLATILE" : "NORMAL", benchmark, benchmarkRealizedVolAnnualized: round(vol * 100, 2), riskMultiplier: isCrisis ? 0.3 : isBull ? 1.0 : 0.75, crisis: isCrisis };
  } catch { return { label: "RANGE", trend: "RANGE", volatility: "NORMAL", benchmark, riskMultiplier: 0.7, crisis: false }; }
}
