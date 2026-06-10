"use client";

import { use, useEffect, useMemo, useState } from "react";
import { CalendarRange } from "lucide-react";
import { Btn, EmptyState, Field, ModalShell, SectionTitle } from "@/components/ui";
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

type Draft = { id?: string; name: string; lake_id: string; start_date: string; end_date: string };
const EMPTY: Draft = { name: "", lake_id: "", start_date: "", end_date: "" };

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
    () => aggregateFlyEvents({ stays, participants, tripLakes, segments: segments ?? [] }),
    [stays, participants, tripLakes, segments],
  );

  const { bars: segmentBars, laneCount } = useMemo(
    () =>
      packSegments(
        (segments ?? [])
          .filter((s) => s.start_date && s.end_date)
          .map((s) => ({ id: s.id, name: s.name, start: s.start_date!, end: s.end_date! })),
      ),
    [segments],
  );

  async function save() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    const body = {
      name: draft.name,
      lake_id: draft.lake_id || null,
      start_date: draft.start_date || null,
      end_date: draft.end_date || null,
    };
    try {
      if (draft.id) {
        const updated = await api.patch<Segment>(`/trips/${tripId}/segments/${draft.id}`, body);
        setSegments((prev) => prev?.map((s) => (s.id === updated.id ? updated : s)) ?? null);
        // Changing a week's dates/lake ripples into adopting stays — refetch.
        api.get<Stay[]>(`/trips/${tripId}/stays`).then(setStays).catch(() => {});
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
    if (!confirm("Delete this week? Everyone's attendance for it — cabins and custom dates included — is removed too.")) return;
    setBusy(true);
    try {
      await api.del(`/trips/${tripId}/segments/${id}`);
      setSegments((prev) => prev?.filter((s) => s.id !== id) ?? null);
      setStays((prev) => prev.filter((s) => s.segment_id !== id));
      setDraft(null);
    } catch (e) {
      setError(msg(e, "Delete failed"));
    } finally {
      setBusy(false);
    }
  }

  function editWeek(id: string) {
    const s = (segments ?? []).find((w) => w.id === id);
    if (s) setDraft({
      id: s.id, name: s.name, lake_id: s.lake_id ?? "",
      start_date: s.start_date ?? "", end_date: s.end_date ?? "",
    });
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
    <div className="p-4 sm:p-7 max-w-[1240px] mx-auto">
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
        <ModalShell
          title={draft.id ? "Edit week" : "New week"}
          onClose={() => setDraft(null)}
          maxWidth={460}
          footer={
            <>
              {draft.id && (
                <Btn kind="ghost" className="mr-auto" onClick={() => remove(draft.id!)} disabled={busy}>Delete</Btn>
              )}
              <Btn kind="ghost" onClick={() => setDraft(null)}>Cancel</Btn>
              {/* Dates are required — the calendar is the only place weeks show,
                  and an undated week would be invisible and unreachable. */}
              <Btn kind="accent" onClick={save} disabled={busy || !draft.name.trim() || !draft.start_date || !draft.end_date}>
                {busy ? "Saving…" : draft.id ? "Save changes" : "Add"}
              </Btn>
            </>
          }
        >
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
            <div className="grid grid-cols-2 gap-3">
              <Field label="Fly in" type="date" value={draft.start_date} onChange={(e) => setDraft({ ...draft, start_date: e.target.value })} />
              <Field label="Fly out" type="date" value={draft.end_date} onChange={(e) => setDraft({ ...draft, end_date: e.target.value })} />
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12.5px] font-semibold" style={{ color: "var(--text-2)" }}>Lake</span>
              <span className="flex items-center rounded-[11px]"
                style={{ background: "var(--surface)", border: "1px solid var(--border-strong)" }}>
                <select
                  value={draft.lake_id}
                  onChange={(e) => setDraft({ ...draft, lake_id: e.target.value })}
                  className="flex-1 min-w-0 bg-transparent outline-none text-[14.5px] py-3 px-3.5"
                  style={{ color: "var(--text)", appearance: "none" }}
                >
                  <option value="">— TBD —</option>
                  {tripLakes.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </span>
              <span className="text-[12px]" style={{ color: "var(--text-3)" }}>
                Pick from the trip&rsquo;s lakes — add new ones on the Lakes &amp; cabins page.
                Changing a week&rsquo;s lake clears its cabin assignments.
              </span>
            </label>
          </div>
        </ModalShell>
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
