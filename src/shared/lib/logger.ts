type Level = "debug" | "info" | "warn" | "error";

const ORDER: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };

let current: Level = import.meta.env.DEV ? "debug" : "warn";

export function setLogLevel(level: Level): void {
  current = level;
}

function enabled(level: Level): boolean {
  return ORDER[level] >= ORDER[current];
}

export const logger = {
  debug: (...a: unknown[]) => {
    if (enabled("debug")) console.debug(...a);
  },
  info: (...a: unknown[]) => {
    if (enabled("info")) console.info(...a);
  },
  warn: (...a: unknown[]) => {
    if (enabled("warn")) console.warn(...a);
  },
  error: (...a: unknown[]) => {
    if (enabled("error")) console.error(...a);
  },
};
