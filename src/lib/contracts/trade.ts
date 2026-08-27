import { z } from "zod";

export const TradeProposalRequestSchema = z.object({
  agent_id: z.string().min(1).max(120),
  symbol: z.string().trim().regex(/^(?=.*[A-Za-z])[A-Za-z0-9.\-]{1,10}$/).transform((value) => value.toUpperCase()),
  side: z.enum(["buy", "sell"]),
  quantity: z.number().int().positive(),
  order_type: z.enum(["market", "limit"]).default("market"),
  limit_price: z.number().positive().optional(),
  strategy: z.string().max(64).default("unknown"),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().max(4000).default(""),
}).superRefine((value, context) => {
  if (value.order_type === "limit" && value.limit_price === undefined) {
    context.addIssue({ code: "custom", path: ["limit_price"], message: "limit_price is required for limit orders" });
  }
});

export type TradeProposalRequest = z.infer<typeof TradeProposalRequestSchema>;
