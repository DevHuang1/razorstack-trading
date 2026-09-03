// Shared server-side client for the FastAPI trading backend.
// The backend URL AND API key must stay server-only: never read them in client
// components and never prefix them with NEXT_PUBLIC_.

const DEFAULT_BASE_URL = "http://127.0.0.1:8000";

export const DEFAULT_BACKEND_TIMEOUT_MS = 10_000;

export function backendBaseUrl(): string {
  return (process.env.BACKEND_API_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
}

/**
 * Server-only API key forwarded as `X-API-Key` to the FastAPI backend.
 *
 * The FastAPI `require_api_key` dependency is opt-in: when `API_KEY` is unset
 * on the backend every endpoint works without a key. As soon as it is set, all
 * mutating/admin endpoints (trades/propose, trades/execute, order cancel,
 * admin/*) reject requests without a valid key — so the bridge client must
 * forward it or the AI research desk / quant desk can no longer submit.
 * Leave empty when the backend has auth disabled.
 */
export function backendApiKey(): string {
  return process.env.BACKEND_API_KEY ?? "";
}

export function backendUrl(path: string): string {
  return `${backendBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

export interface BackendOk<T> {
  ok: true;
  status: number;
  data: T;
}

export interface BackendErr {
  ok: false;
  status: number | null;
  error: string;
  /** Raw parsed upstream body (if any) for clients that want to inspect it. */
  upstream?: unknown;
}

export type BackendResult<T> = BackendOk<T> | BackendErr;

interface BackendErrorEnvelope {
  error?: { message?: unknown } | string;
  detail?: unknown;
}

export function backendErrorMessage(body: unknown, fallback: string): string {
  if (typeof body === "object" && body !== null) {
    const envelope = body as BackendErrorEnvelope;
    if (typeof envelope.error === "string" && envelope.error.length > 0) {
      return envelope.error;
    }
    if (typeof envelope.error === "object" && envelope.error !== null && typeof envelope.error.message === "string") {
      return envelope.error.message;
    }
    if (typeof envelope.detail === "string" && envelope.detail.length > 0) {
      return envelope.detail;
    }
  }
  return fallback;
}

export interface BackendFetchOptions {
  method?: string;
  body?: string;
  timeoutMs?: number;
}

export async function backendFetch<T = unknown>(
  path: string,
  options: BackendFetchOptions = {},
): Promise<BackendResult<T>> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_BACKEND_TIMEOUT_MS;
  try {
    const apiKey = backendApiKey();
    const upstream = await fetch(backendUrl(path), {
      method: options.method ?? "GET",
      headers: {
        Accept: "application/json",
        ...(apiKey ? { "X-API-Key": apiKey } : {}),
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body,
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await upstream.text();
    let parsed: unknown = null;
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text.slice(0, 2000);
      }
    }

    if (!upstream.ok) {
      return {
        ok: false,
        status: upstream.status,
        error: backendErrorMessage(parsed, `Backend returned ${upstream.status}`),
        upstream: parsed,
      };
    }

    return { ok: true, status: upstream.status, data: parsed as T };
  } catch (error) {
    const message =
      error instanceof Error && error.name === "TimeoutError"
        ? `Backend timed out after ${timeoutMs / 1000}s`
        : "Backend is unavailable";
    return { ok: false, status: null, error: message };
  }
}