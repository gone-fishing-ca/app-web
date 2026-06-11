"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Btn, ComboBox, Field, ModalShell } from "@/components/ui";
import { FlightAwareLink, StatusChip } from "@/components/flight-status";
import { api, type FlightLeg, type FlightLookupLeg, type ItineraryItem, type Participant } from "@/lib/api";

/** The airlines the crew actually flies — picking one + a number + a date is
 *  enough to auto-fill the rest from the schedule lookup. */
const AIRLINES = [
  { code: "UA", name: "United" },
  { code: "AA", name: "American" },
  { code: "AS", name: "Alaska" },
  { code: "DL", name: "Delta" },
  { code: "WN", name: "Southwest" },
];
const OTHER = "OTHER";
const UNLINKED = "none";
const NEW_ITEM = "__new__"; // create the suggested milestone on save

function splitFlightNumber(fn: string | null | undefined): { code: string | null; num: string } {
  const m = /^\s*([A-Za-z]{2})\s*(\d{1,4}[A-Za-z]?)\s*$/.exec(fn ?? "");
  if (m && AIRLINES.some((a) => a.code === m[1].toUpperCase())) {
    return { code: m[1].toUpperCase(), num: m[2] };
  }
  return { code: fn ? OTHER : null, num: "" };
}

/** Create/edit modal for one person's flight leg. Opened from the Flights page
 *  (link to a Schedule flight is optional) or from inside a flight item's
 *  editor (item locked). Airline + number + date can auto-fill the airports and
 *  times via the API's schedule lookup (AeroDataBox).
 *
 *  The Schedule-milestone link suggests itself from the form: arrivals (before
 *  the first week ends) propose "Fly to {destination}", departures propose
 *  "Fly from {origin}". If a same-named milestone already exists on that date
 *  it's pre-selected; otherwise saving creates the milestone first. */
