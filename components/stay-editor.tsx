"use client";

import { useState } from "react";
import { Btn, Field, ModalShell } from "@/components/ui";
import { api, type TripLake, type Segment, type Stay } from "@/lib/api";
import { fmtRange } from "@/lib/format";

/** Editor for a participant's stay on one week (segment). Used from the Lodging
 *  grid (a cell, week locked) and the per-participant list on the Group page.
 *  Dates adopt the week's by reference — the "Custom dates" toggle stores an
 *  override; turning it off sends nulls to re-adopt. */
export function StayEditor({
  tripId, participantId, participantName, lakes, segments, stay, lockedSegmentId, takenSegmentIds, onSaved, onDeleted, onClose,
}: {
  tripId: string;
  participantId: string;
  participantName?: string;
  lakes: TripLake[];
  segments: Segment[];
  stay: Stay | null;                 // null = creating
  lockedSegmentId?: string;          // when opened from a grid cell
  takenSegmentIds?: string[];        // weeks this participant already attends (creation only)
  onSaved: (s: Stay) => void;
  onDeleted?: (stayId: string) => void;
  onClose: () => void;
}) {
  const taken = new Set(takenSegmentIds ?? []);
  const firstFree = segments.find((g) => !taken.has(g.id))?.id ?? segments[0]?.id ?? "";
  const [segmentId, setSegmentId] = useState(stay?.segment_id ?? lockedSegmentId ?? firstFree);
  const [custom, setCustom] = useState(Boolean(stay?.start_date || stay?.end_date));
  const [startDate, setStartDate] = useState(stay?.start_date ?? "");
  const [endDate, setEndDate] = useState(stay?.end_date ?? "");
  const [cabinId, setCabinId] = useState(stay?.cabin_id ?? "");
  const [notes, setNotes] = useState(stay?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const segment = segments.find((g) => g.id === segmentId) ?? null;
  const lake = segment?.lake_id ? lakes.find((l) => l.id === segment.lake_id) ?? null : null;
  const segmentLocked = Boolean(stay) || Boolean(lockedSegmentId); // week can't change on an existing stay

  async function save() {
    if (!segmentId) { setError("Pick a week."); return; }
    setBusy(true); setError(null);
    try {
      let saved: Stay;
      const overrides = custom
        ? { start_date: startDate || null, end_date: endDate || null }
        : { start_date: null, end_date: null }; // null = re-adopt the week's dates
      if (stay) {
        saved = await api.patch<Stay>(`/trips/${tripId}/stays/${stay.id}`, {
          ...overrides, cabin_id: cabinId || null, notes: notes || null,
        });
      } else {
        saved = await api.post<Stay>(`/trips/${tripId}/participants/${participantId}/stays`, {
          segment_id: segmentId, ...overrides, cabin_id: cabinId || null, notes: notes || null,
        });
      }
      onSaved(saved);
      onClose();
    } catch (e) {
      const status = e && typeof e === "object" && "status" in e ? (e as { status?: number }).status : undefined;
      if (status === 409) {
        setError("This person is already on this week — edit that entry instead.");
      } else {
        setError(e && typeof e === "object" && "message" in e ? String((e as { message?: string }).message) : "Save failed");
      }
    } finally {
      setBusy(false);
    }
  }

  async function del() {
    if (!stay) return;
    if (!confirm("Remove this person from this week?")) return;
    setBusy(true); setError(null);
    try {
      await api.del(`/trips/${tripId}/stays/${stay.id}`);
      onDeleted?.(stay.id);
      onClose();
    } catch (e) {
      setError(e && typeof e === "object" && "message" in e ? String((e as { message?: string }).message) : "Delete failed");
      setBusy(false);
    }
  }

  return (
    <ModalShell
      title={stay ? "Edit week details" : "Add to a week"}
      subtitle={participantName}
      onClose={onClose}
      footer={
        <>
          {stay && onDeleted && <Btn kind="danger" className="mr-auto" onClick={del} disabled={busy}>Remove</Btn>}
          <Btn kind="ghost" onClick={onClose}>Cancel</Btn>
          <Btn kind="accent" onClick={save} disabled={busy || !segmentId}>{busy ? "Saving…" : stay ? "Save" : "Add"}</Btn>
        </>
      }
    >
      <div className="flex flex-col gap-4">
          {/* Week */}
          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-semibold" style={{ color: "var(--text-2)" }}>Week</span>
            <Select value={segmentId} disabled={segmentLocked} onChange={(v) => { setSegmentId(v); setCabinId(""); }}>
              {segments.map((g) => (
                <option key={g.id} value={g.id} disabled={!stay && g.id !== segmentId && taken.has(g.id)}>
                  {g.name}{!stay && taken.has(g.id) && g.id !== segmentId ? " (already on it)" : ""}
                </option>
              ))}
            </Select>
            {segment && (
              <span className="text-[12px]" style={{ color: "var(--text-3)" }}>
                {[fmtRange(segment.start_date, segment.end_date) || "no dates set", lake?.name ?? "lake TBD"].join(" · ")}
              </span>
            )}
          </label>

          {/* Dates: adopt the week's unless overridden */}
          <div className="flex flex-col gap-1.5">
            <label className="inline-flex items-center gap-2 text-[14px]" style={{ color: "var(--text)" }}>
              <input type="checkbox" checked={custom} onChange={(e) => {
                setCustom(e.target.checked);
                if (e.target.checked) {
                  // Prefill with the effective dates so the override starts from reality.
                  setStartDate(stay?.effective_start_date ?? segment?.start_date ?? "");
                  setEndDate(stay?.effective_end_date ?? segment?.end_date ?? "");
                }
              }} />
              <span>Custom fly in / fly out</span>
            </label>
            {custom ? (
              <div className="grid grid-cols-2 gap-3 mt-1">
                <Field label="Fly in" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                <Field label="Fly out" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            ) : (
              <span className="text-[12px]" style={{ color: "var(--text-3)" }}>
                Follows the week&rsquo;s dates — if the week moves, so does this person.
              </span>
            )}
          </div>

          {/* Cabin (needs the week's lake) */}
          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-semibold" style={{ color: "var(--text-2)" }}>Cabin</span>
            <Select value={cabinId} onChange={setCabinId} disabled={!lake}>
              <option value="">— No cabin —</option>
              {(lake?.cabins ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.name}{c.capacity != null ? ` (${c.capacity} beds)` : ""}</option>
              ))}
            </Select>
            {!lake && (
              <span className="text-[12px]" style={{ color: "var(--text-3)" }}>
                This week&rsquo;s lake isn&rsquo;t set yet — pick one on the Schedule page first.
              </span>
            )}
            {lake && lake.cabins.length === 0 && (
              <span className="text-[12px]" style={{ color: "var(--text-3)" }}>No cabins at this lake yet — add some by clicking the lake on the Overview page.</span>
            )}
          </label>

          <Field label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="optional" />

          {error && (
            <div className="rounded-[10px] px-3 py-2.5 text-[13px]" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{error}</div>
          )}
      </div>
    </ModalShell>
  );
}

function Select({ value, onChange, disabled, children }: {
  value: string; onChange: (v: string) => void; disabled?: boolean; children: React.ReactNode;
}) {
  return (
    <span className="flex items-center rounded-[11px]"
      style={{ background: disabled ? "var(--surface-2)" : "var(--surface)", border: "1px solid var(--border-strong)" }}>
      <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}
        className="flex-1 min-w-0 bg-transparent outline-none text-[14.5px] py-3 px-3.5"
        style={{ color: "var(--text)", appearance: "none" }}>
        {children}
      </select>
    </span>
  );
}
