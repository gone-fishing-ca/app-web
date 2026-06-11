import type { InventoryItem, PackLine, PackPerson, Segment, Stay } from "./api";

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
 *  the hint or the facts aren't there yet. */
export function suggestQty(item: InventoryItem, facts: TripFacts): number | null {
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

/** "0.25 loaves / person / day · +1 spare" — how the hint reads in the UI. */
export function hintLabel(item: InventoryItem): string | null {
  const spare = item.default_spare_qty ? `+${fmtQty(item.default_spare_qty)} spare` : null;
  if (item.default_qty == null) return spare;
  const basis = {
    per_person: "person",
    per_person_peak: "person (peak week)",
    per_cabin: "cabin",
    per_boat: "boat",
    per_group: "group",
  }[item.qty_basis];
  const unit = item.default_unit ? ` ${item.default_unit}` : "";
  const per = item.qty_period === "per_day" ? ` / ${basis} / day` : ` / ${basis}`;
  return `${fmtQty(item.default_qty)}${unit}${per}${spare ? ` · ${spare}` : ""}`;
}

/** Spares for this trip: the confirmed count, else the master's hint. */
export function effectiveSpares(line: PackLine): number {
  return line.spare_quantity ?? line.item.default_spare_qty ?? 0;
}

export function fmtQty(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, "");
}

/** Where one participant's copy of a personal line comes from: their override
 *  row when set, else the line's responsibility. */
export function effectiveSource(line: PackLine, participantId: string): "self" | "stored" {
  const row = line.people.find((p) => p.participant_id === participantId);
  if (row?.source) return row.source;
  return line.effective_responsibility === "personal_stored" ? "stored" : "self";
}

export function personRow(line: PackLine, participantId: string): PackPerson | null {
  return line.people.find((p) => p.participant_id === participantId) ?? null;
}
