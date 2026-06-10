"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BedDouble, Plus } from "lucide-react";
import { Badge, Card, EmptyState, SectionTitle } from "@/components/ui";
import { StayEditor } from "@/components/stay-editor";
import { api, type TripLake, type Participant, type Segment, type Stay } from "@/lib/api";
import { fmtRange } from "@/lib/format";

type EditorState = { participantId: string; participantName: string; segmentId: string; stay: Stay | null };

export default function LodgingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: tripId } = use(params);
  const [participants, setParticipants] = useState<Participant[] | null>(null);
  const [lakes, setLakes] = useState<TripLake[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [stays, setStays] = useState<Stay[]>([]);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<Participant[]>(`/trips/${tripId}/participants`),
      api.get<TripLake[]>(`/trips/${tripId}/lakes`),
      api.get<Segment[]>(`/trips/${tripId}/segments`),
      api.get<Stay[]>(`/trips/${tripId}/stays`),
    ]).then(([p, l, sg, st]) => { setParticipants(p); setLakes(l); setSegments(sg); setStays(st); })
      .catch((e) => setError(e.message ?? "Load failed"));
  }, [tripId]);

  const lakeMap = useMemo(() => new Map(lakes.map((l) => [l.id, l])), [lakes]);
  const stayAt = useMemo(() => {
    const m = new Map<string, Stay>();
    for (const s of stays) m.set(`${s.participant_id}:${s.segment_id}`, s);
    return m;
  }, [stays]);

  // Cabin occupancy per (week, cabin) — a cabin can host different people each week.
  const occupancy = useMemo(() => {
    const m = new Map<string, number>(); // `${segmentId}:${cabinId}` -> count
    for (const s of stays) {
      if (s.cabin_id) {
        const k = `${s.segment_id}:${s.cabin_id}`;
        m.set(k, (m.get(k) ?? 0) + 1);
      }
    }
    return m;
  }, [stays]);

  function upsertStay(s: Stay) {
    setStays((prev) => {
      const i = prev.findIndex((x) => x.id === s.id);
      if (i >= 0) { const next = [...prev]; next[i] = s; return next; }
      return [...prev, s];
    });
  }
  function dropStay(id: string) { setStays((prev) => prev.filter((s) => s.id !== id)); }

  function cellLabel(seg: Segment, stay: Stay): { date: string; cabin: string | null; over: boolean } {
    // Adopting stays just say "In"; overrides surface their dates.
    const date = stay.start_date || stay.end_date
      ? fmtRange(stay.effective_start_date, stay.effective_end_date) || "Dates TBD"
      : "In";
    const lake = seg.lake_id ? lakeMap.get(seg.lake_id) : null;
    const cabin = stay.cabin_id ? lake?.cabins.find((c) => c.id === stay.cabin_id) ?? null : null;
    const over = Boolean(
      cabin && cabin.capacity != null
      && (occupancy.get(`${seg.id}:${cabin.id}`) ?? 0) > cabin.capacity,
    );
    return { date, cabin: cabin?.name ?? null, over };
  }

  const colW = 190;

  return (
    <div className="p-4 sm:p-7 max-w-[1240px] mx-auto">
      <SectionTitle>Lodging</SectionTitle>
      <p className="text-[13px] -mt-1 mb-4" style={{ color: "var(--text-3)" }}>
        Who&rsquo;s on which week, in which cabin. Click a cell to assign or edit.
      </p>

      {error && (
        <div className="mb-4 rounded-[10px] px-3 py-2.5 text-[13px]" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{error}</div>
      )}

      {participants === null ? (
        <div style={{ color: "var(--text-3)" }}>Loading…</div>
      ) : segments.length === 0 ? (
        <EmptyState icon={BedDouble} title="No weeks yet"
          subtitle="Lay out the trip's weeks first, then assign cabins here."
          action={<Link href={`/trips/${tripId}/segments`} className="text-[14px] font-semibold" style={{ color: "var(--accent-600)" }}>Go to Schedule →</Link>} />
      ) : participants.length === 0 ? (
        <EmptyState icon={BedDouble} title="No one in the group yet"
          subtitle="Add people to the group, then assign their weeks &amp; cabins here."
          action={<Link href={`/trips/${tripId}/participants`} className="text-[14px] font-semibold" style={{ color: "var(--accent-600)" }}>Go to Group →</Link>} />
      ) : (
        <Card pad={0} className="overflow-x-auto">
          <div style={{ minWidth: 220 + segments.length * colW }}>
            {/* Header: week columns ("Week 1 · Ogoki") */}
            <div className="flex" style={{ borderBottom: "1px solid var(--border)" }}>
              <div className="flex-none px-5 py-3 text-[11.5px] font-bold uppercase"
                style={{ width: 220, letterSpacing: ".05em", color: "var(--text-3)" }}>Person</div>
              {segments.map((g) => {
                const lake = g.lake_id ? lakeMap.get(g.lake_id) : null;
                return (
                  <div key={g.id} className="flex-none px-3 py-3" style={{ width: colW, borderLeft: "1px solid var(--border)" }}>
                    <div className="text-[13px] font-semibold truncate" style={{ color: "var(--text)" }}>
                      {g.name}{lake ? ` · ${lake.name}` : ""}
                    </div>
                    <div className="text-[11.5px] truncate" style={{ color: "var(--text-3)" }}>
                      {[fmtRange(g.start_date, g.end_date) || "Dates TBD", lake ? null : "lake TBD"].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Rows: participants */}
            {participants.map((p, i) => (
              <div key={p.id} className="flex" style={{ borderTop: i ? "1px solid var(--border)" : "none" }}>
                <div className="flex-none px-5 py-3 flex items-center gap-2" style={{ width: 220 }}>
                  <span className="text-[14px] font-semibold truncate" style={{ color: "var(--text)" }}>{p.name}</span>
                  {p.user_id && <Badge tone="accent">App</Badge>}
                </div>
                {segments.map((g) => {
                  const stay = stayAt.get(`${p.id}:${g.id}`) ?? null;
                  return (
                    <div key={g.id} className="flex-none p-2" style={{ width: colW, borderLeft: "1px solid var(--border)" }}>
                      {stay ? (
                        <button onClick={() => setEditor({ participantId: p.id, participantName: p.name, segmentId: g.id, stay })}
                          className="w-full text-left rounded-[10px] px-2.5 py-2 transition hover:brightness-95"
                          style={{ background: "var(--accent-100)", border: "1px solid transparent" }}>
                          {(() => { const { date, cabin, over } = cellLabel(g, stay); return (
                            <>
                              <div className="text-[12.5px] font-semibold truncate" style={{ color: "var(--accent-600)" }}>{date}</div>
                              <div className="text-[12px] truncate flex items-center gap-1" style={{ color: over ? "var(--danger)" : "var(--text-2)" }}>
                                {cabin ?? "No cabin"}{over && " ⚠"}
                              </div>
                            </>
                          ); })()}
                        </button>
                      ) : (
                        <button onClick={() => setEditor({ participantId: p.id, participantName: p.name, segmentId: g.id, stay: null })}
                          className="w-full grid place-items-center rounded-[10px] py-2.5 transition hover:brightness-95"
                          style={{ border: "1px dashed var(--border-strong)", color: "var(--text-3)" }} title="Add to this week">
                          <Plus size={15} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}

            {/* Footer: cabin load per week */}
            <div className="flex" style={{ borderTop: "1px solid var(--border)", background: "var(--surface-2)" }}>
              <div className="flex-none px-5 py-3 text-[11.5px] font-bold uppercase"
                style={{ width: 220, letterSpacing: ".05em", color: "var(--text-3)" }}>Cabin load</div>
              {segments.map((g) => {
                const lake = g.lake_id ? lakeMap.get(g.lake_id) : null;
                return (
                  <div key={g.id} className="flex-none px-3 py-3 flex flex-col gap-1" style={{ width: colW, borderLeft: "1px solid var(--border)" }}>
                    {!lake || lake.cabins.length === 0 ? (
                      <span className="text-[12px]" style={{ color: "var(--text-3)" }}>—</span>
                    ) : lake.cabins.map((c) => {
                      const used = occupancy.get(`${g.id}:${c.id}`) ?? 0;
                      const over = c.capacity != null && used > c.capacity;
                      return (
                        <span key={c.id} className="text-[12px] flex justify-between gap-2" style={{ color: over ? "var(--danger)" : "var(--text-2)" }}>
                          <span className="truncate">{c.name}</span>
                          <span className="gf-mono flex-none">{used}{c.capacity != null ? `/${c.capacity}` : ""}</span>
                        </span>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </Card>
      )}

      {editor && (
        <StayEditor
          tripId={tripId}
          participantId={editor.participantId}
          participantName={editor.participantName}
          lakes={lakes}
          segments={segments}
          stay={editor.stay}
          lockedSegmentId={editor.segmentId}
          onSaved={upsertStay}
          onDeleted={dropStay}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
}
