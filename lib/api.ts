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
export type User = { id: string; email: string; name: string | null; avatar_url: string | null };
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
  contact_id: string | null; // the address-book identity behind this roster row
  user_id: string | null; // linked auth account, or null for app-less roster rows
  name: string;
  avatar_url: string | null; // SSO profile photo of the linked account, if any
  cell: string | null;
  home_phone: string | null;
  email: string | null;
  car_group: string | null;
  // No dates here — a participant's span comes from their stays.
  // name/cell/home_phone/email live on the linked Contact; editing them here writes through.
};

/** A person in the reusable, owner-scoped address book. Linked onto trips by
 *  Participant rows; relatives (spouse/child/…) hang off `related_to_id`. */
export type Contact = {
  id: string;
  owner_id: string;
  user_id: string | null; // set when this person actually has an app account
  name: string;
  cell: string | null;
  home_phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  avatar_url: string | null;
  related_to_id: string | null;
  relationship_label: string | null; // "Spouse", "Brother", …
  // Trips (visible to the requester) this person is rostered on, newest first.
  // Filled by GET /contacts only; non-empty ⇒ a participant on some trip.
  trip_names: string[];
};

/** GET /trips/{id}/contacts — each roster member with relatives folded in. */
export type ContactGroup = {
  participant_id: string;
  contact: Contact;
  relatives: Contact[];
};

/** A reusable place/business/website (bait shop, dry-ice supplier) — an
 *  owner-scoped catalog entity like Lake, linked per-trip via TripResource. */
export type Resource = {
  id: string;
  owner_id: string;
  name: string;
  category: string | null;
  contact_person: string | null;
  phone: string | null;
  alt_phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  notes: string | null;
};

/** A resource as it appears on a trip (GET /trips/{id}/resources). `id` is the
 *  catalog resource id; `trip_resource_id` is the join row used to unlink. */
