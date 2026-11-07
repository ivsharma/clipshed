function timestamp(): string {
  return new Date().toISOString().slice(11, 19);
}

function write(level: string, message: string, extra?: unknown): void {
  const suffix = extra === undefined ? "" : ` ${formatExtra(extra)}`;
  const line = `[${timestamp()}] ${level} ${message}${suffix}`;

  if (level === "ERROR") console.error(line);
  else if (level === "WARN") console.warn(line);
  else console.log(line);
}

function formatExtra(extra: unknown): string {
  if (extra instanceof Error) return extra.stack ?? extra.message;
  if (typeof extra === "string") return extra;
  try {
    return JSON.stringify(extra);
  } catch {
    return String(extra);
  }
}

export const log = {
  info: (message: string, extra?: unknown) => write("INFO", message, extra),
  warn: (message: string, extra?: unknown) => write("WARN", message, extra),
  error: (message: string, extra?: unknown) => write("ERROR", message, extra),
};
