"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Btn, Field } from "@/components/ui";
import { api, type TripLake, type Segment, type Stay } from "@/lib/api";
import { fmtRange } from "@/lib/format";

/** Shared editor for a participant's stay at a lake. Used both from the Lodging
 *  grid (a cell, lake locked) and the per-participant stays list. Encodes the
 *  segment-adopt rule: pick a segment → send segment_id, omit dates; pick
 *  "Custom" → send dates, clear segment_id. */
export function StayEditor({
  tripId, participantId, participantName, lakes, segments, stay, lockedLakeId, takenLakeIds, onSaved, onDeleted, onClose,
}: {
  tripId: string;
  participantId: string;
  participantName?: string;
  lakes: TripLake[];
  segments: Segment[];
  stay: Stay | null;                 // null = creating
  lockedLakeId?: string;             // when opened from a grid cell
  takenLakeIds?: string[];           // lakes this participant already has a stay at (creation only)
  onSaved: (s: Stay) => void;
  onDeleted?: (stayId: string) => void;
  onClose: () => void;
}) {
  const taken = new Set(takenLakeIds ?? []);
  const firstFree = lakes.find((l) => !taken.has(l.id))?.id ?? lakes[0]?.id ?? "";
  const [lakeId, setLakeId] = useState(stay?.lake_id ?? lockedLakeId ?? firstFree);
  // mode: a segment id to adopt, or "" for custom dates.
  const [mode, setMode] = useState<string>(stay?.segment_id ?? "");
  const [startDate, setStartDate] = useState(stay?.start_date ?? "");
  const [endDate, setEndDate] = useState(stay?.end_date ?? "");
  const [cabinId, setCabinId] = useState(stay?.cabin_id ?? "");
  const [notes, setNotes] = useState(stay?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lake = lakes.find((l) => l.id === lakeId);
  const lakeLocked = Boolean(stay) || Boolean(lockedLakeId); // lake can't change on an existing stay
  const selectedSegment = mode ? segments.find((s) => s.id === mode) ?? null : null;

  async function save() {
    if (!lakeId) { setError("Pick a lake."); return; }
    setBusy(true); setError(null);
    try {
      let saved: Stay;
      if (stay) {
        // PATCH — StayUpdate. Re-adopt segment dates by sending segment_id w/o dates.
        const body = mode
          ? { segment_id: mode, cabin_id: cabinId || null, notes: notes || null }
          : { segment_id: null, start_date: startDate || null, end_date: endDate || null, cabin_id: cabinId || null, notes: notes || null };
        saved = await api.patch<Stay>(`/trips/${tripId}/stays/${stay.id}`, body);
      } else {
        // POST — StayIn. Omit dates when adopting a segment.
        const body = mode
          ? { lake_id: lakeId, segment_id: mode, cabin_id: cabinId || null, notes: notes || null }
          : { lake_id: lakeId, start_date: startDate || null, end_date: endDate || null, cabin_id: cabinId || null, notes: notes || null };
        saved = await api.post<Stay>(`/trips/${tripId}/participants/${participantId}/stays`, body);
      }
      onSaved(saved);
      onClose();
    } catch (e) {
      const status = e && typeof e === "object" && "status" in e ? (e as { status?: number }).status : undefined;
      if (status === 409) {
        setError("This person already has a stay at this lake — edit that one instead.");
      } else {
        setError(e && typeof e === "object" && "message" in e ? String((e as { message?: string }).message) : "Save failed");
      }
    } finally {
      setBusy(false);
    }
  }

  async function del() {
    if (!stay) return;
    if (!confirm("Remove this stay?")) return;
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
    <div className="fixed inset-0 z-50 grid place-items-center p-4"
      style={{ background: "rgba(0,0,0,.45)" }} onClick={onClose}>
      <div className="w-full max-w-[520px] rounded-2xl"
        style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-md)" }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <div>
            <div className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>
              {stay ? "Edit stay" : "Add stay"}
            </div>
            {participantName && <div className="text-[12.5px]" style={{ color: "var(--text-3)" }}>{participantName}</div>}
          </div>
          <button onClick={onClose} className="grid place-items-center"
            style={{ width: 30, height: 30, borderRadius: 8, background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
            <X size={15} />
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4">
          {/* Lake */}
          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-semibold" style={{ color: "var(--text-2)" }}>Lake</span>
            <Select value={lakeId} disabled={lakeLocked}
              onChange={(v) => { setLakeId(v); setCabinId(""); }}>
              {lakes.map((l) => (
                <option key={l.id} value={l.id} disabled={!stay && l.id !== lakeId && taken.has(l.id)}>
                  {l.name}{!stay && taken.has(l.id) && l.id !== lakeId ? " (already assigned)" : ""}
                </option>
              ))}
            </Select>
          </label>

          {/* Dates: segment adopt or custom */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-semibold" style={{ color: "var(--text-2)" }}>Dates</span>
            <div className="flex flex-col gap-1.5">
              {segments.map((s) => (
                <label key={s.id} className="inline-flex items-center gap-2 text-[14px]" style={{ color: "var(--text)" }}>
                  <input type="radio" name="seg" checked={mode === s.id} onChange={() => setMode(s.id)} />
                  <span>{s.name}</span>
                  <span className="text-[12.5px]" style={{ color: "var(--text-3)" }}>{fmtRange(s.start_date, s.end_date) || "no dates set"}</span>
                </label>
              ))}
              <label className="inline-flex items-center gap-2 text-[14px]" style={{ color: "var(--text)" }}>
                <input type="radio" name="seg" checked={mode === ""} onChange={() => setMode("")} />
                <span>Custom dates</span>
              </label>
            </div>
            {selectedSegment && (
              <div className="text-[12px] mt-0.5" style={{ color: "var(--text-3)" }}>
                Adopts {selectedSegment.name}: {fmtRange(selectedSegment.start_date, selectedSegment.end_date) || "no dates set"}
              </div>
            )}
            {mode === "" && (
              <div className="grid grid-cols-2 gap-3 mt-1">
                <Field label="Start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                <Field label="End" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            )}
            {segments.length === 0 && (
              <div className="text-[12px]" style={{ color: "var(--text-3)" }}>
                No weeks defined yet — using custom dates. Lay out your trip’s weeks on the Schedule page.
              </div>
            )}
          </div>

          {/* Cabin */}
          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-semibold" style={{ color: "var(--text-2)" }}>Cabin</span>
            <Select value={cabinId} onChange={setCabinId}>
              <option value="">— No cabin —</option>
              {(lake?.cabins ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.name}{c.capacity != null ? ` (${c.capacity} beds)` : ""}</option>
              ))}
            </Select>
            {lake && lake.cabins.length === 0 && (
              <span className="text-[12px]" style={{ color: "var(--text-3)" }}>No cabins at this lake yet — add some on the Lakes page.</span>
            )}
          </label>

          <Field label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="optional" />

          {error && (
            <div className="rounded-[10px] px-3 py-2.5 text-[13px]" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{error}</div>
          )}
        </div>

        <div className="flex items-center justify-between px-5 py-4" style={{ borderTop: "1px solid var(--border)" }}>
          <div>{stay && onDeleted && <Btn kind="danger" onClick={del} disabled={busy}>Remove</Btn>}</div>
          <div className="flex gap-2">
            <Btn kind="ghost" onClick={onClose}>Cancel</Btn>
            <Btn kind="accent" onClick={save} disabled={busy || !lakeId}>{busy ? "Saving…" : stay ? "Save" : "Add stay"}</Btn>
          </div>
        </div>
      </div>
    </div>
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