export type TripResource = Resource & {
  trip_resource_id: string;
  sort_order: number;
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
 *  lake id (what `Segment.lake_id` points at) plus `trip_lake_id` (the join row,
 *  used to unlink/reorder). The fly window is derived server-side from the trip's
 *  weeks at this lake. */
export type TripLake = {
  id: string;            // catalog lake id
  trip_lake_id: string;  // TripLake join row id
  owner_id: string;      // catalog lake owner (gates editing in the UI)
  name: string;
  outfitter: Outfitter | null;
  fly_in_date: string | null;   // derived: earliest week start at this lake
  fly_out_date: string | null;  // derived: latest week end at this lake
  sort_order: number;
  cabins: Cabin[];
};
/** A week of the trip: a named date range at a lake (null = lake TBD). The unit
 *  of attendance — participants join one or more weeks, each becoming a Stay. */
export type Segment = {
  id: string;
  trip_id: string;
  lake_id: string | null;
  name: string;
  start_date: string | null;
  end_date: string | null;
  sort_order: number;
};
/** A participant's attendance at one week: cabin + optional date overrides.
 *  `start_date`/`end_date` are the raw overrides (null = adopting the week's
 *  dates by reference); `effective_*` are the resolved dates — read those for
 *  any display. The lake comes through the segment. */
export type Stay = {
  id: string;
  participant_id: string;
  segment_id: string;
  cabin_id: string | null;
  start_date: string | null;
  end_date: string | null;
  effective_start_date: string | null;
  effective_end_date: string | null;
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

/** One person's flight segment, optionally linked to a flight ItineraryItem
 *  (the group milestone on the Schedule). A connecting journey is multiple
 *  legs. When linked, creating a leg auto-adds its participant to the parent
 *  item's members (API-side). */
export type FlightLeg = {
  id: string;
  itinerary_item_id: string | null;
  participant_id: string;
  leg_date: string | null; // defaults to the item's date on create
  flight_number: string | null;
  origin_airport: string | null;
  departure_time: string | null;
  destination_airport: string | null;
  arrival_time: string | null;
  confirmation_code: string | null;
  car_notes: string | null;
  status: string | null; // cached AeroDataBox status (Expected, Delayed, Arrived, …)
  status_checked_at: string | null; // drives the API's lazy refresh; read-only here
};

/** One scheduled flight from GET /trips/{id}/flights/lookup (AeroDataBox) —
 *  shaped like a FlightLeg so it pours straight into the editor form. The
 *  endpoint 503s when the API has no AERODATABOX_API_KEY configured. */
export type FlightLookupLeg = {
  flight_number: string | null;
  airline: string | null;
  status: string | null;
  leg_date: string | null;
  origin_airport: string | null;
  departure_time: string | null;
  destination_airport: string | null;
  arrival_time: string | null;
};

/* ---- Inventory & packing (mirrors api/src/schemas.py) ---- */
export type InventoryType = "Food" | "Beverages" | "Gear" | "Tackle" | "Misc";
export const INVENTORY_TYPES: InventoryType[] = ["Food", "Beverages", "Gear", "Tackle", "Misc"];
export type QtyBasis = "per_person" | "per_person_peak" | "per_cabin" | "per_boat" | "per_group";
export type QtyPeriod = "per_trip" | "per_day";
export type Responsibility = "shared" | "personal" | "personal_stored";
export type PackLineStatus = "planned" | "purchased" | "packed";
export type PackSource = "self" | "stored";

/** Where inventory lives between trips ("Greg's House"). Owner-scoped catalog;
 *  the responsible contact is the default "packed by" when a stored item is
 *  added to a trip's list (resolved to a roster row client-side at add time). */
export type StorageLocation = {
  id: string;
  owner_id: string;
  name: string;
  responsible_contact_id: string | null;
  notes: string | null;
  archived: boolean;
};

/** A master-inventory item — the reusable, owner-scoped catalog grown across
 *  years of trips. `item_type` is the fixed top level; category/subcategory are
 *  free text. The qty fields are a *hint* used to suggest amounts from trip
 *  facts (people × cabins × days), not a quantity. */
export type InventoryItem = {
  id: string;
  owner_id: string;
  name: string;
  item_type: InventoryType;
  category: string | null;
  subcategory: string | null;
  default_unit: string | null; // null = a count
  default_qty: number | null;
  qty_basis: QtyBasis;
  qty_period: QtyPeriod;
  is_spare: boolean; // a backup item, not part of the working set — badged, sorted last
  collect_prefs: boolean; // quantity comes from member prefs, not the hint
  default_responsibility: Responsibility;
  storage_location_id: string | null;
  storage_location: StorageLocation | null; // embedded for display + packer defaulting
  notes: string | null;
  archived: boolean;
};

/** One participant's slice of a pack line. `source` overrides where their copy
 *  comes from on personal lines (null = inherit from the line's responsibility);
 *  `pref_qty` is their pre-trip answer on prefs lines (null = hasn't answered,
 *  0 = none for me). */
export type PackPerson = {
  id: string;
  pack_item_id: string;
  participant_id: string;
  source: PackSource | null;
  pref_qty: number | null;
  packed: boolean;
};

/** A packing container — numbered, optionally tied to a cabin. Trip-scoped. */
export type Box = {
  id: string;
  trip_id: string;
  label: string;
  cabin_id: string | null;
  notes: string | null;
  sort_order: number;
};

/** Who has a unit for one week (the dry-bag handoff: same unit, a different
 *  person each week). Cabin derives through that person's stay. */
export type PackUnitAssignment = {
  id: string;
  unit_id: string;
  segment_id: string;
  participant_id: string;
};

/** One distinguishable *portion* of an itemized line — a labeled physical unit
 *  ("Blue", quantity null = 1) or a split ("12 of the 24 AA batteries",
 *  quantity 12, owned by a cabin). When a line has units, its effective
 *  quantity is the sum of unit quantities (null counts as 1). */
export type PackUnit = {
  id: string;
  pack_item_id: string;
  label: string | null;
  quantity: number | null; // null = one physical unit
  cabin_id: string | null; // cabin this portion belongs to (null = not cabin-owned)
  box_id: string | null;
  notes: string | null;
  sort_order: number;
  assignments: PackUnitAssignment[];
};

/** An inventory item on this trip's packing list (GET /trips/{id}/pack), with
 *  trip-specific quantity/responsibility/progress layered on. `segment_id`
 *  scopes a line to one week (null = whole trip). `box_id` boxes an
 *  un-itemized line; itemized lines box per unit.
 *
 *  `unit`/`responsibility` are the raw overrides — null means "inherit from
 *  the master item" (cf. Stay dates). Display the `effective_*` fields. */
export type PackLine = {
  id: string;
  trip_id: string;
  inventory_item_id: string;
  quantity: number | null;
  unit: string | null;
  responsibility: Responsibility | null;
  effective_unit: string | null;
  effective_responsibility: Responsibility;
  // Who *packs* it ("Packed by") vs who it *belongs to* on the trip: a person
  // or a cabin, at most one — both null = the group's.
  assignee_participant_id: string | null;
  owner_participant_id: string | null;
  owner_cabin_id: string | null;
  segment_id: string | null;
  status: PackLineStatus;
  notes: string | null;
  box_id: string | null;
  sort_order: number;
  item: InventoryItem;
  people: PackPerson[];
  units: PackUnit[];
};

export type PackCopyResult = { copied: number; skipped: number };
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
