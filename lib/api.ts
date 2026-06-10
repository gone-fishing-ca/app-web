import { API_BASE } from "./config";
import { supabase } from "./supabase";

export type ApiError = { status: number; message: string; detail?: unknown };

/** Pulls the current access token from the Supabase client. Refreshes are
 *  handled by supabase-js internally — we always read the freshest value. */
async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const tok = await getAccessToken();
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
  // Derived server-side (min/max of stays, falling back to lake fly windows).
  // Read-only; null before any lakes/stays exist.
  start_date: string | null;
  end_date: string | null;
  // Count of people on the roster (the "Group").
  member_count: number;
};
export type Participant = {
  id: string;
  trip_id: string;
  user_id: string | null; // linked auth account, or null for app-less roster rows
  name: string;
  cell: string | null;
  email: string | null;
  car_group: string | null;
  // No dates here — a participant's span comes from their stays.
};

/** A sleeping unit at a lake. */
export type Cabin = {
  id: string;
  lake_id: string;
  name: string;
  capacity: number | null;
  notes: string | null;
  sort_order: number;
};
/** The company that runs a lake — a reusable, owner-scoped catalog entity. */
export type Outfitter = {
  id: string;
  owner_id: string;
  name: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  notes: string | null;
};
/** A reusable catalog lake (owner-scoped). Not tied to a trip — linked in via
 *  TripLake. Outfitter is embedded; cabins nested. */
export type CatalogLake = {
  id: string;
  owner_id: string;
  name: string;
  outfitter_id: string | null;
  outfitter: Outfitter | null;
  cabins: Cabin[];
};
/** A lake as it appears *on a trip* (GET /trips/{id}/lakes). `id` is the catalog
 *  lake id — so `stay.lake_id` joins straight to it — plus `trip_lake_id` (the join
 *  row, used to edit the fly window / unlink) and this trip's fly dates. */
export type TripLake = {
  id: string;            // catalog lake id
  trip_lake_id: string;  // TripLake join row id
  owner_id: string;      // catalog lake owner (gates editing in the UI)
  name: string;
  outfitter: Outfitter | null;
  fly_in_date: string | null;
  fly_out_date: string | null;
  sort_order: number;
  cabins: Cabin[];
};
/** A reusable named date range ("Week 1") — a template, not tied to a lake. */
export type Segment = {
  id: string;
  trip_id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  sort_order: number;
};
/** One participant, at one lake, for a date range, in an assigned cabin.
 *  Adopt a segment's dates by sending segment_id with no start/end. */
export type Stay = {
  id: string;
  participant_id: string;
  lake_id: string;
  cabin_id: string | null;
  segment_id: string | null;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
};
/** A key date on the trip itinerary, shown on the Schedule calendar. `kind`
 *  discriminates; per-kind fields are surfaced selectively in the editor.
 *  Linked to one or more participants. Mirrors ItineraryItemOut (api/schemas.py). */
export type ItineraryKind = "event" | "drive" | "hotel" | "flight";
export type ItineraryItem = {
  id: string;
  trip_id: string;
  kind: ItineraryKind;
  title: string;
  item_date: string; // "YYYY-MM-DD"
  start_time: string | null; // "HH:MM" (flight: departure)
  end_time: string | null; //   (flight: arrival)
  location: string | null; // event venue / hotel / drive start / flight origin
  end_location: string | null; // drive destination / flight destination
  description: string | null;
  confirmation_code: string | null; // flight booking ref
  sort_order: number;
  participant_ids: string[];
};

/** One person's flight segment under a flight ItineraryItem (the group
 *  milestone on the Schedule). A connecting journey is multiple legs. Creating
 *  a leg auto-adds its participant to the parent item's members (API-side). */
export type FlightLeg = {
  id: string;
  itinerary_item_id: string;
  participant_id: string;
  leg_date: string | null; // defaults to the item's date on create
  flight_number: string | null;
  origin_airport: string | null;
  departure_time: string | null;
  destination_airport: string | null;
  arrival_time: string | null;
  confirmation_code: string | null;
  car_notes: string | null;
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
export type InviteStatus = "pending" | "accepted" | "revoked";
export type Invitation = {
  id: string;
  trip_id: string;
  email: string;
  role: "organizer" | "participant";
  status: InviteStatus;
  created_at: string;
  expires_at: string;
};
/** Public view returned by GET /invitations/{token} — what an invitee sees. */
export type InvitePublic = {
  trip_id: string;
  trip_name: string;
  destination: string | null;
  inviter_name: string | null;
  email: string;
  role: "organizer" | "participant";
  status: InviteStatus;
  expired: boolean;
};
