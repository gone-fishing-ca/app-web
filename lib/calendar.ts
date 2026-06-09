import { deriveSpan } from "./format";
import type { ItineraryItem, ItineraryKind, Participant, Stay, TripLake } from "./api";

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
  extraDates: string[] = [],
): { spanStart: string | null; spanEnd: string | null; gridStart: string | null; gridEnd: string | null } {
  let [spanStart, spanEnd] = deriveSpan(stays);
  if (!spanStart && !spanEnd) {
    [spanStart, spanEnd] = deriveSpan(
      tripLakes.map((tl) => ({ start_date: tl.fly_in_date, end_date: tl.fly_out_date })),
    );
  }
  let gridStart = spanStart;
  let gridEnd = spanEnd;
  // Widen the grid to show every marker — stay/fly dates plus any itinerary
  // items (e.g. pre-trip travel days that fall before the fishing window).
  const all = [
    ...stays.flatMap((s) => [s.start_date, s.end_date]),
    ...tripLakes.flatMap((tl) => [tl.fly_in_date, tl.fly_out_date]),
    ...extraDates,
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

/* ------------------------------------------------------------------ *
 * Segment ("week") bars — multi-day events drawn across the calendar.
 * ------------------------------------------------------------------ */

export type CalSegment = { id: string; name: string; start: string; end: string };

export type SegmentBar = {
  seg: CalSegment;
  lane: number;
  splitStart: boolean; // another segment ends on this one's start day → start at the day's right half
  splitEnd: boolean; // another segment starts on this one's end day → end at the day's left half
};

/**
 * Assign each dated segment to a lane via greedy interval packing, treating a
 * shared endpoint (one ends the day the next begins) as non-overlapping so
 * sequential weeks ride the same lane. Flag the shared days so the calendar can
 * split that day in half rather than stack the two bars.
 */
export function packSegments(segments: CalSegment[]): { bars: SegmentBar[]; laneCount: number } {
  const segs = segments
    .filter((s) => s.start && s.end)
    .slice()
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.end < b.end ? -1 : a.end > b.end ? 1 : 0));

  const startDays = new Set(segs.map((s) => s.start));
  const endDays = new Set(segs.map((s) => s.end));

  const laneEnds: string[] = []; // last end date placed on each lane
  const bars: SegmentBar[] = [];
  for (const seg of segs) {
    // Reuse the first lane whose last segment ends on/before this one starts —
    // touching endpoints are allowed to share a lane (they split the shared day).
    let lane = laneEnds.findIndex((end) => end <= seg.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(seg.end);
    } else {
      laneEnds[lane] = seg.end;
    }
    bars.push({
      seg,
      lane,
      splitStart: endDays.has(seg.start),
      splitEnd: startDays.has(seg.end),
    });
  }
  return { bars, laneCount: laneEnds.length };
}

export type PlacedBar = {
  id: string;
  name: string;
  lane: number;
  leftPct: number;
  widthPct: number;
  roundLeft: boolean; // the segment's real start falls in this week
  roundRight: boolean; // the segment's real end falls in this week
};

/* ------------------------------------------------------------------ *
 * Itinerary items (event / drive / hotel / flight) keyed by day.
 * ------------------------------------------------------------------ */

// Display order within a day: drives first, then events, hotels, flights.
const KIND_ORDER: Record<ItineraryKind, number> = { drive: 0, event: 1, hotel: 2, flight: 3 };

/** Group itinerary items by their day, each day's list sorted by kind, then
 *  start time, then sort_order. Hotels are single-day (item_date = check-in),
 *  so they naturally show only on that day. */
export function aggregateItinerary(items: ItineraryItem[]): Map<string, ItineraryItem[]> {
  const map = new Map<string, ItineraryItem[]>();
  for (const it of items) {
    const list = map.get(it.item_date);
    if (list) list.push(it);
    else map.set(it.item_date, [it]);
  }
  for (const list of map.values()) {
    list.sort(
      (a, b) =>
        KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
        (a.start_time ?? "").localeCompare(b.start_time ?? "") ||
        a.sort_order - b.sort_order,
    );
  }
  return map;
}

/** Geometry (percent of week width) for the bars intersecting one Sun–Sat week. */
export function placeSegments(bars: SegmentBar[], weekIsos: string[]): PlacedBar[] {
  const wStart = weekIsos[0];
  const wEnd = weekIsos[6];
  const out: PlacedBar[] = [];
  for (const bar of bars) {
    const { start, end } = bar.seg;
    if (end < wStart || start > wEnd) continue;
    const clipStart = start < wStart ? wStart : start;
    const clipEnd = end > wEnd ? wEnd : end;
    const startIdx = weekIsos.indexOf(clipStart);
    const endIdx = weekIsos.indexOf(clipEnd);
    if (startIdx === -1 || endIdx === -1) continue;
    const realStart = clipStart === start;
    const realEnd = clipEnd === end;
    const left = ((startIdx + (realStart && bar.splitStart ? 0.5 : 0)) / 7) * 100;
    const right = ((endIdx + 1 - (realEnd && bar.splitEnd ? 0.5 : 0)) / 7) * 100;
    out.push({
      id: bar.seg.id,
      name: bar.seg.name,
      lane: bar.lane,
      leftPct: left,
      widthPct: right - left,
      roundLeft: realStart,
      roundRight: realEnd,
    });
  }
  return out;
}
