"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BedDouble, Plus } from "lucide-react";
import { Badge, Card, EmptyState, SectionTitle } from "@/components/ui";
import { StayEditor } from "@/components/stay-editor";
import { api, type Cabin, type TripLake, type Participant, type Segment, type Stay } from "@/lib/api";
import { fmtRange } from "@/lib/format";

type EditorState = { participantId: string; participantName: string; lakeId: string; stay: Stay | null };

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

  const segMap = useMemo(() => new Map(segments.map((s) => [s.id, s])), [segments]);
  const cabinMap = useMemo(() => {
    const m = new Map<string, Cabin>();
    for (const l of lakes) for (const c of l.cabins) m.set(c.id, c);
    return m;
  }, [lakes]);
  const stayAt = useMemo(() => {
    const m = new Map<string, Stay>();
    for (const s of stays) m.set(`${s.participant_id}:${s.lake_id}`, s);
    return m;
  }, [stays]);

  // Per-lake cabin occupancy (count of stays assigned to each cabin).
  const occupancy = useMemo(() => {
    const m = new Map<string, number>(); // cabinId -> count
    for (const s of stays) if (s.cabin_id) m.set(s.cabin_id, (m.get(s.cabin_id) ?? 0) + 1);
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

  function cellLabel(stay: Stay): { date: string; cabin: string | null; over: boolean } {
    const seg = stay.segment_id ? segMap.get(stay.segment_id) : null;
    const date = seg ? seg.name : (fmtRange(stay.start_date, stay.end_date) || "Dates TBD");
    const cabin = stay.cabin_id ? cabinMap.get(stay.cabin_id) ?? null : null;
    const over = Boolean(cabin && cabin.capacity != null && (occupancy.get(cabin.id) ?? 0) > cabin.capacity);
    return { date, cabin: cabin?.name ?? null, over };
  }

  const colW = 190;

  return (
    <div className="p-7 max-w-[1240px] mx-auto">
      <SectionTitle>Lodging</SectionTitle>
      <p className="text-[13px] -mt-1 mb-4" style={{ color: "var(--text-3)" }}>
        Who’s at which lake, for which dates, in which cabin. Click a cell to assign or edit a stay.
      </p>

      {error && (
        <div className="mb-4 rounded-[10px] px-3 py-2.5 text-[13px]" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{error}</div>
      )}

      {participants === null ? (
        <div style={{ color: "var(--text-3)" }}>Loading…</div>
      ) : lakes.length === 0 ? (
        <EmptyState icon={BedDouble} title="No lakes yet"
          subtitle="Add at least one lake first."
          action={<Link href={`/trips/${tripId}/lakes`} className="text-[14px] font-semibold" style={{ color: "var(--accent-600)" }}>Go to Lakes &amp; cabins →</Link>} />
      ) : participants.length === 0 ? (
        <EmptyState icon={BedDouble} title="No one in the group yet"
          subtitle="Add people to the group, then assign their lakes &amp; dates here."
          action={<Link href={`/trips/${tripId}/participants`} className="text-[14px] font-semibold" style={{ color: "var(--accent-600)" }}>Go to Group →</Link>} />
      ) : (
        <Card pad={0} className="overflow-x-auto">
          <div style={{ minWidth: 220 + lakes.length * colW }}>
            {/* Header: lake columns */}
            <div className="flex" style={{ borderBottom: "1px solid var(--border)" }}>
              <div className="flex-none px-5 py-3 text-[11.5px] font-bold uppercase"
                style={{ width: 220, letterSpacing: ".05em", color: "var(--text-3)" }}>Person</div>
              {lakes.map((l) => (
                <div key={l.id} className="flex-none px-3 py-3" style={{ width: colW, borderLeft: "1px solid var(--border)" }}>
                  <div className="text-[13px] font-semibold truncate" style={{ color: "var(--text)" }}>{l.name}</div>
                  <div className="text-[11.5px] truncate" style={{ color: "var(--text-3)" }}>{fmtRange(l.fly_in_date, l.fly_out_date) || "Dates TBD"}</div>
                </div>
              ))}
            </div>

            {/* Rows: participants */}
            {participants.map((p, i) => (
              <div key={p.id} className="flex" style={{ borderTop: i ? "1px solid var(--border)" : "none" }}>
                <div className="flex-none px-5 py-3 flex items-center gap-2" style={{ width: 220 }}>
                  <span className="text-[14px] font-semibold truncate" style={{ color: "var(--text)" }}>{p.name}</span>
                  {p.user_id && <Badge tone="accent">App</Badge>}
                </div>
                {lakes.map((l) => {
                  const stay = stayAt.get(`${p.id}:${l.id}`) ?? null;
                  return (
                    <div key={l.id} className="flex-none p-2" style={{ width: colW, borderLeft: "1px solid var(--border)" }}>
                      {stay ? (
                        <button onClick={() => setEditor({ participantId: p.id, participantName: p.name, lakeId: l.id, stay })}
                          className="w-full text-left rounded-[10px] px-2.5 py-2 transition hover:brightness-95"
                          style={{ background: "var(--accent-100)", border: "1px solid transparent" }}>
                          {(() => { const { date, cabin, over } = cellLabel(stay); return (
                            <>
                              <div className="text-[12.5px] font-semibold truncate" style={{ color: "var(--accent-600)" }}>{date}</div>
                              <div className="text-[12px] truncate flex items-center gap-1" style={{ color: over ? "var(--danger)" : "var(--text-2)" }}>
                                {cabin ?? "No cabin"}{over && " ⚠"}
                              </div>
                            </>
                          ); })()}
                        </button>
                      ) : (
                        <button onClick={() => setEditor({ participantId: p.id, participantName: p.name, lakeId: l.id, stay: null })}
                          className="w-full grid place-items-center rounded-[10px] py-2.5 transition hover:brightness-95"
                          style={{ border: "1px dashed var(--border-strong)", color: "var(--text-3)" }} title="Add lake & dates">
                          <Plus size={15} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}

            {/* Footer: cabin load per lake */}
            <div className="flex" style={{ borderTop: "1px solid var(--border)", background: "var(--surface-2)" }}>
              <div className="flex-none px-5 py-3 text-[11.5px] font-bold uppercase"
                style={{ width: 220, letterSpacing: ".05em", color: "var(--text-3)" }}>Cabin load</div>
              {lakes.map((l) => (
                <div key={l.id} className="flex-none px-3 py-3 flex flex-col gap-1" style={{ width: colW, borderLeft: "1px solid var(--border)" }}>
                  {l.cabins.length === 0 ? (
                    <span className="text-[12px]" style={{ color: "var(--text-3)" }}>—</span>
                  ) : l.cabins.map((c) => {
                    const used = occupancy.get(c.id) ?? 0;
                    const over = c.capacity != null && used > c.capacity;
                    return (
                      <span key={c.id} className="text-[12px] flex justify-between gap-2" style={{ color: over ? "var(--danger)" : "var(--text-2)" }}>
                        <span className="truncate">{c.name}</span>
                        <span className="gf-mono flex-none">{used}{c.capacity != null ? `/${c.capacity}` : ""}</span>
                      </span>
                    );
                  })}
                </div>
              ))}
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
          lockedLakeId={editor.lakeId}
          onSaved={upsertStay}
          onDeleted={dropStay}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
}
