"use client";

import { use, useEffect, useMemo, useState } from "react";
import { CalendarRange, MapPinned, Pencil, Plus, Trash2 } from "lucide-react";
import { Btn, Card, EmptyState, Field, SectionTitle } from "@/components/ui";
import { TripCalendar, DayDetailModal } from "@/components/trip-calendar";
import { api, type Participant, type Segment, type Stay, type TripLake } from "@/lib/api";
import { fmtRange } from "@/lib/format";
import { aggregateFlyEvents, buildWeeks, scheduleRange } from "@/lib/calendar";

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
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Week management (carried over from the old segments page).
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<Participant[]>(`/trips/${tripId}/participants`),
      api.get<Stay[]>(`/trips/${tripId}/stays`),
      api.get<TripLake[]>(`/trips/${tripId}/lakes`),
      api.get<Segment[]>(`/trips/${tripId}/segments`),
    ])
      .then(([p, s, l, seg]) => {
        setParticipants(p);
        setStays(s);
        setTripLakes(l);
        setSegments(seg);
      })
      .catch((e) => setError(msg(e, "Load failed")));
  }, [tripId]);

  const { spanStart, spanEnd, gridStart, gridEnd } = useMemo(
    () => scheduleRange(stays, tripLakes),
    [stays, tripLakes],
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
    try {
      await api.del(`/trips/${tripId}/segments/${id}`);
      setSegments((prev) => prev?.filter((s) => s.id !== id) ?? null);
    } catch (e) {
      setError(msg(e, "Delete failed"));
    }
  }

  const selectedFly = selectedDay ? dayFly.get(selectedDay) : undefined;

  return (
    <div className="p-7 max-w-[980px] mx-auto">
      <SectionTitle>Schedule</SectionTitle>

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
          subtitle="Add lakes with fly-in/out dates, or assign stays, and the trip calendar will fill in here."
        />
      ) : (
        <TripCalendar weeks={weeks} dayFly={dayFly} onPickDay={setSelectedDay} />
      )}

      {/* ---- Weeks ---- */}
      <div className="mt-9">
        <SectionTitle right={<Btn kind="accent" icon={Plus} onClick={() => setDraft({ ...EMPTY })}>Add week</Btn>}>
          Weeks
        </SectionTitle>
        <p className="text-[13px] -mt-1 mb-4" style={{ color: "var(--text-3)" }}>
          Define the weeks of your trip (e.g. “Week 1”, “Week 2”, “Both Weeks”). Assign them to people in Lodging to autofill their dates. Weeks can overlap.
        </p>

        {segments === null ? (
          <div style={{ color: "var(--text-3)" }}>Loading…</div>
        ) : weekItems.length === 0 && !draft ? (
          <EmptyState
            icon={MapPinned}
            title="No weeks yet"
            subtitle="Lay out your trip’s weeks once, then reuse them when assigning stays."
            action={<Btn kind="accent" icon={Plus} onClick={() => setDraft({ ...EMPTY })}>Add week</Btn>}
          />
        ) : weekItems.length > 0 ? (
          <Card>
            <div
              className="grid items-center px-5 py-3 text-[11.5px] font-bold uppercase"
              style={{ gridTemplateColumns: "1.4fr 1.6fr 100px", letterSpacing: ".05em", color: "var(--text-3)", borderBottom: "1px solid var(--border)" }}
            >
              <span>Name</span>
              <span>Dates</span>
              <span></span>
            </div>
            {weekItems.map((s, i) => (
              <div
                key={s.id}
                className="grid items-center px-5 py-3"
                style={{ gridTemplateColumns: "1.4fr 1.6fr 100px", borderTop: i ? "1px solid var(--border)" : "none" }}
              >
                <span className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>{s.name}</span>
                <span className="text-[13px]" style={{ color: "var(--text-2)" }}>{fmtRange(s.start_date, s.end_date) || "—"}</span>
                <div className="flex items-center justify-end gap-1">
                  <IconBtn title="Edit" onClick={() => setDraft({ id: s.id, name: s.name, start_date: s.start_date ?? "", end_date: s.end_date ?? "" })}>
                    <Pencil size={14} />
                  </IconBtn>
                  <IconBtn title="Delete" onClick={() => remove(s.id)}>
                    <Trash2 size={14} />
                  </IconBtn>
                </div>
              </div>
            ))}
          </Card>
        ) : null}

        {draft && (
          <Card pad={20} className="mt-5">
            <div className="text-[13px] font-bold uppercase mb-3" style={{ letterSpacing: ".05em", color: "var(--text-3)" }}>
              {draft.id ? "Edit week" : "New week"}
            </div>
            <div className="grid gap-3" style={{ gridTemplateColumns: "1.4fr 1fr 1fr" }}>
              <Field label="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Week 1" />
              <Field label="Start" type="date" value={draft.start_date} onChange={(e) => setDraft({ ...draft, start_date: e.target.value })} />
              <Field label="End" type="date" value={draft.end_date} onChange={(e) => setDraft({ ...draft, end_date: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Btn kind="ghost" onClick={() => setDraft(null)}>Cancel</Btn>
              <Btn kind="accent" onClick={save} disabled={busy || !draft.name.trim()}>
                {busy ? "Saving…" : draft.id ? "Save changes" : "Add"}
              </Btn>
            </div>
          </Card>
        )}
      </div>

      {selectedDay && selectedFly && (
        <DayDetailModal iso={selectedDay} fly={selectedFly} onClose={() => setSelectedDay(null)} />
      )}
    </div>
  );
}

function IconBtn({ children, title, onClick }: { children: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="grid place-items-center"
      style={{ width: 30, height: 30, borderRadius: 8, background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-2)" }}
    >
      {children}
    </button>
  );
}
