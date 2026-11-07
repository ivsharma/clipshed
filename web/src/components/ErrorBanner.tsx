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
    <div className="animate-fade-in rounded-2xl border border-red-400/20 bg-red-500/[0.07] p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-red-500/15 text-red-300">
          <AlertTriangle className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-medium leading-relaxed text-red-100/90">
              {error.message}
            </p>
            <button
              type="button"
              onClick={onDismiss}
              className="btn-ghost -mr-1 -mt-1 h-7 w-7 shrink-0"
              aria-label="Dismiss error"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {error.details ? (
            <details className="mt-2 group">
              <summary className="cursor-pointer select-none text-xs font-medium text-red-200/55 transition hover:text-red-200/80">
                Show diagnostics
              </summary>
              <pre className="scrollbar-thin mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-red-300/10 bg-black/25 p-3 font-mono text-[11px] leading-relaxed text-red-100/50">
                {error.details}
              </pre>
            </details>
          ) : null}
        </div>
      </div>
    </div>
  );
}
