/**
 * Splits streamed text on CR, LF, or CRLF. ffmpeg writes progress with carriage
 * returns, so a normal readline interface is not enough.
 */
export class LineSplitter {
  private buffer = "";

  constructor(private readonly onLine: (line: string) => void) {}

  push(chunk: string): void {
    this.buffer += chunk;
    const parts = this.buffer.split(/\r\n|\n|\r/);
    this.buffer = parts.pop() ?? "";

    for (const part of parts) {
      if (part) this.onLine(part);
    }
  }

  flush(): void {
    if (this.buffer) {
      const remaining = this.buffer;
      this.buffer = "";
      this.onLine(remaining);
    }
  }
}
