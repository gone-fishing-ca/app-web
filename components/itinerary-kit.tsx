import { BedDouble, CalendarClock, CalendarRange, Car, Plane, type LucideIcon } from "lucide-react";
import type { ItineraryKind } from "@/lib/api";

type KindMeta = { label: string; Icon: LucideIcon; bg: string; fg: string };

/** Per-kind presentation, shared by the Add menu, the editor, and the calendar
 *  chips. Colors are muted semantic tints — distinct from the teal fly chips
 *  and the neutral segment bars. */
export const KIND_META: Record<ItineraryKind, KindMeta> = {
  drive: { label: "Drive", Icon: Car, bg: "var(--info-bg)", fg: "var(--info)" },
  event: { label: "Event", Icon: CalendarClock, bg: "var(--primary-100)", fg: "var(--primary)" },
  hotel: { label: "Hotel", Icon: BedDouble, bg: "var(--warning-bg)", fg: "var(--warning)" },
  flight: { label: "Flight", Icon: Plane, bg: "var(--success-bg)", fg: "var(--success)" },
};

/** Everything the Add menu can create: itinerary items plus "week" (a Segment,
 *  drawn as a multi-day bar at the top of the calendar, not an ItineraryItem). */
export type AddableKind = ItineraryKind | "week";

export const ADDABLE_META: Record<AddableKind, KindMeta> = {
  ...KIND_META,
  week: { label: "Week", Icon: CalendarRange, bg: "var(--surface-2)", fg: "var(--text-2)" },
};

// Order shown in the Add dropdown.
export const ADD_MENU_KINDS: AddableKind[] = ["event", "drive", "hotel", "flight", "week"];