export function FlightLegEditor({
  tripId,
  participants,
  flightItems,
  lockedItemId,
  initialParticipantId,
  firstSegmentEnd,
  leg,
  onSaved,
  onItemCreated,
  onDeleted,
  onClose,
}: {
  tripId: string;
  participants: Participant[];
  flightItems: ItineraryItem[]; // kind === "flight" only
  lockedItemId?: string; // when opened from inside that item's editor
  initialParticipantId?: string; // pre-pick the person (per-person add button)
  firstSegmentEnd?: string | null; // first week's end date — legs on/after it are departures
  leg: FlightLeg | null; // null = creating
  onSaved: (l: FlightLeg) => void;
  onItemCreated?: (item: ItineraryItem) => void; // a milestone was created on save
  onDeleted?: (id: string) => void;
  onClose: () => void;
}) {
  const init = splitFlightNumber(leg?.flight_number);
  const [itemId, setItemId] = useState(leg ? leg.itinerary_item_id ?? "" : lockedItemId ?? "");
  const [participantId, setParticipantId] = useState(leg?.participant_id ?? initialParticipantId ?? "");
  const [legDate, setLegDate] = useState(leg?.leg_date ?? "");
  const [airline, setAirline] = useState<string | null>(init.code);
  const [flightNum, setFlightNum] = useState(init.num);
  const [rawFlight, setRawFlight] = useState(init.code === OTHER ? leg?.flight_number ?? "" : "");
  const [origin, setOrigin] = useState(leg?.origin_airport ?? "");
  const [destination, setDestination] = useState(leg?.destination_airport ?? "");
  const [departs, setDeparts] = useState(leg?.departure_time ?? "");
  const [arrives, setArrives] = useState(leg?.arrival_time ?? "");
  const [confirmation, setConfirmation] = useState(leg?.confirmation_code ?? "");
  const [carNotes, setCarNotes] = useState(leg?.car_notes ?? "");
  const [flightStatus, setFlightStatus] = useState(leg?.status ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupNote, setLookupNote] = useState<string | null>(null);
  const [lookupResults, setLookupResults] = useState<FlightLookupLeg[] | null>(null);

  // Once the user touches the link dropdown (or we're editing / item-locked),
  // stop auto-updating it from the form.
  const [linkTouched, setLinkTouched] = useState(Boolean(leg) || Boolean(lockedItemId));

  const itemLocked = Boolean(lockedItemId);
  const personLocked = Boolean(leg); // the API doesn't support moving a leg between people
  const fullFlightNumber =
    airline && airline !== OTHER
      ? flightNum.trim()
        ? `${airline}${flightNum.trim().toUpperCase()}`
        : ""
      : rawFlight.replace(/\s+/g, "").toUpperCase();

  // Suggested milestone: arrivals are "Fly to {dest}", and once the first week
  // is over you're flying home — "Fly from {origin}".
  const isDeparture = Boolean(legDate && firstSegmentEnd && legDate >= firstSegmentEnd);
  const suggestedAirport = isDeparture ? origin : destination;
  const suggestedTitle =
    legDate && suggestedAirport ? `Fly ${isDeparture ? "from" : "to"} ${suggestedAirport}` : null;
  const suggestedMatch = suggestedTitle
    ? flightItems.find((it) => it.title === suggestedTitle && it.item_date === legDate)
    : undefined;

  useEffect(() => {
    if (linkTouched) return;
    setItemId(suggestedMatch?.id ?? (suggestedTitle ? NEW_ITEM : ""));
  }, [linkTouched, suggestedTitle, suggestedMatch?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const canSave = Boolean(participantId) && !(itemId === NEW_ITEM && !suggestedTitle);
  const canLookup = Boolean(fullFlightNumber) && Boolean(legDate) && !lookupBusy;

  async function lookup() {
    setLookupBusy(true);
    setLookupNote(null);
    setLookupResults(null);
    try {
      const res = await api.get<FlightLookupLeg[]>(
        `/trips/${tripId}/flights/lookup?flight=${encodeURIComponent(fullFlightNumber)}&date=${legDate}`,
      );
      if (res.length === 0) setLookupNote("No scheduled flight found for that number and date.");
      else if (res.length === 1) applyLookup(res[0]);
      else setLookupResults(res); // through-flights keep one number across stops — pick the leg
    } catch (e) {
      setLookupNote(msg(e, "Lookup failed"));
    } finally {
      setLookupBusy(false);
    }
  }

  function applyLookup(r: FlightLookupLeg) {
    if (r.leg_date) setLegDate(r.leg_date);
    if (r.origin_airport) setOrigin(r.origin_airport);
    if (r.destination_airport) setDestination(r.destination_airport);
    if (r.departure_time) setDeparts(r.departure_time);
    if (r.arrival_time) setArrives(r.arrival_time);
    if (r.status) setFlightStatus(r.status);
    setLookupResults(null);
    setLookupNote(`Filled from the schedule${r.airline ? ` — ${r.airline}` : ""}.`);
  }

  async function save() {
    setBusy(true);
    setError(null);
    let linkId = itemId === NEW_ITEM ? "" : itemId;
    try {
      if (itemId === NEW_ITEM && suggestedTitle) {
        // The suggested milestone may have appeared since (someone else's leg
        // saved first) — reuse it instead of creating a duplicate.
        const created =
          suggestedMatch ??
          (await api.post<ItineraryItem>(`/trips/${tripId}/itinerary`, {
            kind: "flight",
            title: suggestedTitle,
            item_date: legDate,
            start_time: null,
            end_time: null,
            location: isDeparture ? origin || null : null,
            end_location: isDeparture ? null : destination || null,
            description: null,
            confirmation_code: null,
            participant_ids: [],
          }));
        if (!suggestedMatch) onItemCreated?.(created);
        linkId = created.id;
      }
    } catch (e) {
      setError(msg(e, "Couldn't create the Schedule milestone"));
      setBusy(false);
      return;
    }
    const body = {
      itinerary_item_id: linkId || null,
      leg_date: legDate || null, // with a linked flight, the API defaults to its date
      flight_number: fullFlightNumber || null,
      origin_airport: origin || null,
      destination_airport: destination || null,
      departure_time: departs || null,
      arrival_time: arrives || null,
      confirmation_code: confirmation || null,
      car_notes: carNotes || null,
      status: flightStatus || null,
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
    <ModalShell
      title={leg ? "Edit flight" : "Add flight"}
      maxWidth={480}
      zIndex={60}
      onClose={onClose}
      footer={
        <>
          {leg && onDeleted && (
            <Btn kind="ghost" className="mr-auto" onClick={del} disabled={busy}>
              Delete
            </Btn>
          )}
          <Btn kind="ghost" onClick={onClose}>
            Cancel
          </Btn>
          <Btn kind="accent" onClick={save} disabled={busy || !canSave}>
            {busy ? "Saving…" : leg ? "Save changes" : "Add"}
          </Btn>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
          {error && (
            <div className="rounded-[10px] px-3 py-2.5 text-[13px]" style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>
              {error}
            </div>
          )}

          <ComboBox
            label="Person"
            value={participantId || null}
            placeholder="Who's on this flight…"
            options={participants.map((p) => ({ value: p.id, label: p.name }))}
            onSelect={setParticipantId}
            disabled={personLocked}
          />

          <div className="grid gap-3 [grid-template-columns:minmax(0,1.1fr)_minmax(0,0.7fr)_minmax(0,1.2fr)]">
            <ComboBox
              label="Airline"
              value={airline}
              placeholder="Airline…"
              options={[...AIRLINES.map((a) => ({ value: a.code, label: a.name, hint: a.code })), { value: OTHER, label: "Other" }]}
              onSelect={setAirline}
            />
            {airline === OTHER ? (
              <Field label="Flight #" value={rawFlight} onChange={(e) => setRawFlight(e.target.value)} placeholder="WS1822" />
            ) : (
              <Field label="Flight #" value={flightNum} onChange={(e) => setFlightNum(e.target.value)} placeholder="2076" inputMode="numeric" />
            )}
            <Field label="Date" type="date" value={legDate} onChange={(e) => setLegDate(e.target.value)} />
          </div>

          <div className="flex items-center gap-2.5">
            <Btn kind="subtle" size="sm" icon={Search} onClick={lookup} disabled={!canLookup}>
              {lookupBusy ? "Looking up…" : "Look up schedule"}
            </Btn>
            <span className="min-w-0 flex-1 truncate text-[12px]" style={{ color: "var(--text-3)" }}>
              {canLookup || lookupBusy ? "Fills the airports, times and status." : "Needs an airline, flight # and date."}
            </span>
            {flightStatus && <StatusChip status={flightStatus} />}
            <FlightAwareLink flightNumber={fullFlightNumber} />
          </div>

          {lookupNote && (
            <div className="rounded-[10px] px-3 py-2 text-[12.5px]" style={{ background: "var(--surface-2)", color: "var(--text-2)" }}>
              {lookupNote}
            </div>
          )}

          {lookupResults && (
            <div className="rounded-[11px] overflow-hidden" style={{ border: "1px solid var(--border-strong)" }}>
              <div className="px-3 py-2 text-[12.5px] font-semibold" style={{ color: "var(--text-2)", borderBottom: "1px solid var(--border)" }}>
                This flight number has several legs — pick the one they&apos;re on:
              </div>
              {lookupResults.map((r, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => applyLookup(r)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-[13.5px]"
                  style={{ color: "var(--text)", borderTop: i ? "1px solid var(--border)" : "none" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <span className="font-semibold">
                    {r.origin_airport ?? "?"} → {r.destination_airport ?? "?"}
                  </span>
                  <span style={{ color: "var(--text-3)" }}>
                    {r.departure_time ?? "?"} – {r.arrival_time ?? "?"}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Field label="From" value={origin} onChange={(e) => setOrigin(e.target.value.toUpperCase())} placeholder="RDM" maxLength={8} />
            <Field label="Departs" type="time" value={departs} onChange={(e) => setDeparts(e.target.value)} />
            <Field label="To" value={destination} onChange={(e) => setDestination(e.target.value.toUpperCase())} placeholder="MSP" maxLength={8} />
            <Field label="Arrives" type="time" value={arrives} onChange={(e) => setArrives(e.target.value)} />
          </div>

          {!itemLocked && (
            <ComboBox
              label="Schedule milestone (optional)"
              value={itemId || UNLINKED}
              options={[
                { value: UNLINKED, label: "Not linked" },
                ...(suggestedTitle && !suggestedMatch
                  ? [{ value: NEW_ITEM, label: `New: ${suggestedTitle}`, hint: legDate }]
                  : []),
                // Only same-day milestones make sense to link; keep the current
                // selection visible even if its date differs.
                ...flightItems
                  .filter((it) => !legDate || it.item_date === legDate || it.id === itemId)
                  .map((it) => ({ value: it.id, label: it.title, hint: it.item_date })),
              ]}
              onSelect={(v) => {
                setLinkTouched(true);
                setItemId(v === UNLINKED ? "" : v);
              }}
            />
          )}

          <div className="grid grid-cols-1 gap-3 sm:[grid-template-columns:1fr_1.6fr]">
            <Field label="Confirmation #" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} placeholder="ABC123" />
            <Field label="Pickup notes" value={carNotes} onChange={(e) => setCarNotes(e.target.value)} placeholder="Meet at baggage claim" />
          </div>
      </div>
    </ModalShell>
  );
}

function msg(e: unknown, fallback: string) {
  return e && typeof e === "object" && "message" in e ? String((e as { message?: string }).message) : fallback;
}
