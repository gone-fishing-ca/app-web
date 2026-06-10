"use client";

import { use, useEffect, useMemo, useState } from "react";
import { CalendarRange, PlaneTakeoff, Plus } from "lucide-react";
import { Btn, Card, EmptyState, SectionTitle } from "@/components/ui";
import { FlightLegEditor } from "@/components/flight-leg-editor";
import { api, type FlightLeg, type ItineraryItem, type Participant } from "@/lib/api";
import { fmtDate } from "@/lib/format";

/** Everyone's actual flights, grouped by person — the app's version of the
 *  spreadsheet's FLIGHTS tab. Legs can optionally link to a flight milestone
 *  on the Schedule ("Fly to MSP"), which is where they show on the calendar. */
export default function FlightsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: tripId } = use(params);

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [items, setItems] = useState<ItineraryItem[]>([]); // flight milestones, for the link picker + chips
  const [legs, setLegs] = useState<FlightLeg[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [legEditor, setLegEditor] = useState<{ leg: FlightLeg | null; participantId?: string } | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<Participant[]>(`/trips/${tripId}/participants`),
      api.get<ItineraryItem[]>(`/trips/${tripId}/itinerary`),
      api.get<FlightLeg[]>(`/trips/${tripId}/flights`),
    ])
      .then(([p, it, l]) => {
        setParticipants(p);
        setItems(it.filter((i) => i.kind === "flight"));
        setLegs(l);
      })
      .catch((e) => setError(msg(e, "Load failed")));
  }, [tripId]);

  const itemById = useMemo(() => new Map(items.map((it) => [it.id, it])), [items]);
  const legsByParticipant = useMemo(() => {
    const m = new Map<string, FlightLeg[]>();
    for (const l of legs ?? []) {
      const list = m.get(l.participant_id);
      if (list) list.push(l);
      else m.set(l.participant_id, [l]);
    }
    const effDate = (l: FlightLeg) =>
      l.leg_date ?? (l.itinerary_item_id ? itemById.get(l.itinerary_item_id)?.item_date ?? "" : "");
    for (const list of m.values()) {
      list.sort((a, b) => {
        const d = effDate(a).localeCompare(effDate(b));
        return d !== 0 ? d : (a.departure_time ?? "").localeCompare(b.departure_time ?? "");
      });
    }
    return m;
  }, [legs, itemById]);
  const flyers = useMemo(
    () => participants.filter((p) => legsByParticipant.has(p.id)),
    [participants, legsByParticipant],
  );

  function onLegSaved(saved: FlightLeg) {
    setLegs((prev) => {
      const list = prev ?? [];
      const i = list.findIndex((l) => l.id === saved.id);
      if (i === -1) return [...list, saved];
      const next = list.slice();
      next[i] = saved;
      return next;
    });
  }

  return (
    <div className="p-4 sm:p-7 max-w-[1240px] mx-auto">
      <SectionTitle right={<Btn kind="accent" icon={Plus} onClick={() => setLegEditor({ leg: null })}>Add flight</Btn>}>
        Flights
      </SectionTitle>
      <p className="text-[13px] -mt-1 mb-4" style={{ color: "var(--text-3)" }}>
        Everyone&apos;s flights in and out, grouped by person. Link a flight to a Schedule milestone (e.g. “Fly to MSP”) to show it on the calendar.
      </p>

      {error && (
        <div className="mb-4 rounded-[10px] px-3 py-2.5 text-[13px]" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>
          {error}
        </div>
      )}

      {legs === null ? (
        <div style={{ color: "var(--text-3)" }}>Loading…</div>
      ) : flyers.length === 0 ? (
        <EmptyState
          icon={PlaneTakeoff}
          title="No flights yet"
          subtitle="Add each person's flights — pick the airline, flight number and date, and the schedule lookup fills in the rest."
          action={<Btn kind="accent" icon={Plus} onClick={() => setLegEditor({ leg: null })}>Add flight</Btn>}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {flyers.map((p) => {
            const personLegs = legsByParticipant.get(p.id) ?? [];
            return (
              <Card key={p.id} pad={0}>
                <div className="flex items-center gap-3 px-4 sm:px-5 py-3.5" style={{ borderBottom: "1px solid var(--border)" }}>
                  <span
                    className="grid place-items-center rounded-[8px] flex-none"
                    style={{ width: 30, height: 30, background: "var(--success-bg)", color: "var(--success)" }}
                  >
                    <PlaneTakeoff size={16} strokeWidth={2.2} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14.5px] font-semibold" style={{ color: "var(--text)" }}>
                      {p.name}
                    </div>
                    <div className="text-[12px]" style={{ color: "var(--text-3)" }}>
                      {personLegs.length} {personLegs.length === 1 ? "flight" : "flights"}
                    </div>
                  </div>
                  <Btn kind="subtle" size="sm" icon={Plus} onClick={() => setLegEditor({ leg: null, participantId: p.id })}>
                    Add
                  </Btn>
                </div>
                {personLegs.map((l, i) => {
                  const item = l.itinerary_item_id ? itemById.get(l.itinerary_item_id) : undefined;
                  const date = l.leg_date ?? item?.item_date ?? null;
                  return (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => setLegEditor({ leg: l })}
                      className="flex w-full flex-wrap items-center gap-x-3 gap-y-0.5 px-4 sm:px-5 py-2.5 text-left text-[13.5px] sm:flex-nowrap"
                      style={{ color: "var(--text)", borderTop: i ? "1px solid var(--border)" : "none" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <span className="w-full sm:w-[110px] flex-none font-semibold text-[13px]">
                        {date ? fmtDate(date, { weekday: "short", month: "short", day: "numeric" }) : "No date"}
                      </span>
                      <span className="gf-mono sm:w-[72px] flex-none text-[12.5px]" style={{ color: "var(--text-2)" }}>
                        {l.flight_number ?? "—"}
                      </span>
                      <span className="flex-none text-[13px]" style={{ color: "var(--text-2)" }}>
                        {l.origin_airport ?? "?"} → {l.destination_airport ?? "?"}
                      </span>
                      <span className="flex-none text-[12.5px]" style={{ color: "var(--text-3)" }}>
                        {l.departure_time ?? ""}
                        {l.arrival_time ? ` – ${l.arrival_time}` : ""}
                      </span>
                      <span className="flex-1 min-w-0 truncate text-right text-[12px]" style={{ color: "var(--text-3)" }}>
                        {item && (
                          <span className="inline-flex items-center gap-1">
                            <CalendarRange size={12} /> {item.title}
                          </span>
                        )}
                        {item && l.confirmation_code && <span className="px-1">·</span>}
                        {l.confirmation_code && <span className="gf-mono">{l.confirmation_code}</span>}
                      </span>
                    </button>
                  );
                })}
              </Card>
            );
          })}
        </div>
      )}

      {legEditor && (
        <FlightLegEditor
          tripId={tripId}
          participants={participants}
          flightItems={items}
          initialParticipantId={legEditor.participantId}
          leg={legEditor.leg}
          onSaved={onLegSaved}
          onDeleted={(id) => setLegs((prev) => (prev ?? []).filter((l) => l.id !== id))}
          onClose={() => setLegEditor(null)}
        />
      )}
    </div>
  );
}

function msg(e: unknown, fallback: string) {
  return e && typeof e === "object" && "message" in e ? String((e as { message?: string }).message) : fallback;
}
