"use client";

import { use, useEffect, useMemo, useState } from "react";
import { CalendarRange, X } from "lucide-react";
import { Btn, EmptyState, Field, SectionTitle } from "@/components/ui";
import { TripCalendar, DayDetailModal } from "@/components/trip-calendar";
import { AddMenu } from "@/components/add-menu";
import { ItineraryItemEditor } from "@/components/itinerary-editor";
import {
  api,
  type ItineraryItem,
  type ItineraryKind,
  type Participant,
  type Segment,
  type Stay,
  type TripLake,
} from "@/lib/api";
import { aggregateFlyEvents, aggregateItinerary, buildWeeks, packSegments, scheduleRange } from "@/lib/calendar";

// Editor target: creating a new item of a kind, or editing an existing one.
type EditorState = { mode: "create"; kind: ItineraryKind } | { mode: "edit"; item: ItineraryItem };

type Draft = { id?: string; name: string; start_date: string; end_date: string };
const EMPTY: Draft = { name: "", start_date: "", end_date: "" };

function msg(e: unknown, fallback: string) {
  return e && typeof e === "object" && "message" in e ? String((e as { message?: string }).message) : fallback;
}

export default function SchedulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: tripId } = use(params);

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [stays, setStays] = useState<Stay[]>([]);
  const [tripLakes, setTripLakes] = useState<TripLake[]>([]);
  const [segments, setSegments] = useState<Segment[] | null>(null);
  const [items, setItems] = useState<ItineraryItem[]>([]);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);

  // Week (segment) create/edit modal — weeks live on the calendar itself.
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<Participant[]>(`/trips/${tripId}/participants`),
      api.get<Stay[]>(`/trips/${tripId}/stays`),
      api.get<TripLake[]>(`/trips/${tripId}/lakes`),
      api.get<Segment[]>(`/trips/${tripId}/segments`),
      api.get<ItineraryItem[]>(`/trips/${tripId}/itinerary`),
    ])
      .then(([p, s, l, seg, it]) => {
        setParticipants(p);
        setStays(s);
        setTripLakes(l);
        setSegments(seg);
        setItems(it);
      })
      .catch((e) => setError(msg(e, "Load failed")));
  }, [tripId]);

  const dayItems = useMemo(() => aggregateItinerary(items), [items]);

  const { spanStart, spanEnd, gridStart, gridEnd } = useMemo(
    () => scheduleRange(stays, tripLakes, items.map((it) => it.item_date)),
    [stays, tripLakes, items],
  );
  const weeks = useMemo(
    () => (gridStart && gridEnd ? buildWeeks(gridStart, gridEnd, spanStart, spanEnd) : []),
    [gridStart, gridEnd, spanStart, spanEnd],
  );
  const dayFly = useMemo(
    () => aggregateFlyEvents({ stays, participants, tripLakes }),
    [stays, participants, tripLakes],
  );

  // The auto-created "Whole Trip" segment is implied by the calendar — hide it here.
  const weekItems = useMemo(
    () => (segments ?? []).filter((s) => s.name.trim().toLowerCase() !== "whole trip"),
    [segments],
  );

  const { bars: segmentBars, laneCount } = useMemo(
    () =>
      packSegments(
        weekItems
          .filter((s) => s.start_date && s.end_date)
          .map((s) => ({ id: s.id, name: s.name, start: s.start_date!, end: s.end_date! })),
      ),
    [weekItems],
  );

  async function save() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    const body = { name: draft.name, start_date: draft.start_date || null, end_date: draft.end_date || null };
    try {
      if (draft.id) {
        const updated = await api.patch<Segment>(`/trips/${tripId}/segments/${draft.id}`, body);
        setSegments((prev) => prev?.map((s) => (s.id === updated.id ? updated : s)) ?? null);
      } else {
        const created = await api.post<Segment>(`/trips/${tripId}/segments`, {
          ...body,
          sort_order: segments?.length ?? 0,
        });
        setSegments((prev) => (prev ? [...prev, created] : [created]));
      }
      setDraft(null);
    } catch (e) {
      setError(msg(e, "Save failed"));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this week? Stays that adopted its dates keep those dates (they just become custom).")) return;
    setBusy(true);
    try {
      await api.del(`/trips/${tripId}/segments/${id}`);
      setSegments((prev) => prev?.filter((s) => s.id !== id) ?? null);
      setDraft(null);
    } catch (e) {
      setError(msg(e, "Delete failed"));
    } finally {
      setBusy(false);
    }
  }

  function editWeek(id: string) {
    const s = weekItems.find((w) => w.id === id);
    if (s) setDraft({ id: s.id, name: s.name, start_date: s.start_date ?? "", end_date: s.end_date ?? "" });
  }

  const selectedFly = selectedDay ? dayFly.get(selectedDay) : undefined;

  function onItemSaved(saved: ItineraryItem) {
    setItems((prev) => {
      const i = prev.findIndex((it) => it.id === saved.id);
      if (i === -1) return [...prev, saved];
      const next = prev.slice();
      next[i] = saved;
      return next;
    });
  }
  function onItemDeleted(id: string) {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }

  return (
    <div className="p-7 max-w-[1240px] mx-auto">
      <SectionTitle
        right={
          <AddMenu
            onPick={(kind) =>
              kind === "week" ? setDraft({ ...EMPTY }) : setEditor({ mode: "create", kind })
            }
          />
        }
      >
        Schedule
      </SectionTitle>

      {error && (
        <div
          className="mb-4 rounded-[10px] px-3 py-2.5 text-[13px]"
          style={{ background: "var(--danger-bg)", color: "var(--danger)" }}
        >
          {error}
        </div>
      )}

      {/* ---- Calendar ---- */}
      {segments === null ? (
        <div style={{ color: "var(--text-3)" }}>Loading…</div>
      ) : weeks.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title="No dates yet"
          subtitle="Add lakes with fly-in/out dates, assign stays, or add an itinerary item, and the trip calendar will fill in here."
        />
      ) : (
        <TripCalendar
          weeks={weeks}
          dayFly={dayFly}
          dayItems={dayItems}
          segmentBars={segmentBars}
          laneCount={laneCount}
          onPickDay={setSelectedDay}
          onPickItem={(item) => setEditor({ mode: "edit", item })}
          onPickSegment={editWeek}
        />
      )}

      {draft && (
        <div
          className="fixed inset-0 z-50 grid place-items-center p-4"
          style={{ background: "rgba(0,0,0,.45)" }}
          onClick={() => setDraft(null)}
        >
          <div
            className="w-full max-w-[460px] rounded-2xl"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-md)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
              <div className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>
                {draft.id ? "Edit week" : "New week"}
              </div>
              <button
                onClick={() => setDraft(null)}
                title="Close"
                className="grid place-items-center"
                style={{ width: 30, height: 30, borderRadius: 8, background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-2)" }}
              >
                <X size={16} />
              </button>
            </div>
            <div className="px-5 py-4">
              {error && (
                <div
                  className="mb-3 rounded-[10px] px-3 py-2.5 text-[13px]"
                  style={{ background: "var(--danger-bg)", color: "var(--danger)" }}
                >
                  {error}
                </div>
              )}
              <div className="flex flex-col gap-3">
                <Field label="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Week 1" />
                <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
                  <Field label="Start" type="date" value={draft.start_date} onChange={(e) => setDraft({ ...draft, start_date: e.target.value })} />
                  <Field label="End" type="date" value={draft.end_date} onChange={(e) => setDraft({ ...draft, end_date: e.target.value })} />
                </div>
              </div>
              <div className="flex items-center justify-between mt-5">
                <div>
                  {draft.id && (
                    <Btn kind="ghost" onClick={() => remove(draft.id!)} disabled={busy}>Delete</Btn>
                  )}
                </div>
                <div className="flex gap-2">
                  <Btn kind="ghost" onClick={() => setDraft(null)}>Cancel</Btn>
                  {/* Dates are required — the calendar is the only place weeks show,
                      and an undated week would be invisible and unreachable. */}
                  <Btn kind="accent" onClick={save} disabled={busy || !draft.name.trim() || !draft.start_date || !draft.end_date}>
                    {busy ? "Saving…" : draft.id ? "Save changes" : "Add"}
                  </Btn>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedDay && selectedFly && (
        <DayDetailModal iso={selectedDay} fly={selectedFly} onClose={() => setSelectedDay(null)} />
      )}

      {editor && (
        <ItineraryItemEditor
          tripId={tripId}
          kind={editor.mode === "create" ? editor.kind : editor.item.kind}
          item={editor.mode === "edit" ? editor.item : null}
          participants={participants}
          onSaved={onItemSaved}
          onDeleted={onItemDeleted}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
}
