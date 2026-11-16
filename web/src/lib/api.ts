import type {
  ApiErrorPayload,
  Health,
  Job,
  JobKind,
  ProbeResult,
  Settings,
  SettingsPayload,
  UpdateCheck,
} from "@clipshed/shared";

export class ApiError extends Error {
  readonly code: string;
  readonly details?: string;

  constructor(message: string, code = "API_ERROR", details?: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.details = details;
  }
}

export interface CreateJobInput {
  url: string;
  kind: JobKind;
  height?: number;
  bitrate?: number;
  range?: { start: number; end: number } | null;
  precise?: boolean;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let payload: ApiErrorPayload | null = null;
    try {
      payload = (await response.json()) as ApiErrorPayload;
    } catch {
      // Not JSON; keep the status text.
    }

    throw new ApiError(
      payload?.error?.message ?? `Request failed (${response.status}).`,
      payload?.error?.code ?? "HTTP_ERROR",
      payload?.error?.details,
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  probe(url: string): Promise<ProbeResult> {
    return request<ProbeResult>("/api/probe", {
      method: "POST",
      body: JSON.stringify({ url }),
    });
  },

  createJob(input: CreateJobInput): Promise<Job> {
    return request<Job>("/api/jobs", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  getJob(id: string): Promise<Job> {
    return request<Job>(`/api/jobs/${id}`);
  },

  listJobs(): Promise<{ jobs: Job[] }> {
    return request<{ jobs: Job[] }>("/api/jobs");
  },

  cancelJob(id: string): Promise<Job> {
    return request<Job>(`/api/jobs/${id}/cancel`, { method: "POST" });
  },

  deleteJob(id: string): Promise<void> {
    return request<void>(`/api/jobs/${id}`, { method: "DELETE" });
  },

  getSettings(): Promise<SettingsPayload> {
    return request<SettingsPayload>("/api/settings");
  },

  saveSettings(settings: Partial<Settings>): Promise<SettingsPayload> {
    return request<SettingsPayload>("/api/settings", {
      method: "PUT",
      body: JSON.stringify(settings),
    });
  },

  getHealth(): Promise<Health> {
    return request<Health>("/api/health");
  },

  updateYtDlp(): Promise<{ ok: boolean; output: string; health: Health }> {
    return request<{ ok: boolean; output: string; health: Health }>(
      "/api/ytdlp/update",
      { method: "POST" },
    );
  },

  checkForUpdates(): Promise<UpdateCheck> {
    return request<UpdateCheck>("/api/updates/check");
  },
};
