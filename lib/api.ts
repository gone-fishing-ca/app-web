import { API_BASE } from "./config";

export type ApiError = { status: number; message: string; detail?: unknown };

const TOKEN_KEY = "gf-token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const tok = getToken();
  if (tok) headers.set("Authorization", `Bearer ${tok}`);

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    const err: ApiError = {
      status: res.status,
      message: extractMessage(data) || `${res.status} ${res.statusText}`,
      detail: data,
    };
    throw err;
  }
  return data as T;
}

function safeJson(s: string): unknown {
  try { return JSON.parse(s); } catch { return s; }
}

function extractMessage(d: unknown): string | null {
  if (!d || typeof d !== "object") return null;
  const obj = d as Record<string, unknown>;
  if (typeof obj.detail === "string") return obj.detail;
  if (Array.isArray(obj.detail) && obj.detail.length) {
    const first = obj.detail[0] as Record<string, unknown>;
    if (first && typeof first.msg === "string") return first.msg;
  }
  if (typeof obj.message === "string") return obj.message;
  return null;
}

export const api = {
  get: <T>(p: string) => request<T>(p),
  post: <T>(p: string, body?: unknown) =>
    request<T>(p, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(p: string, body?: unknown) =>
    request<T>(p, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(p: string, body?: unknown) =>
    request<T>(p, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  del: <T>(p: string) => request<T>(p, { method: "DELETE" }),
};

/* ---- Types mirror the FastAPI schemas (Pydantic). Keep in sync. ---- */
export type User = { id: string; email: string; name: string | null };
export type Trip = {
  id: string;
  organizer_id: string;
  name: string;
  destination: string | null;
  outfitter_name: string | null;
  outfitter_contact: string | null;
  fly_in_date: string | null;
  fly_out_date: string | null;
  drive_date: string | null;
  num_participants: number | null;
};
export type Participant = {
  id: string;
  trip_id: string;
  name: string;
  cell: string | null;
  email: string | null;
  start_date: string | null;
  end_date: string | null;
  car_group: string | null;
};
export type PackItem = {
  id: string;
  trip_id: string;
  name: string;
  category: string;
  notes: string | null;
  sort_order: number;
};
export type PackStatus = {
  id: string;
  item_id: string;
  participant_id: string;
  done: boolean;
};
