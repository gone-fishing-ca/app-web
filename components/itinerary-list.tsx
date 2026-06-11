"use client";

import { Avatar, Card, initialsOf } from "@/components/ui";
import { KIND_META } from "@/components/itinerary-kit";
import { parseISO } from "@/lib/calendar";
import type { ItineraryItem, Participant } from "@/lib/api";

/** Day-by-day list of itinerary items — the linear companion to the Schedule
 *  calendar. Each day gets a date rail on the left and its items (already
 *  sorted by aggregateItinerary) as rows; clicking a row opens the same edit
 *  modal the calendar chips do. */
export function ItineraryList({
  days,
  participants,
  onPickItem,
}: {
  days: [string, ItineraryItem[]][]; // [iso, items] sorted by day
  participants: Participant[];
  onPickItem: (item: ItineraryItem) => void;
}) {
  return (
    <Card pad={0} className="overflow-hidden">
      {days.map(([iso, items], di) => {
        const d = parseISO(iso);
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

function ItemRow({ item, people, onClick }: { item: ItineraryItem; people: Participant[]; onClick: () => void }) {
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

function AvatarStack({ people }: { people: Participant[] }) {
  return (
    <span className="flex flex-none flex-wrap items-center gap-1">
      {people.map((p) => (
        <span key={p.id} title={p.name}>
          <Avatar initials={initialsOf(p.name, p.email)} src={p.avatar_url} size={24} />
        </span>
      ))}
    </span>
  );
}

/** Roster rows for the item's participant_ids, in roster order so the same
 *  crew always stacks the same way across rows. */
function involved(ids: string[], participants: Participant[]): Participant[] {
  const going = new Set(ids);
  return participants.filter((p) => going.has(p.id));
}
