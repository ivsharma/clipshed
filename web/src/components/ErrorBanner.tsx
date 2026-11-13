import { AlertTriangle, X } from "lucide-react";

export interface UiError {
  message: string;
  code?: string;
  details?: string;
}

interface ErrorBannerProps {
  error: UiError;
  onDismiss: () => void;
}

export function ErrorBanner({ error, onDismiss }: ErrorBannerProps) {
  return (
    <div className="animate-fade-in border border-[var(--line-strong)] border-l-4 border-l-[var(--red)] bg-[var(--paper-raised)] p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center border border-[var(--red)] text-[var(--red)]">
          <AlertTriangle className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-medium leading-relaxed text-[var(--red)]">{error.message}</p>
            <button type="button" onClick={onDismiss} className="btn-ghost -mr-1 -mt-1 h-7 w-7 shrink-0" aria-label="Dismiss error">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {error.details ? (
            <details className="mt-2">
              <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--ink-mute)] transition hover:text-[var(--red)]">
                Show diagnostics
              </summary>
              <pre className="scrollbar-thin mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words border border-[var(--line)] bg-[var(--paper)] p-3 font-mono text-[11px] leading-relaxed text-[var(--ink-soft)]">
                {error.details}
              </pre>
            </details>
          ) : null}
        </div>
      </div>
    </div>
  );
}
