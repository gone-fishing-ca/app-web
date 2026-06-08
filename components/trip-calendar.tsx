"use client";

import { Plane, PlaneLanding, PlaneTakeoff, X } from "lucide-react";
import { Avatar, Card } from "@/components/ui";
import { parseISO, type Day, type DayFly, type Member } from "@/lib/calendar";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0] ?? "")
      .join("")
      .toUpperCase() || "?"
  );
}

/* ---- Calendar grid ------------------------------------------------------- */

export function TripCalendar({
  weeks,
  dayFly,
  onPickDay,
}: {
  weeks: Day[][];
  dayFly: Map<string, DayFly>;
  onPickDay: (iso: string) => void;
}) {
  return (
    <Card pad={0} className="overflow-hidden">
      <div
        className="grid"
        style={{ gridTemplateColumns: "repeat(7, 1fr)", borderBottom: "1px solid var(--border)" }}
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
      {weeks.map((week, wi) => (
        <div key={week[0].iso} className="grid" style={{ gridTemplateColumns: "repeat(7, 1fr)" }}>
          {week.map((day, ci) => (
            <DayCell
              key={day.iso}
              day={day}
              fly={dayFly.get(day.iso)}
              topBorder={wi > 0}
              leftBorder={ci > 0}
              onPick={onPickDay}
            />
          ))}
        </div>
      ))}
    </Card>
  );
}

function DayCell({
  day,
  fly,
  topBorder,
  leftBorder,
  onPick,
}: {
  day: Day;
  fly?: DayFly;
  topBorder: boolean;
  leftBorder: boolean;
  onPick: (iso: string) => void;
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
      className="flex flex-col gap-1 px-1.5 pt-1.5 pb-2"
      style={{
        minHeight: 108,
        borderTop: topBorder ? "1px solid var(--border)" : undefined,
        borderLeft: leftBorder ? "1px solid var(--border)" : undefined,
        background: day.inSpan ? "var(--surface)" : "var(--surface-2)",
      }}
    >
      <div
        className="px-1 text-[12px] font-semibold"
        style={{ color: day.inSpan ? "var(--text-2)" : "var(--text-3)" }}
      >
        {day.isFirstOfMonth ? `${day.monthLabel} ${day.dayNum}` : day.dayNum}
      </div>

      {kind && <FlyChip kind={kind} count={count} clickable={clickable} onClick={() => onPick(day.iso)} />}
    </div>
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
              <Avatar initials={initials(m.name)} size={30} />
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
