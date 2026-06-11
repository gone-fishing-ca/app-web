import type { InventoryItem, PackLine, PackPerson, PackUnit, Segment, Source, Stay } from "./api";

/** The trip facts a quantity hint scales by. Derived client-side from data the
 *  packing pages already fetch — nothing is stored. A "boat" is just 2 people. */
export type TripFacts = {
  people: number; // roster size (or attendees of the scoped week)
  peakPeople: number; // largest week's attendance — pooled gear handed off at the swap
  cabins: number; // distinct cabins in use
  boats: number; // ceil(people / 2), max across weeks
  days: number; // total trip days (or the scoped week's)
  personDays: number; // Σ per week (attendees × days) — drives per-person/per-day
};

function daysOf(seg: Segment): number {
  if (!seg.start_date || !seg.end_date) return 0;
  const ms = new Date(seg.end_date).getTime() - new Date(seg.start_date).getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

/** Facts for the whole trip, or for one week when `segmentId` is set. */
export function tripFacts(
  rosterSize: number,
  segments: Segment[],
  stays: Stay[],
  segmentId?: string | null,
): TripFacts {
  const segs = segmentId ? segments.filter((s) => s.id === segmentId) : segments;
  const segIds = new Set(segs.map((s) => s.id));
  const scoped = stays.filter((s) => segIds.has(s.segment_id));

  const people = segmentId
    ? new Set(scoped.map((s) => s.participant_id)).size
    : rosterSize;
  const cabins = new Set(scoped.map((s) => s.cabin_id).filter(Boolean)).size;
  let boats = 0;
  let peakPeople = 0;
  let personDays = 0;
  let days = 0;
  for (const seg of segs) {
    const att = stays.filter((s) => s.segment_id === seg.id).length;
    peakPeople = Math.max(peakPeople, att);
    boats = Math.max(boats, Math.ceil(att / 2));
    personDays += att * daysOf(seg);
    days += daysOf(seg);
  }
  if (boats === 0) boats = Math.ceil(people / 2);
  if (peakPeople === 0) peakPeople = people;
  if (personDays === 0) personDays = people * days;
  return { people, peakPeople, cabins: cabins || 1, boats: boats || 1, days, personDays };
}

/** Suggested quantity for an item from its hint × the trip facts, or null when
 *  the hint or the facts aren't there yet. Prefs items don't use the hint —
 *  their suggestion is the sum of member answers (see `prefsTotal`). */
export function suggestQty(item: InventoryItem, facts: TripFacts): number | null {
  if (item.collect_prefs) return null;
  if (item.default_qty == null) return null;
  const q = item.default_qty;
  if (item.qty_period === "per_day") {
    if (facts.days === 0) return null;
    switch (item.qty_basis) {
      case "per_person": return round1(q * facts.personDays);
      case "per_person_peak": return round1(q * facts.peakPeople * facts.days);
      case "per_cabin": return round1(q * facts.cabins * facts.days);
      case "per_boat": return round1(q * facts.boats * facts.days);
      case "per_group": return round1(q * facts.days);
    }
  }
  switch (item.qty_basis) {
    case "per_person": return round1(q * facts.people);
    case "per_person_peak": return round1(q * facts.peakPeople);
    case "per_cabin": return round1(q * facts.cabins);
    case "per_boat": return round1(q * facts.boats);
    case "per_group": return round1(q);
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** "0.25 loaves / person / day" — how the hint reads in the UI. */
export function hintLabel(item: InventoryItem): string | null {
  if (item.collect_prefs) return "Prefs — members choose amounts";
  if (item.default_qty == null) return null;
  const basis = {
    per_person: "person",
    per_person_peak: "person (peak week)",
    per_cabin: "cabin",
    per_boat: "boat",
    per_group: "group",
  }[item.qty_basis];
  const unit = item.default_unit ? ` ${item.default_unit}` : "";
  const per = item.qty_period === "per_day" ? ` / ${basis} / day` : ` / ${basis}`;
  return `${fmtQty(item.default_qty)}${unit}${per}`;
}

export function fmtQty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, "");
}

/** An itemized line's effective quantity: the sum of unit quantities, where a
 *  unit with no quantity is one physical thing (dry bag) and a unit with one is
 *  a split portion (12 of the 24 batteries). */
export function unitsTotal(units: PackUnit[]): number {
  return units.reduce((sum, u) => sum + (u.quantity ?? 1), 0);
}

/** A prefs line's suggested quantity: the sum of member answers so far. */
export function prefsTotal(line: PackLine): number {
  return line.people.reduce((sum, p) => sum + (p.pref_qty ?? 0), 0);
}

/** How many people have answered a prefs line (0 counts as an answer). */
export function prefsAnswered(line: PackLine): number {
  return line.people.filter((p) => p.pref_qty != null).length;
}

/** "At Greg's House" / "Bought by Dave" / "Flown in by Mattice Lake". */
export function sourceLabel(s: Source | null | undefined): string | null {
  if (!s) return null;
  switch (s.kind) {
    case "storage": return `At ${s.name}`;
    case "buyer": return `Bought by ${s.name}`;
    case "outfitter": return `Flown in by ${s.name}`;
    default: return s.name;
  }
}

/** Where one participant's copy of a personal line comes from: their override
 *  row when set, else stored when the item comes from a storage-kind source. */
export function effectiveSource(line: PackLine, participantId: string): "self" | "stored" {
  const row = line.people.find((p) => p.participant_id === participantId);
  if (row?.source) return row.source;
  return line.item.source?.kind === "storage" ? "stored" : "self";
}

export function personRow(line: PackLine, participantId: string): PackPerson | null {
  return line.people.find((p) => p.participant_id === participantId) ?? null;
}
