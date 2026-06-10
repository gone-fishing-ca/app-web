import { BedDouble, CalendarClock, Car, Plane, type LucideIcon } from "lucide-react";
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

// Order shown in the Add dropdown. Weeks aren't addable here — they're created
// with the trip; the calendar's segment bars still open the edit modal.
export const ADD_MENU_KINDS: ItineraryKind[] = ["event", "drive", "hotel", "flight"];
