import { z } from "zod";

// Wire contracts for the FastAPI quant endpoints (backend/app/schemas/quant.py).
// Field names are snake_case on the wire to match the Pydantic models; the
// bridge routes validate both the outgoing request and the upstream response
// so malformed backend payloads never reach the browser.

export const QuantBarWireSchema = z.object({
  t: z.string().min(1),
  o: z.number().positive(),
  h: z.number().positive(),
  l: z.number().positive(),
  c: z.number().positive(),
  v: z.number().nonnegative(),
});
export type QuantBarWire = z.infer<typeof QuantBarWireSchema>;

export const QuantDataQualityRequestSchema = z.object({
  symbol: z.string().min(1).max(12),
  timeframe: z.string().min(1).default("1Day"),
  bars: z.array(QuantBarWireSchema).min(1),
  as_of: z.string().min(1).optional(),
});
export type QuantDataQualityRequest = z.output<typeof QuantDataQualityRequestSchema>;

export const QuantDataQualityMetadataSchema = z.object({
  symbol: z.string(),
  timeframe: z.string(),
  bar_count: z.number().int().nonnegative(),
  first_bar_at: z.string().nullable(),
  last_bar_at: z.string().nullable(),
  expected_interval_seconds: z.number().int().positive().nullable(),
  duplicate_bar_count: z.number().int().nonnegative(),
  missing_bar_count: z.number().int().nonnegative(),
  max_gap_bars: z.number().int().nonnegative(),
  stale: z.boolean(),
  is_actionable: z.boolean(),
  warnings: z.array(z.string()),
});
export type QuantDataQualityMetadata = z.infer<typeof QuantDataQualityMetadataSchema>;

export const QuantDataQualityResponseSchema = z.object({
  quality: QuantDataQualityMetadataSchema,
});
export type QuantDataQualityResponse = z.infer<typeof QuantDataQualityResponseSchema>;

export const QuantExecutionCostRequestSchema = z.object({
  symbol: z.string().min(1).max(12),
  side: z.enum(["buy", "sell"]),
  quantity: z.number().int().positive(),
  reference_price: z.number().positive(),
  order_type: z.enum(["market", "limit"]).default("market"),
  average_daily_volume: z.number().positive().optional(),
});
export type QuantExecutionCostRequest = z.output<typeof QuantExecutionCostRequestSchema>;

export const QuantExecutionCostEstimateSchema = z.object({
  symbol: z.string(),
  side: z.enum(["buy", "sell"]),
  order_type: z.enum(["market", "limit"]),
  quantity: z.number().int().positive(),
  reference_price: z.number(),
  gross_notional: z.number(),
  participation_rate_pct: z.number().nullable().optional(),
  base_slippage_bps: z.number(),
  market_impact_bps: z.number(),
  effective_slippage_bps: z.number(),
  estimated_slippage: z.number(),
  commission: z.number(),
  fixed_fee: z.number(),
  total_cost: z.number(),
  buy_cash_required: z.number(),
  sell_net_proceeds: z.number(),
});
export type QuantExecutionCostEstimate = z.infer<typeof QuantExecutionCostEstimateSchema>;

// --- Hawkes self-exciting point-process fit (POST /quant/hawkes) -------------

export const QuantHawkesRequestSchema = z.object({
  // Arrival times (seconds) of market events; at least 3 observations.
  times: z.array(z.number()).min(3),
  stationarity_penalty: z.number().nonnegative().default(0),
});
export type QuantHawkesRequest = z.output<typeof QuantHawkesRequestSchema>;

export const QuantHawkesResponseSchema = z.object({
  n_events: z.number().int().nonnegative(),
  mu: z.number(),
  alpha: z.number(),
  beta: z.number(),
  branching_ratio: z.number(),
  branching_pct: z.number(),
  log_likelihood: z.number(),
  stationary: z.boolean(),
  converged: z.boolean(),
  // The FastAPI fit also returns these diagnostics; the bridge tolerates their
  // presence/absence so a version bump on the backend does not break the UI.
  self_exciting: z.boolean().optional(),
  T: z.number().optional(),
  empirical_intensity: z.number().optional(),
  event_intensity: z.array(z.number()).optional(),
  model_intensity_grid: z
    .object({
      t: z.array(z.number()),
      lambda: z.array(z.number()),
    })
    .optional(),
});
export type QuantHawkesResponse = z.infer<typeof QuantHawkesResponseSchema>;

// --- Monte-Carlo option Greeks (POST /quant/mc-greeks) -----------------------

export const QuantMcGreeksRequestSchema = z.object({
  spot: z.number().positive(),
  strike: z.number().positive(),
  risk_free: z.number().default(0.05),
  sigma: z.number().positive().max(2),
  maturity: z.number().positive(),
  option_type: z.enum(["call", "put"]).default("call"),
  n_paths: z.number().int().min(2_000).max(1_000_000).default(50_000),
});
export type QuantMcGreeksRequest = z.output<typeof QuantMcGreeksRequestSchema>;

export const QuantMcGreeksResponseSchema = z.object({
  spot: z.number(),
  strike: z.number(),
  risk_free: z.number(),
  sigma: z.number(),
  maturity: z.number(),
  option_type: z.string(),
  price: z.number(),
  delta: z.number(),
  gamma: z.number(),
  vega: z.number(),
  theta: z.number(),
  rho: z.number(),
  ad_method: z.string(),
  n_paths: z.number().int(),
});
export type QuantMcGreeksResponse = z.infer<typeof QuantMcGreeksResponseSchema>;