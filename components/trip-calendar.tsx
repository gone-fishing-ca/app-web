"use client";

import { Plane, PlaneLanding, PlaneTakeoff, X } from "lucide-react";
import { Avatar, Card, initialsOf } from "@/components/ui";
import { KIND_META } from "@/components/itinerary-kit";
import { placeSegments, parseISO, type Day, type DayFly, type Member, type SegmentBar } from "@/lib/calendar";
import type { ItineraryItem } from "@/lib/api";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Vertical metrics (px) for the per-week segment band drawn above the day cells.
const DAY_NUM_H = 22; // day-number row at the top of each cell
const LANE_H = 18; // a single segment bar
const LANE_GAP = 3; // gap between stacked lanes

/* ---- Calendar grid ------------------------------------------------------- */

export function TripCalendar({
  weeks,
  dayFly,
  dayItems,
  segmentBars,
  laneCount,
  onPickDay,
  onPickItem,
  onPickSegment,
}: {
  weeks: Day[][];
  dayFly: Map<string, DayFly>;
  dayItems: Map<string, ItineraryItem[]>;
  segmentBars: SegmentBar[];
  laneCount: number;
  onPickDay: (iso: string) => void;
  onPickItem: (item: ItineraryItem) => void;
  onPickSegment: (id: string) => void;
}) {
  const bandH = laneCount > 0 ? laneCount * LANE_H + (laneCount - 1) * LANE_GAP : 0;
  const reserveTop = DAY_NUM_H + (bandH > 0 ? bandH + 6 : 0);
  const cellMinH = Math.max(108, reserveTop + 44);

  return (
    <Card pad={0} className="overflow-hidden">
      <div
        className="grid"
        style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))", borderBottom: "1px solid var(--border)" }}
      >
        {WEEKDAYS.map((w) => (
          <div
            key={w}
            className="px-3 py-2.5 text-[11.5px] font-bold uppercase"
            style={{ letterSpacing: ".05em", color: "var(--text-3)" }}
          >
            {w}
          </div>
        ))}
      </div>
      {weeks.map((week, wi) => {
        const placed = bandH > 0 ? placeSegments(segmentBars, week.map((d) => d.iso)) : [];
        return (
          <div key={week[0].iso} className="relative">
            <div className="grid" style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
              {week.map((day, ci) => (
                <DayCell
                  key={day.iso}
                  day={day}
                  fly={dayFly.get(day.iso)}
                  items={dayItems.get(day.iso)}
                  topBorder={wi > 0}
                  leftBorder={ci > 0}
                  reserveTop={reserveTop}
                  minH={cellMinH}
                  onPick={onPickDay}
                  onPickItem={onPickItem}
                />
              ))}
            </div>
            {placed.length > 0 && (
              <div className="pointer-events-none absolute left-0 right-0" style={{ top: DAY_NUM_H }}>
                {placed.map((p) => (
                  <SegmentChip key={p.id} bar={p} onClick={() => onPickSegment(p.id)} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </Card>
  );
}

function SegmentChip({ bar, onClick }: { bar: ReturnType<typeof placeSegments>[number]; onClick: () => void }) {
  const padL = bar.roundLeft ? 2 : 0;
  const padR = bar.roundRight ? 2 : 0;
  return (
    <button
      type="button"
      onClick={onClick}
      title={bar.name}
      className="pointer-events-auto absolute flex items-center overflow-hidden text-left text-[10.5px] font-semibold transition hover:brightness-95"
      style={{
        top: bar.lane * (LANE_H + LANE_GAP),
        height: LANE_H,
        left: `calc(${bar.leftPct}% + ${padL}px)`,
        width: `calc(${bar.widthPct}% - ${padL + padR}px)`,
        paddingInline: 6,
        background: "var(--surface-2)",
        border: "1px solid var(--border-strong)",
        color: "var(--text-2)",
        borderTopLeftRadius: bar.roundLeft ? 6 : 0,
        borderBottomLeftRadius: bar.roundLeft ? 6 : 0,
        borderTopRightRadius: bar.roundRight ? 6 : 0,
        borderBottomRightRadius: bar.roundRight ? 6 : 0,
      }}
    >
      {/* Label only on the week where the segment actually starts, so it isn't
          repeated on continuation weeks. */}
      <span className="truncate">{bar.roundLeft ? bar.name : ""}</span>
    </button>
  );
}

function DayCell({
  day,
  fly,
  items,
  topBorder,
  leftBorder,
  reserveTop,
  minH,
  onPick,
  onPickItem,
}: {
  day: Day;
  fly?: DayFly;
  items?: ItineraryItem[];
  topBorder: boolean;
  leftBorder: boolean;
  reserveTop: number;
  minH: number;
  onPick: (iso: string) => void;
  onPickItem: (item: ItineraryItem) => void;
}) {
  const hasIn = !!fly && fly.in.length > 0;
  const hasOut = !!fly && fly.out.length > 0;
  const tripIn = !!fly && fly.inTripLakes.length > 0;
  const tripOut = !!fly && fly.outTripLakes.length > 0;
  const showIn = hasIn || tripIn;
  const showOut = hasOut || tripOut;
  // A fly-in and fly-out on the same day is one plane event — the outbound
  // group rides out on the plane that brought the inbound group. Merge them.
  const kind = showIn && showOut ? "both" : showIn ? "in" : showOut ? "out" : null;
  const clickable = hasIn || hasOut;
  const count = (hasIn ? fly!.in.length : 0) + (hasOut ? fly!.out.length : 0);

  return (
    <div
      className="flex flex-col px-1.5 pb-2"
      style={{
        minHeight: minH,
        borderTop: topBorder ? "1px solid var(--border)" : undefined,
        borderLeft: leftBorder ? "1px solid var(--border)" : undefined,
        background: day.inSpan ? "var(--surface)" : "var(--surface-2)",
      }}
    >
      <div
        className="flex items-center px-1 text-[12px] font-semibold"
        style={{ height: DAY_NUM_H, color: day.inSpan ? "var(--text-2)" : "var(--text-3)" }}
      >
        {day.isFirstOfMonth ? `${day.monthLabel} ${day.dayNum}` : day.dayNum}
      </div>

      {/* Spacer reserving room for the segment band overlaid above. */}
      {reserveTop > DAY_NUM_H && <div aria-hidden style={{ height: reserveTop - DAY_NUM_H }} />}

      <div className="flex flex-col gap-1">
        {/* Fly in/out leads the day — you leave the lake before anything else happens. */}
        {kind && <FlyChip kind={kind} count={count} clickable={clickable} onClick={() => onPick(day.iso)} />}
        {items?.map((it) => (
          <ItemChip key={it.id} item={it} onClick={() => onPickItem(it)} />
        ))}
      </div>
    </div>
  );
}

function ItemChip({ item, onClick }: { item: ItineraryItem; onClick: () => void }) {
  const m = KIND_META[item.kind];
  return (
    <button
      onClick={onClick}
      title={item.title}
      className="flex w-full items-center gap-1 rounded-[7px] px-1.5 py-1 text-left text-[11px] font-semibold transition hover:brightness-95"
      style={{ background: m.bg, color: m.fg, border: "1px solid transparent" }}
    >
      <m.Icon size={12} strokeWidth={2.2} className="flex-none" />
      <span className="truncate">{item.title}</span>
    </button>
  );
}

function FlyChip({
  kind,
  count,
  clickable,
  onClick,
}: {
  kind: "in" | "out" | "both";
  count: number;
  clickable: boolean;
  onClick: () => void;
}) {
  const Icon = kind === "in" ? PlaneLanding : kind === "out" ? PlaneTakeoff : Plane;
  const label = kind === "in" ? "Fly in" : kind === "out" ? "Fly out" : "Fly in/out";
  const style = clickable
    ? { background: "var(--accent-100)", color: "var(--accent-600)", border: "1px solid transparent" }
    : { background: "var(--surface-2)", color: "var(--text-3)", border: "1px dashed var(--border-strong)" };
  const inner = (
    <span
      className="flex items-center gap-1 rounded-[7px] px-1.5 py-1 text-[11px] font-semibold"
      style={style}
    >
      <Icon size={12} strokeWidth={2.2} className="flex-none" />
      <span className="truncate">{label}</span>
      {count > 0 && <span className="ml-auto flex-none tabular-nums">{count}</span>}
    </span>
  );
  if (!clickable) return inner;
  return (
    <button onClick={onClick} className="block w-full text-left transition hover:brightness-95" title={`${label} — details`}>
      {inner}
    </button>
  );
}

/* ---- Day detail modal ---------------------------------------------------- */

export function DayDetailModal({ iso, fly, onClose }: { iso: string; fly: DayFly; onClose: () => void }) {
  const heading = parseISO(iso).toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4"
      style={{ background: "rgba(0,0,0,.45)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[460px] rounded-2xl"
        style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-md)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>
            {heading}
          </div>
          <button
            onClick={onClose}
            title="Close"
            className="grid place-items-center"
            style={{ width: 30, height: 30, borderRadius: 8, background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-2)" }}
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex flex-col gap-5 px-5 py-4">
          <FlyGroup kind="in" members={fly.in} tripLakes={fly.inTripLakes} />
          <FlyGroup kind="out" members={fly.out} tripLakes={fly.outTripLakes} />
        </div>
      </div>
    </div>
  );
}

function FlyGroup({ kind, members, tripLakes }: { kind: "in" | "out"; members: Member[]; tripLakes: string[] }) {
  if (members.length === 0 && tripLakes.length === 0) return null;
  const isIn = kind === "in";
  const Icon = isIn ? PlaneLanding : PlaneTakeoff;
  const title = isIn ? "Flying in" : "Flying out";
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-[12px] font-bold uppercase" style={{ letterSpacing: ".05em", color: "var(--text-3)" }}>
        <Icon size={14} strokeWidth={2.2} />
        {title}
      </div>
      {members.length > 0 ? (
        <div className="flex flex-col gap-2">
          {members.map((m) => (
            <div key={m.participantId} className="flex items-center gap-2.5">
              <Avatar initials={initialsOf(m.name)} src={m.avatarUrl} size={30} />
              <div className="min-w-0">
                <div className="truncate text-[14px] font-semibold" style={{ color: "var(--text)" }}>
                  {m.name}
                </div>
                {m.lakeName && (
                  <div className="truncate text-[12px]" style={{ color: "var(--text-3)" }}>
                    {m.lakeName}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-[13px]" style={{ color: "var(--text-3)" }}>
          {isIn ? "Fly-in" : "Fly-out"} day for {tripLakes.join(", ")}.
        </div>
      )}
    </div>
  );
}
