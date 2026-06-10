"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Btn, ComboBox, Field } from "@/components/ui";
import { api, type FlightLeg, type ItineraryItem, type Participant } from "@/lib/api";

/** Create/edit modal for one person's flight segment under a flight
 *  ItineraryItem. Opened from the flight item editor (item locked) or the
 *  Flight tracker page (item picked from a dropdown). The API auto-adds the
 *  person to the parent item's members. */
export function FlightLegEditor({
  tripId,
  participants,
  flightItems,
  lockedItemId,
  leg,
  onSaved,
  onDeleted,
  onClose,
}: {
  tripId: string;
  participants: Participant[];
  flightItems: ItineraryItem[]; // kind === "flight" only
  lockedItemId?: string; // when opened from inside that item's editor
  leg: FlightLeg | null; // null = creating
  onSaved: (l: FlightLeg) => void;
  onDeleted?: (id: string) => void;
  onClose: () => void;
}) {
  const [itemId, setItemId] = useState(leg?.itinerary_item_id ?? lockedItemId ?? flightItems[0]?.id ?? "");
  const [participantId, setParticipantId] = useState(leg?.participant_id ?? "");
  const [legDate, setLegDate] = useState(leg?.leg_date ?? "");
  const [flightNumber, setFlightNumber] = useState(leg?.flight_number ?? "");
  const [origin, setOrigin] = useState(leg?.origin_airport ?? "");
  const [destination, setDestination] = useState(leg?.destination_airport ?? "");
  const [departs, setDeparts] = useState(leg?.departure_time ?? "");
  const [arrives, setArrives] = useState(leg?.arrival_time ?? "");
  const [confirmation, setConfirmation] = useState(leg?.confirmation_code ?? "");
  const [carNotes, setCarNotes] = useState(leg?.car_notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const itemLocked = Boolean(leg) || Boolean(lockedItemId);
  const personLocked = Boolean(leg); // the API doesn't support moving a leg between people
  const canSave = Boolean(itemId) && Boolean(participantId);

  async function save() {
    setBusy(true);
    setError(null);
    const body = {
      itinerary_item_id: itemId,
      leg_date: legDate || null, // API defaults to the item's date
      flight_number: flightNumber || null,
      origin_airport: origin || null,
      destination_airport: destination || null,
      departure_time: departs || null,
      arrival_time: arrives || null,
      confirmation_code: confirmation || null,
      car_notes: carNotes || null,
    };
    try {
      const saved = leg
        ? await api.patch<FlightLeg>(`/trips/${tripId}/flights/leg/${leg.id}`, body)
        : await api.post<FlightLeg>(`/trips/${tripId}/flights/${participantId}`, body);
      onSaved(saved);
      onClose();
    } catch (e) {
      setError(msg(e, "Save failed"));
      setBusy(false);
    }
  }

  async function del() {
    if (!leg) return;
    if (!confirm("Remove this flight leg?")) return;
    setBusy(true);
    setError(null);
    try {
      await api.del(`/trips/${tripId}/flights/leg/${leg.id}`);
      onDeleted?.(leg.id);
      onClose();
    } catch (e) {
      setError(msg(e, "Delete failed"));
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center p-4"
      style={{ background: "rgba(0,0,0,.45)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[480px] rounded-2xl"
        style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-md)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>
            {leg ? "Edit flight leg" : "Add flight leg"}
          </div>
          <button
            onClick={onClose}
            title="Close"
            className="grid place-items-center"
            style={{ width: 30, height: 30, borderRadius: 8, background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-2)" }}
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-3.5 px-5 py-4">
          {error && (
            <div className="rounded-[10px] px-3 py-2.5 text-[13px]" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>
              {error}
            </div>
          )}

          {!itemLocked && (
            <ComboBox
              label="Flight"
              value={itemId || null}
              options={flightItems.map((it) => ({ value: it.id, label: it.title, hint: it.item_date }))}
              onSelect={setItemId}
            />
          )}

          <ComboBox
            label="Person"
            value={participantId || null}
            placeholder="Who's on this flight…"
            options={participants.map((p) => ({ value: p.id, label: p.name }))}
            onSelect={setParticipantId}
            disabled={personLocked}
          />

          <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1.4fr" }}>
            <Field label="Flight #" value={flightNumber} onChange={(e) => setFlightNumber(e.target.value)} placeholder="UA208" />
            <Field label="Date" type="date" value={legDate} onChange={(e) => setLegDate(e.target.value)} hint={leg ? undefined : "Blank = the flight's date"} />
          </div>

          <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
            <Field label="From" value={origin} onChange={(e) => setOrigin(e.target.value.toUpperCase())} placeholder="RDM" maxLength={8} />
            <Field label="Departs" type="time" value={departs} onChange={(e) => setDeparts(e.target.value)} />
            <Field label="To" value={destination} onChange={(e) => setDestination(e.target.value.toUpperCase())} placeholder="MSP" maxLength={8} />
            <Field label="Arrives" type="time" value={arrives} onChange={(e) => setArrives(e.target.value)} />
          </div>

          <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1.6fr" }}>
            <Field label="Confirmation #" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} placeholder="ABC123" />
            <Field label="Pickup notes" value={carNotes} onChange={(e) => setCarNotes(e.target.value)} placeholder="Meet at baggage claim" />
          </div>
        </div>

        <div className="flex items-center justify-between px-5 py-4" style={{ borderTop: "1px solid var(--border)" }}>
          <div>
            {leg && onDeleted && (
              <Btn kind="ghost" onClick={del} disabled={busy}>
                Delete
              </Btn>
            )}
          </div>
          <div className="flex gap-2">
            <Btn kind="ghost" onClick={onClose}>
              Cancel
            </Btn>
            <Btn kind="accent" onClick={save} disabled={busy || !canSave}>
              {busy ? "Saving…" : leg ? "Save changes" : "Add"}
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

function msg(e: unknown, fallback: string) {
  return e && typeof e === "object" && "message" in e ? String((e as { message?: string }).message) : fallback;
}
