"use client";

import { PlaneLanding, PlaneTakeoff } from "lucide-react";
import { Avatar, Card, initialsOf } from "@/components/ui";
import { KIND_META } from "@/components/itinerary-kit";
import { parseISO, type DayFly, type Member } from "@/lib/calendar";
import type { ItineraryItem, Participant } from "@/lib/api";

/** Day-by-day list of the schedule — the linear companion to the calendar.
 *  Each day gets a date rail on the left and its rows: fly in/out first (the
 *  float-plane manifest — mirrors the calendar cells), then itinerary items
 *  (already sorted by aggregateItinerary). Clicking an item row opens the same
 *  edit modal the calendar chips do; clicking a fly row opens the day detail. */
export function ItineraryList({
  days,
  dayItems,
  dayFly,
  participants,
  onPickItem,
  onPickDay,
}: {
  days: string[]; // sorted ISO days — the union of item days and fly days
  dayItems: Map<string, ItineraryItem[]>;
  dayFly: Map<string, DayFly>;
  participants: Participant[];
  onPickItem: (item: ItineraryItem) => void;
  onPickDay: (iso: string) => void;
}) {
  return (
    <Card pad={0} className="overflow-hidden">
      {days.map((iso, di) => {
        const d = parseISO(iso);
        const items = dayItems.get(iso) ?? [];
        const fly = dayFly.get(iso);
        const showIn = !!fly && (fly.in.length > 0 || fly.inTripLakes.length > 0);
        const showOut = !!fly && (fly.out.length > 0 || fly.outTripLakes.length > 0);
        // Same rule as the calendar's FlyChip: the day detail only opens when
        // someone is actually on the manifest (not a bare trip-lake window).
        const flyClickable = !!fly && (fly.in.length > 0 || fly.out.length > 0);
        return (
          <div
            key={iso}
            className="flex"
            style={{ borderTop: di ? "1px solid var(--border)" : undefined }}
          >
            <div
              className="w-[64px] sm:w-[76px] flex-none px-2 py-3 text-center"
              style={{ borderRight: "1px solid var(--border)" }}
            >
              <div
                className="text-[10.5px] font-bold uppercase"
                style={{ letterSpacing: ".08em", color: "var(--text-3)" }}
              >
                {d.toLocaleDateString(undefined, { weekday: "short" })}
              </div>
              <div className="gf-mono text-[21px] font-semibold leading-tight" style={{ color: "var(--text)" }}>
                {d.getDate()}
              </div>
              <div className="text-[11px]" style={{ color: "var(--text-3)" }}>
                {d.toLocaleDateString(undefined, { month: "short" })}
              </div>
            </div>
            <div className="min-w-0 flex-1 flex flex-col justify-center gap-0.5 p-1.5 sm:p-2">
              {showIn && (
                <FlyRow kind="in" members={fly!.in} tripLakes={fly!.inTripLakes} clickable={flyClickable} onClick={() => onPickDay(iso)} />
              )}
              {showOut && (
                <FlyRow kind="out" members={fly!.out} tripLakes={fly!.outTripLakes} clickable={flyClickable} onClick={() => onPickDay(iso)} />
              )}
              {items.map((it) => (
                <ItemRow
                  key={it.id}
                  item={it}
                  people={involved(it.participant_ids, participants)}
                  onClick={() => onPickItem(it)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </Card>
  );
}

function ItemRow({ item, people, onClick }: { item: ItineraryItem; people: StackPerson[]; onClick: () => void }) {
  const m = KIND_META[item.kind];
  const sub = [item.location, item.end_location].filter(Boolean).join(" → ");
  const time = item.start_time ? item.start_time + (item.end_time ? ` – ${item.end_time}` : "") : "";
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-left sm:px-2.5"
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <span
        className="grid flex-none place-items-center rounded-[8px]"
        style={{ width: 26, height: 26, background: m.bg, color: m.fg }}
      >
        <m.Icon size={14} strokeWidth={2.2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold" style={{ color: "var(--text)" }}>
          {item.title}
        </span>
        {sub && (
          <span className="block truncate text-[12.5px]" style={{ color: "var(--text-3)" }}>
            {sub}
          </span>
        )}
        {/* Phones: the avatars wrap under the details — no room on the right. */}
        {people.length > 0 && (
          <span className="mt-1.5 flex sm:hidden">
            <AvatarStack people={people} />
          </span>
        )}
      </span>
      {time && (
        <span className="gf-mono flex-none text-[12px]" style={{ color: "var(--text-2)" }}>
          {time}
        </span>
      )}
      {people.length > 0 && (
        <span className="hidden sm:flex">
          <AvatarStack people={people} />
        </span>
      )}
    </button>
  );
}

/** A fly in/out row — the list twin of the calendar's FlyChip, with the
 *  manifest as avatars. Trip-lake fallback days (no stays yet) render muted
 *  and inert, like the dashed calendar chip. */
function FlyRow({
  kind,
  members,
  tripLakes,
  clickable,
  onClick,
}: {
  kind: "in" | "out";
  members: Member[];
  tripLakes: string[];
  clickable: boolean;
  onClick: () => void;
}) {
  const Icon = kind === "in" ? PlaneLanding : PlaneTakeoff;
  const lakes = Array.from(new Set([...members.map((m) => m.lakeName).filter(Boolean), ...tripLakes]));
  const people = members.map((m) => ({ id: m.participantId, name: m.name, src: m.avatarUrl }));
  const iconStyle = clickable
    ? { background: "var(--accent-100)", color: "var(--accent-600)" }
    : { background: "var(--surface-2)", color: "var(--text-3)", border: "1px dashed var(--border-strong)" };
  return (
    <button
      type="button"
      onClick={clickable ? onClick : undefined}
      disabled={!clickable}
      className="flex w-full items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-left sm:px-2.5"
      onMouseEnter={clickable ? (e) => (e.currentTarget.style.background = "var(--surface-2)") : undefined}
      onMouseLeave={clickable ? (e) => (e.currentTarget.style.background = "transparent") : undefined}
    >
      <span
        className="grid flex-none place-items-center rounded-[8px]"
        style={{ width: 26, height: 26, ...iconStyle }}
      >
        <Icon size={14} strokeWidth={2.2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-semibold" style={{ color: "var(--text)" }}>
          {kind === "in" ? "Fly in" : "Fly out"}
        </span>
        {lakes.length > 0 && (
          <span className="block truncate text-[12.5px]" style={{ color: "var(--text-3)" }}>
            {lakes.join(", ")}
          </span>
        )}
        {people.length > 0 && (
          <span className="mt-1.5 flex sm:hidden">
            <AvatarStack people={people} />
          </span>
        )}
      </span>
      {people.length > 0 && (
        <span className="hidden sm:flex">
          <AvatarStack people={people} />
        </span>
      )}
    </button>
  );
}

type StackPerson = { id: string; name: string; src: string | null; email?: string | null };

function AvatarStack({ people }: { people: StackPerson[] }) {
  return (
    <span className="flex flex-none flex-wrap items-center gap-1">
      {people.map((p) => (
        <span key={p.id} title={p.name}>
          <Avatar initials={initialsOf(p.name, p.email)} src={p.src} size={24} />
        </span>
      ))}
    </span>
  );
}

/** Roster rows for the item's participant_ids, in roster order so the same
 *  crew always stacks the same way across rows. */
function involved(ids: string[], participants: Participant[]): StackPerson[] {
  const going = new Set(ids);
  return participants
    .filter((p) => going.has(p.id))
    .map((p) => ({ id: p.id, name: p.name, src: p.avatar_url, email: p.email }));
}
