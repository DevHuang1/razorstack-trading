import { generateText, Output } from "ai";
import type { ZodType } from "zod";
import { getModel, hasLLM } from "./llm";
import { createLogger, type Logger } from "./logger";
import type { AgentRole } from "@/lib/contracts/research";

export interface StructuredAgentConfig<TInput, TOutput> {
  name: string;
  role: AgentRole;
  description: string;
  systemPrompt: string;
  inputSchema: ZodType<TInput>;
  outputSchema: ZodType<TOutput>;
  buildPrompt: (input: TInput) => string;
  fallback: (input: TInput, cause: unknown) => TOutput;
  maxAttempts?: number;
  validate?: (output: TOutput, input: TInput) => void;
}

const DEFAULT_LLM_TIMEOUT_MS = 30_000;

function llmTimeoutMs(): number {
  const raw = Number(process.env.LLM_TIMEOUT_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_LLM_TIMEOUT_MS;
}

export class StructuredAgent<TInput, TOutput> {
  readonly name: string;
  readonly role: AgentRole;
  readonly description: string;
  readonly systemPrompt: string;
  readonly inputSchema: ZodType<TInput>;
  readonly outputSchema: ZodType<TOutput>;

  private readonly config: StructuredAgentConfig<TInput, TOutput>;
  private readonly log: Logger;

  constructor(config: StructuredAgentConfig<TInput, TOutput>) {
    this.config = config;
    this.name = config.name;
    this.role = config.role;
    this.description = config.description;
    this.systemPrompt = config.systemPrompt;
    this.inputSchema = config.inputSchema;
    this.outputSchema = config.outputSchema;
    this.log = createLogger(config.name);
  }

  async run(rawInput: TInput): Promise<TOutput> {
    const started = Date.now();
    let input: TInput;
    try {
      input = this.config.inputSchema.parse(rawInput);
    } catch (error) {
      this.log.error("input validation failed", error);
      throw error;
    }

    if (!hasLLM()) {
      this.log.warn("no LLM key configured, using deterministic fallback");
      return this.emit(this.config.fallback(input, "llm_unavailable"), started);
    }

    const attempts = Math.max(1, this.config.maxAttempts ?? 2);
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const { output } = await generateText({
          model: getModel(),
          system: this.systemPrompt,
          prompt: this.config.buildPrompt(input),
          output: Output.object({ schema: this.outputSchema }),
          abortSignal: AbortSignal.timeout(llmTimeoutMs()),
        });
        const normalized = this.normalizeConfidenceScale(output);
        const validated = this.emit(normalized, started);
        this.config.validate?.(validated, input);
        this.log.info(`completed in ${Date.now() - started}ms (attempt ${attempt})`);
        return validated;
      } catch (error) {
        lastError = error;
        this.log.warn(`attempt ${attempt}/${attempts} failed`, error);
      }
    }

    this.log.error(
      `PROVENANCE: ${this.name} produced DETERMINISTIC FALLBACK output after ${attempts} failed LLM attempt(s) — output is template-grade, not model reasoning`,
      lastError,
    );
    return this.emit(this.config.fallback(input, lastError), started);
  }

  private emit(result: TOutput, started: number): TOutput {
    const validated = this.config.outputSchema.parse(result);
    this.log.debug(`output validated in ${Date.now() - started}ms total`);
    return validated;
  }

  private normalizeConfidenceScale(result: TOutput): TOutput {
    if (result !== null && typeof result === "object" && "confidence" in result) {
      const confidence = (result as { confidence: unknown }).confidence;
      if (typeof confidence === "number" && confidence > 0 && confidence <= 1) {
        this.log.warn(`rescaled fraction confidence ${confidence} to percentage scale`);
        return { ...(result as object), confidence: Math.round(confidence * 100) } as TOutput;
      }
    }
    return result;
  }
}
