import { useEffect, useRef } from "react";
import type { JobEvent } from "@clipshed/shared";

export function useJobEvents(
  jobId: string | null,
  onEvent: (event: JobEvent) => void,
  enabled = true,
): void {
  const callbackRef = useRef(onEvent);

  useEffect(() => {
    callbackRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!jobId || !enabled) return;

    const source = new EventSource(`/api/jobs/${jobId}/events`);

    source.onmessage = (message) => {
      try {
        callbackRef.current(JSON.parse(message.data) as JobEvent);
      } catch {
        // Ignore malformed events; the next snapshot will recover.
      }
    };

    return () => {
      source.close();
    };
  }, [jobId, enabled]);
}
