import { deriveSpan } from "./format";
import type { Participant, Stay, TripLake } from "./api";

/* ------------------------------------------------------------------ *
 * Timezone-safe date helpers.
 * ISO dates ("YYYY-MM-DD") are interpreted as LOCAL dates (at noon, to
 * dodge DST edges) — never via `new Date("YYYY-MM-DD")` (which is UTC)
 * or `toISOString()` (which can roll a day backwards). Mirrors the
 * `T12:00:00` trick in lib/format.ts.
 * ------------------------------------------------------------------ */

/** Parse "YYYY-MM-DD" as a local Date (noon). */
export function parseISO(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}

/** Format a Date as a local "YYYY-MM-DD" key (not UTC). */
export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export type Day = {
  iso: string;
  dayNum: number; // 1..31
  isFirstOfMonth: boolean;
  monthLabel: string; // "Aug" — only meaningful on the 1st / grid start
  inSpan: boolean; // within the authoritative trip span (controls muting)
};

/**
 * The schedule's date range. `spanStart`/`spanEnd` are the authoritative trip
 * dates (stays first, falling back to trip-lake fly windows — mirrors the API's
 * `_trip_span`). `gridStart`/`gridEnd` widen that to include any stray fly date
 * so every marker is visible on the calendar. All null when nothing has dates.
 */
export function scheduleRange(
  stays: Stay[],
  tripLakes: TripLake[],
): { spanStart: string | null; spanEnd: string | null; gridStart: string | null; gridEnd: string | null } {
  let [spanStart, spanEnd] = deriveSpan(stays);
  if (!spanStart && !spanEnd) {
    [spanStart, spanEnd] = deriveSpan(
      tripLakes.map((tl) => ({ start_date: tl.fly_in_date, end_date: tl.fly_out_date })),
    );
  }
  let gridStart = spanStart;
  let gridEnd = spanEnd;
  const all = [
    ...stays.flatMap((s) => [s.start_date, s.end_date]),
    ...tripLakes.flatMap((tl) => [tl.fly_in_date, tl.fly_out_date]),
  ].filter((d): d is string => Boolean(d));
  for (const d of all) {
    if (gridStart === null || d < gridStart) gridStart = d;
    if (gridEnd === null || d > gridEnd) gridEnd = d;
  }
  return { spanStart, spanEnd, gridStart, gridEnd };
}

/** Build a Sun–Sat week grid covering [gridStart, gridEnd] inclusive. */
export function buildWeeks(
  gridStartISO: string,
  gridEndISO: string,
  spanStartISO: string | null,
  spanEndISO: string | null,
): Day[][] {
  // Sunday on/before grid start; Saturday on/after grid end. getDay(): 0=Sun.
  const cursor = parseISO(gridStartISO);
  cursor.setDate(cursor.getDate() - cursor.getDay());
  const last = parseISO(gridEndISO);
  last.setDate(last.getDate() + (6 - last.getDay()));

  const weeks: Day[][] = [];
  while (cursor <= last) {
    const week: Day[] = [];
    for (let i = 0; i < 7; i++) {
      const iso = toISO(cursor);
      week.push({
        iso,
        dayNum: cursor.getDate(),
        isFirstOfMonth: cursor.getDate() === 1,
        monthLabel: cursor.toLocaleDateString(undefined, { month: "short" }),
        inSpan: (!spanStartISO || iso >= spanStartISO) && (!spanEndISO || iso <= spanEndISO),
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

/* ------------------------------------------------------------------ *
 * Fly in / fly out aggregation.
 * ------------------------------------------------------------------ */

export type Member = { participantId: string; name: string; lakeName: string };

export type DayFly = {
  in: Member[]; // people whose stay starts this day (clickable)
  out: Member[]; // people whose stay ends this day (clickable)
  inTripLakes: string[]; // trip-lake fly-in this day (trip-level fallback, not clickable)
  outTripLakes: string[];
};

/** Group stay starts/ends and trip-lake fly windows by ISO day. */
export function aggregateFlyEvents(opts: {
  stays: Stay[];
  participants: Participant[];
  tripLakes: TripLake[];
}): Map<string, DayFly> {
  const { stays, participants, tripLakes } = opts;
  const pName = new Map(participants.map((p) => [p.id, p.name]));
  const lName = new Map(tripLakes.map((l) => [l.id, l.name]));
  const map = new Map<string, DayFly>();
  const get = (iso: string): DayFly => {
    let d = map.get(iso);
    if (!d) {
      d = { in: [], out: [], inTripLakes: [], outTripLakes: [] };
      map.set(iso, d);
    }
    return d;
  };

  for (const s of stays) {
    const member: Member = {
      participantId: s.participant_id,
      name: pName.get(s.participant_id) ?? "Unknown",
      lakeName: lName.get(s.lake_id) ?? "",
    };
    if (s.start_date) get(s.start_date).in.push(member);
    if (s.end_date) get(s.end_date).out.push(member);
  }
  for (const tl of tripLakes) {
    if (tl.fly_in_date) get(tl.fly_in_date).inTripLakes.push(tl.name);
    if (tl.fly_out_date) get(tl.fly_out_date).outTripLakes.push(tl.name);
  }
  return map;
}
