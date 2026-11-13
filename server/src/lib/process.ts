import { spawn, type ChildProcess } from "node:child_process";

export interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

/** Kills a process and its children. yt-dlp spawns ffmpeg, so the whole tree must go. */
export async function killProcessTree(child: ChildProcess): Promise<void> {
  if (!child.pid) return;

  if (process.platform === "win32") {
    await new Promise<void>((resolve) => {
      const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
      killer.once("close", () => resolve());
      killer.once("error", () => resolve());
    });
    return;
  }

  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
}

export function runCommand(
  command: string,
  args: string[],
  options: { cwd?: string; timeoutMs?: number } = {},
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    child.stdout?.setEncoding("utf8").on("data", (chunk: string) => (stdout += chunk));
    child.stderr?.setEncoding("utf8").on("data", (chunk: string) => (stderr += chunk));

    const timer = setTimeout(() => {
      timedOut = true;
      void killProcessTree(child);
    }, options.timeoutMs ?? 60_000);

    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });
  });
}

/**
 * Splits streamed text on CR, LF, or CRLF. ffmpeg writes its progress with
 * carriage returns, so a line-based readline interface would miss updates.
 */
export class LineSplitter {
  private buffer = "";

  constructor(private readonly onLine: (line: string) => void) {}

  push(chunk: string): void {
    const parts = (this.buffer + chunk).split(/\r\n|\n|\r/);
    this.buffer = parts.pop() ?? "";
    for (const part of parts) if (part) this.onLine(part);
  }

  flush(): void {
    const remaining = this.buffer;
    this.buffer = "";
    if (remaining) this.onLine(remaining);
  }
}
