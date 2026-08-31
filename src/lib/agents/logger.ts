export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function activeLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? "info").toLowerCase();
  return raw in LEVEL_ORDER ? (raw as LogLevel) : "info";
}

export interface Logger {
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, error?: unknown): void;
}

export function createLogger(scope: string): Logger {
  const prefix = `[${scope}]`;
  const enabled = (level: LogLevel) => LEVEL_ORDER[level] >= LEVEL_ORDER[activeLevel()];
  const format = (data?: unknown, error?: unknown): unknown[] => {
    const parts: unknown[] = [];
    if (data !== undefined) parts.push(data);
    if (error !== undefined) {
      parts.push(error instanceof Error ? `${error.name}: ${error.message}` : error);
    }
    return parts;
  };
  return {
    debug(message, data) {
      if (enabled("debug")) console.debug(prefix, message, ...format(data));
    },
    info(message, data) {
      if (enabled("info")) console.info(prefix, message, ...format(data));
    },
    warn(message, data) {
      if (enabled("warn")) console.warn(prefix, message, ...format(data));
    },
    error(message, error) {
      if (enabled("error")) console.error(prefix, message, ...format(undefined, error));
    },
  };
}
