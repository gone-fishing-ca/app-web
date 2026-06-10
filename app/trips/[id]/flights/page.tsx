"use client";

import { use, useEffect, useMemo, useState } from "react";
import { Pencil, Plane, PlaneTakeoff, Plus, Users } from "lucide-react";
import { Btn, Card, EmptyState, SectionTitle } from "@/components/ui";
import { ItineraryItemEditor } from "@/components/itinerary-editor";
import { FlightLegEditor } from "@/components/flight-leg-editor";
import { api, type FlightLeg, type ItineraryItem, type Participant } from "@/lib/api";
import { fmtDate } from "@/lib/format";

/** Per-person flight details, grouped under the flight itinerary items (the
 *  group milestones that appear on the Schedule calendar). Items are the
 *  parents; legs are each person's actual flights underneath. */
export default function FlightsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: tripId } = use(params);

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [items, setItems] = useState<ItineraryItem[] | null>(null);
  const [legs, setLegs] = useState<FlightLeg[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [itemEditor, setItemEditor] = useState<ItineraryItem | "new" | null>(null);
  const [legEditor, setLegEditor] = useState<{ itemId?: string; leg: FlightLeg | null } | null>(null);

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

  const pName = useMemo(() => new Map(participants.map((p) => [p.id, p.name])), [participants]);
  const legsByItem = useMemo(() => {
    const m = new Map<string, FlightLeg[]>();
    for (const l of legs) {
      const list = m.get(l.itinerary_item_id);
      if (list) list.push(l);
      else m.set(l.itinerary_item_id, [l]);
    }
    return m;
  }, [legs]);

  function onItemSaved(saved: ItineraryItem) {
    if (saved.kind !== "flight") return;
    setItems((prev) => {
      if (!prev) return [saved];
      const i = prev.findIndex((it) => it.id === saved.id);
      if (i === -1) return [...prev, saved];
      const next = prev.slice();
      next[i] = saved;
      return next;
    });
  }
  function onItemDeleted(id: string) {
    setItems((prev) => prev?.filter((it) => it.id !== id) ?? null);
    setLegs((prev) => prev.filter((l) => l.itinerary_item_id !== id)); // server cascades
  }
  function onLegSaved(saved: FlightLeg) {
    setLegs((prev) => {
      const i = prev.findIndex((l) => l.id === saved.id);
      if (i === -1) return [...prev, saved];
      const next = prev.slice();
      next[i] = saved;
      return next;
    });
    // Mirror the API's auto-add of the leg's person to the item members.
    setItems((prev) =>
      prev?.map((it) =>
        it.id === saved.itinerary_item_id && !it.participant_ids.includes(saved.participant_id)
          ? { ...it, participant_ids: [...it.participant_ids, saved.participant_id] }
          : it,
      ) ?? null,
    );
  }

  return (
    <div className="p-7 max-w-[820px] mx-auto">
      <SectionTitle right={<Btn kind="accent" icon={Plus} onClick={() => setItemEditor("new")}>Add flight</Btn>}>
        Flight tracker
      </SectionTitle>
      <p className="text-[13px] -mt-1 mb-4" style={{ color: "var(--text-3)" }}>
        Each flight here is a group milestone on the Schedule (e.g. “Fly to MSP”); add legs underneath for each person&apos;s actual flights.
      </p>

      {error && (
        <div className="mb-4 rounded-[10px] px-3 py-2.5 text-[13px]" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>
          {error}
        </div>
      )}

      {items === null ? (
        <div style={{ color: "var(--text-3)" }}>Loading…</div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={PlaneTakeoff}
          title="No flights yet"
          subtitle="Add a flight milestone (it shows on the Schedule), then attach each person's legs."
          action={<Btn kind="accent" icon={Plus} onClick={() => setItemEditor("new")}>Add flight</Btn>}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {items.map((it) => {
            const itemLegs = legsByItem.get(it.id) ?? [];
            return (
              <Card key={it.id} pad={0}>
                <div className="flex items-center gap-3 px-5 py-3.5" style={{ borderBottom: "1px solid var(--border)" }}>
                  <span
                    className="grid place-items-center rounded-[8px] flex-none"
                    style={{ width: 30, height: 30, background: "var(--success-bg)", color: "var(--success)" }}
                  >
                    <Plane size={16} strokeWidth={2.2} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14.5px] font-semibold" style={{ color: "var(--text)" }}>
                      {it.title}
                    </div>
                    <div className="flex items-center gap-2 text-[12px]" style={{ color: "var(--text-3)" }}>
                      {fmtDate(it.item_date, { weekday: "short", month: "short", day: "numeric" })}
                      {it.end_location && <span>→ {it.end_location}</span>}
                      <span className="inline-flex items-center gap-1">
                        <Users size={12} /> {it.participant_ids.length}
                      </span>
                    </div>
                  </div>
                  <IconBtn title="Edit flight" onClick={() => setItemEditor(it)}>
                    <Pencil size={14} />
                  </IconBtn>
                  <Btn kind="subtle" size="sm" icon={Plus} onClick={() => setLegEditor({ itemId: it.id, leg: null })}>
                    Add leg
                  </Btn>
                </div>
                {itemLegs.length === 0 ? (
                  <div className="px-5 py-3.5 text-[13px]" style={{ color: "var(--text-3)" }}>
                    No individual flights yet.
                  </div>
                ) : (
                  itemLegs.map((l, i) => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => setLegEditor({ leg: l })}
                      className="flex w-full items-center gap-3 px-5 py-2.5 text-left text-[13.5px]"
                      style={{ color: "var(--text)", borderTop: i ? "1px solid var(--border)" : "none" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <span className="min-w-0 w-[160px] truncate font-semibold">{pName.get(l.participant_id) ?? "Unknown"}</span>
                      <span className="gf-mono w-[72px] flex-none text-[12.5px]" style={{ color: "var(--text-2)" }}>
                        {l.flight_number ?? "—"}
                      </span>
                      <span className="flex-none text-[13px]" style={{ color: "var(--text-2)" }}>
                        {l.origin_airport ?? "?"} → {l.destination_airport ?? "?"}
                      </span>
                      <span className="flex-1 text-[12.5px]" style={{ color: "var(--text-3)" }}>
                        {l.departure_time ?? ""}
                        {l.arrival_time ? ` – ${l.arrival_time}` : ""}
                      </span>
                      {l.confirmation_code && (
                        <span className="gf-mono flex-none text-[12px]" style={{ color: "var(--text-3)" }}>
                          {l.confirmation_code}
                        </span>
                      )}
                    </button>
                  ))
                )}
              </Card>
            );
          })}
        </div>
      )}

      {itemEditor && (
        <ItineraryItemEditor
          tripId={tripId}
          kind="flight"
          item={itemEditor === "new" ? null : itemEditor}
          participants={participants}
          onSaved={onItemSaved}
          onDeleted={onItemDeleted}
          onClose={() => setItemEditor(null)}
        />
      )}

      {legEditor && (
        <FlightLegEditor
          tripId={tripId}
          participants={participants}
          flightItems={items ?? []}
          lockedItemId={legEditor.itemId}
          leg={legEditor.leg}
          onSaved={onLegSaved}
          onDeleted={(id) => setLegs((prev) => prev.filter((l) => l.id !== id))}
          onClose={() => setLegEditor(null)}
        />
      )}
    </div>
  );
}

function IconBtn({ children, title, onClick }: { children: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="grid place-items-center flex-none"
      style={{ width: 30, height: 30, borderRadius: 8, background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-2)" }}
    >
      {children}
    </button>
  );
}

function msg(e: unknown, fallback: string) {
  return e && typeof e === "object" && "message" in e ? String((e as { message?: string }).message) : fallback;
}
