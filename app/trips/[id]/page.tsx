"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import {
  Calendar,
  ClipboardList,
  MapPin,
  Users,
  Waves,
} from "lucide-react";
import { Card, Eyebrow, SectionTitle, StatCard } from "@/components/ui";
import { api, type Lake, type PackItem, type PackStatus, type Participant, type Stay, type Trip } from "@/lib/api";
import { daysUntil, deriveSpan, fmtRange } from "@/lib/format";

export default function TripDashboard({ params }: { params: Promise<{ id: string }> }) {
  const { id: tripId } = use(params);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [lakes, setLakes] = useState<Lake[]>([]);
  const [stays, setStays] = useState<Stay[]>([]);
  const [packItems, setPackItems] = useState<PackItem[]>([]);
  const [statuses, setStatuses] = useState<PackStatus[]>([]);

  useEffect(() => {
    api.get<Trip>(`/trips/${tripId}`).then(setTrip).catch(() => {});
    api.get<Participant[]>(`/trips/${tripId}/participants`).then(setParticipants).catch(() => {});
    api.get<Lake[]>(`/trips/${tripId}/lakes`).then(setLakes).catch(() => {});
    api.get<Stay[]>(`/trips/${tripId}/stays`).then(setStays).catch(() => {});
    api.get<PackItem[]>(`/trips/${tripId}/pack-list/items`).then(setPackItems).catch(() => {});
    api.get<PackStatus[]>(`/trips/${tripId}/pack-list/statuses`).then(setStatuses).catch(() => {});
  }, [tripId]);

  if (!trip) return <div className="p-8" style={{ color: "var(--text-3)" }}>Loading…</div>;

  const days = daysUntil(trip.start_date);
  const totalSlots = packItems.length * participants.length;
  const packed = statuses.filter((s) => s.done).length;
  const pct = totalSlots > 0 ? Math.round((packed / totalSlots) * 100) : 0;
  const tripLength = trip.start_date && trip.end_date
    ? Math.round((new Date(`${trip.end_date}T12:00:00`).getTime() - new Date(`${trip.start_date}T12:00:00`).getTime()) / 86_400_000) + 1
    : null;
  // Group stays by participant for the crew list's per-person span.
  const staysByParticipant = new Map<string, Stay[]>();
  for (const s of stays) {
    const arr = staysByParticipant.get(s.participant_id) ?? [];
    arr.push(s);
    staysByParticipant.set(s.participant_id, arr);
  }

  return (
    <div className="p-7 max-w-[1240px] mx-auto">
      {/* Hero countdown */}
      <div
        className="relative overflow-hidden rounded-3xl mb-6"
        style={{ background: "var(--primary)", color: "var(--on-primary)", padding: "26px 30px", boxShadow: "var(--shadow-md)" }}
      >
        <ContourBg stroke="#fff" opacity={0.1} />
        <div className="relative flex items-end justify-between gap-6 flex-wrap">
          <div>
            <Eyebrow style={{ color: "rgba(255,255,255,.7)" }}>Lines in the water</Eyebrow>
            <div
              className="gf-mono mt-2 whitespace-nowrap"
              style={{ fontSize: 52, fontWeight: 500, lineHeight: 1, letterSpacing: "-.01em" }}
            >
              {days !== null ? (
                <>
                  {Math.max(0, days)}
                  <span style={{ fontSize: 19, opacity: 0.7 }}> days</span>
                </>
              ) : <>—</>}
            </div>
            <div className="mt-3 flex gap-4 flex-wrap text-[14px]" style={{ opacity: 0.85 }}>
              {trip.destination && (
                <span className="inline-flex items-center gap-1.5"><MapPin size={15} /> {trip.destination}</span>
              )}
              <span className="inline-flex items-center gap-1.5"><Calendar size={15} /> {fmtRange(trip.start_date, trip.end_date) || "Dates TBD"}</span>
              {lakes.length > 0 && (
                <span className="inline-flex items-center gap-1.5"><Waves size={15} /> {lakes.length} {lakes.length === 1 ? "lake" : "lakes"}</span>
              )}
            </div>
          </div>
          <img src="/walleye/walleye-cutout.png" alt=""
            style={{ width: 220, marginBottom: -34, marginRight: -6, filter: "drop-shadow(0 12px 22px rgba(0,0,0,.3))" }} />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard icon={Users} label="Group" value={participants.length} foot="on the roster" tone="primary" />
        <StatCard icon={Waves} label="Lakes" value={lakes.length} foot="stops on the trip" />
        <StatCard icon={ClipboardList} label="Packed progress" value={`${packed} / ${totalSlots}`} foot={`${pct}% complete`} tone="primary" />
        <StatCard icon={Calendar} label="Trip length" value={tripLength !== null ? `${tripLength} d` : "—"} foot={fmtRange(trip.start_date, trip.end_date) || "no dates yet"} />
      </div>

      {/* Quick lists */}
      <div className="grid gap-5" style={{ gridTemplateColumns: "1.4fr 1fr" }}>
        <div>
          <SectionTitle right={
            <Link href={`/trips/${tripId}/participants`} className="text-[13px] font-semibold" style={{ color: "var(--accent-600)" }}>
              Open list
            </Link>
          }>The crew</SectionTitle>
          <Card>
            {participants.length === 0 ? (
              <div className="p-5 text-[14px]" style={{ color: "var(--text-3)" }}>No one in the group yet.</div>
            ) : (
              participants.slice(0, 8).map((p, i) => {
                const [pStart, pEnd] = deriveSpan(staysByParticipant.get(p.id) ?? []);
                return (
                <div key={p.id}
                  className="flex items-center gap-3 px-5 py-3.5"
                  style={{ borderTop: i ? "1px solid var(--border)" : "none" }}
                >
                  <div className="grid place-items-center rounded-full text-[12px] font-bold"
                    style={{ width: 32, height: 32, background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-2)" }}
                  >
                    {initials(p.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-semibold truncate" style={{ color: "var(--text)" }}>{p.name}</div>
                    <div className="text-[12.5px]" style={{ color: "var(--text-3)" }}>
                      {[fmtRange(pStart, pEnd), p.car_group ? `Car ${p.car_group}` : null].filter(Boolean).join(" · ") || "No stays yet"}
                    </div>
                  </div>
                </div>
              );
              })
            )}
          </Card>
        </div>

        <div>
          <SectionTitle right={
            <Link href={`/trips/${tripId}/pack-list`} className="text-[13px] font-semibold" style={{ color: "var(--accent-600)" }}>
              Open list
            </Link>
          }>Pack list categories</SectionTitle>
          <Card pad="6px 20px 14px">
            {Object.entries(groupBy(packItems, (i) => i.category)).map(([cat, items], i) => (
              <div key={cat} className="py-3.5"
                style={{ borderTop: i ? "1px solid var(--border)" : "none" }}>
                <div className="flex justify-between items-baseline mb-2">
                  <span className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>{cat}</span>
                  <span className="gf-mono text-[13px]" style={{ color: "var(--text-2)" }}>
                    {items.length} <span style={{ color: "var(--text-3)" }}>items</span>
                  </span>
                </div>
              </div>
            ))}
            {packItems.length === 0 && (
              <div className="py-4 text-[14px]" style={{ color: "var(--text-3)" }}>
                Nothing on the master pack list yet — head to the pack-list page to add some.
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function initials(name: string): string {
  return name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}

function groupBy<T>(items: T[], key: (t: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const it of items) {
    const k = key(it);
    (out[k] ||= []).push(it);
  }
  return out;
}

function ContourBg({ stroke = "#fff", opacity = 0.1 }: { stroke?: string; opacity?: number }) {
  const rings = [];
  for (let i = 0; i < 9; i++) {
    const k = 1 - i * 0.1;
    rings.push(
      <ellipse key={i} cx={300} cy={230} rx={300 * k} ry={150 * k}
        transform={`rotate(${-16 + i * 1.4} 300 230)`} fill="none" stroke={stroke} strokeWidth="1.5" />
    );
  }
  return (
    <svg viewBox="0 0 600 460" preserveAspectRatio="xMidYMid slice"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity }}>
      {rings}
    </svg>
  );
}
