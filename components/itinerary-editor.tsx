"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { Btn, ComboBox, Field, ModalShell } from "@/components/ui";
import { KIND_META } from "@/components/itinerary-kit";
import { FlightLegEditor } from "@/components/flight-leg-editor";
import { api, type FlightLeg, type ItineraryItem, type ItineraryKind, type Participant } from "@/lib/api";

/** Create/edit modal for an itinerary item. One modal, kind-aware: the fields
 *  shown (and their labels) depend on the kind. Reuses the StayEditor modal shell. */
export function ItineraryItemEditor({
  tripId,
  kind,
  item,
  participants,
  onSaved,
  onDeleted,
  onClose,
}: {
  tripId: string;
  kind: ItineraryKind; // used when creating; an existing item keeps its own kind
  item: ItineraryItem | null; // null = creating
  participants: Participant[];
  onSaved: (it: ItineraryItem) => void;
  onDeleted?: (id: string) => void;
  onClose: () => void;
}) {
  const effKind = item?.kind ?? kind;
  const meta = KIND_META[effKind];

  const [title, setTitle] = useState(item?.title ?? "");
  const [itemDate, setItemDate] = useState(item?.item_date ?? "");
  const [startTime, setStartTime] = useState(item?.start_time ?? "");
  const [endTime, setEndTime] = useState(item?.end_time ?? "");
  const [location, setLocation] = useState(item?.location ?? "");
  const [endLocation, setEndLocation] = useState(item?.end_location ?? "");
  // Kept (not edited here) so saving never wipes a value entered before flight
  // details moved down to legs.
  const [confirmation] = useState(item?.confirmation_code ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [memberIds, setMemberIds] = useState<string[]>(item?.participant_ids ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Drives default to a "Drive" title; the others require one.
  const finalTitle = title.trim() || (effKind === "drive" ? "Drive" : "");
  const canSave = Boolean(finalTitle) && Boolean(itemDate);

  // Flight items are the generic group milestone — flight numbers, times, and
  // confirmations live on the per-person legs below, not on the item.
  const show = {
    endLocation: effKind === "drive" || effKind === "flight",
    startTime: effKind === "event" || effKind === "drive",
    endTime: effKind === "event",
  };
  const timeCols = (show.startTime ? 1 : 0) + (show.endTime ? 1 : 0);
  // With two time fields the date drops to its own row on phones.
  const dateRowCols = timeCols === 2
    ? "grid-cols-2 sm:[grid-template-columns:1.4fr_1fr_1fr]"
    : timeCols === 1 ? "[grid-template-columns:1.4fr_1fr]" : "grid-cols-1";
  const labels = LABELS[effKind];

  // Per-person flight legs under an existing flight item.
  const [legs, setLegs] = useState<FlightLeg[]>([]);
  const [legEditor, setLegEditor] = useState<FlightLeg | null | "new">(null); // "new" = creating
  const showLegs = Boolean(item) && effKind === "flight";
  useEffect(() => {
    if (!showLegs || !item) return;
    api
      .get<FlightLeg[]>(`/trips/${tripId}/flights`)
      .then((all) => setLegs(all.filter((l) => l.itinerary_item_id === item.id)))
      .catch(() => {});
  }, [showLegs, item, tripId]);

  function onLegSaved(saved: FlightLeg) {
    setLegs((prev) => {
      const i = prev.findIndex((l) => l.id === saved.id);
      if (i === -1) return [...prev, saved];
      const next = prev.slice();
      next[i] = saved;
      return next;
    });
    // The API auto-adds the leg's person to the item — mirror it here so saving
    // the item afterwards doesn't strip them from participant_ids.
    setMemberIds((prev) => (prev.includes(saved.participant_id) ? prev : [...prev, saved.participant_id]));
  }

  async function save() {
    setBusy(true);
    setError(null);
    const body = {
      kind: effKind,
      title: finalTitle,
      item_date: itemDate,
      start_time: startTime || null,
      end_time: endTime || null,
      location: location || null,
      end_location: endLocation || null,
      description: description || null,
      confirmation_code: confirmation || null,
      participant_ids: memberIds,
    };
    try {
      const saved = item
        ? await api.patch<ItineraryItem>(`/trips/${tripId}/itinerary/${item.id}`, body)
        : await api.post<ItineraryItem>(`/trips/${tripId}/itinerary`, body);
      onSaved(saved);
      onClose();
    } catch (e) {
      setError(msg(e, "Save failed"));
      setBusy(false);
    }
  }

  async function del() {
    if (!item) return;
    if (!confirm("Delete this item?")) return;
    setBusy(true);
    setError(null);
    try {
      await api.del(`/trips/${tripId}/itinerary/${item.id}`);
      onDeleted?.(item.id);
      onClose();
    } catch (e) {
      setError(msg(e, "Delete failed"));
      setBusy(false);
    }
  }

  return (
    <ModalShell
      maxWidth={480}
      onClose={onClose}
      header={
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="grid flex-none place-items-center rounded-[8px]"
            style={{ width: 28, height: 28, background: meta.bg, color: meta.fg }}
          >
            <meta.Icon size={16} strokeWidth={2.2} />
          </span>
          <div className="truncate text-[15px] font-semibold" style={{ color: "var(--text)" }}>
            {item ? "Edit" : "Add"} {meta.label.toLowerCase()}
          </div>
        </div>
      }
      footer={
        <>
          {item && onDeleted && (
            <Btn kind="ghost" className="mr-auto" onClick={del} disabled={busy}>
              Delete
            </Btn>
          )}
          <Btn kind="ghost" onClick={onClose}>
            Cancel
          </Btn>
          <Btn kind="accent" onClick={save} disabled={busy || !canSave}>
            {busy ? "Saving…" : item ? "Save changes" : "Add"}
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

          <Field label={labels.title} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={labels.titlePlaceholder} />

          <div className={`grid gap-3 ${dateRowCols}`}>
            <div className={timeCols === 2 ? "col-span-2 sm:col-span-1" : undefined}>
              <Field label="Date" type="date" value={itemDate} onChange={(e) => setItemDate(e.target.value)} />
            </div>
            {show.startTime && (
              <Field label={labels.startTime} type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            )}
            {show.endTime && (
              <Field label={labels.endTime} type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            )}
          </div>

          {show.endLocation ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label={labels.location} value={location} onChange={(e) => setLocation(e.target.value)} placeholder={labels.locationPlaceholder} />
              <Field label={labels.endLocation} value={endLocation} onChange={(e) => setEndLocation(e.target.value)} placeholder={labels.endLocationPlaceholder} />
            </div>
          ) : (
            <Field label={labels.location} value={location} onChange={(e) => setLocation(e.target.value)} placeholder={labels.locationPlaceholder} />
          )}

          <MemberMultiSelect participants={participants} value={memberIds} onChange={setMemberIds} />

          {showLegs && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[12.5px] font-semibold" style={{ color: "var(--text-2)" }}>
                  Flight legs
                </span>
                <Btn kind="subtle" size="sm" icon={Plus} onClick={() => setLegEditor("new")}>
                  Add leg
                </Btn>
              </div>
              {legs.length === 0 ? (
                <div className="text-[13px]" style={{ color: "var(--text-3)" }}>
                  No individual flights yet — add each person&apos;s actual flights here.
                </div>
              ) : (
                <div className="overflow-hidden rounded-[11px]" style={{ border: "1px solid var(--border)" }}>
                  {legs.map((l, i) => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => setLegEditor(l)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px]"
                      style={{ color: "var(--text)", borderTop: i ? "1px solid var(--border)" : "none" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <span className="min-w-0 flex-1 truncate font-semibold">
                        {participants.find((p) => p.id === l.participant_id)?.name ?? "Unknown"}
                      </span>
                      <span className="gf-mono flex-none text-[12px]" style={{ color: "var(--text-2)" }}>
                        {l.flight_number ?? "—"}
                      </span>
                      <span className="flex-none text-[12px]" style={{ color: "var(--text-3)" }}>
                        {l.origin_airport ?? "?"} → {l.destination_airport ?? "?"}
                        {l.departure_time ? ` · ${l.departure_time}` : ""}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <label className="flex w-full flex-col gap-1.5">
            <span className="text-[12.5px] font-semibold" style={{ color: "var(--text-2)" }}>
              Notes
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full rounded-[11px] px-3.5 py-3 text-[14.5px] outline-none focus:ring-[3px]"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border-strong)",
                color: "var(--text)",
                // @ts-expect-error css var passes through
                "--tw-ring-color": "var(--accent-100)",
              }}
            />
          </label>
        </div>

      {/* Inside the stopPropagation panel so the leg editor's backdrop clicks
          don't bubble out and close this modal too. */}
      {legEditor && item && (
        <FlightLegEditor
          tripId={tripId}
          participants={participants}
          flightItems={[item]}
          lockedItemId={item.id}
          leg={legEditor === "new" ? null : legEditor}
          onSaved={onLegSaved}
          onDeleted={(id) => setLegs((prev) => prev.filter((l) => l.id !== id))}
          onClose={() => setLegEditor(null)}
        />
      )}
    </ModalShell>
  );
}

function MemberMultiSelect({
  participants,
  value,
  onChange,
}: {
  participants: Participant[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const selected = value
    .map((id) => participants.find((p) => p.id === id))
    .filter((p): p is Participant => Boolean(p));
  const remaining = participants.filter((p) => !value.includes(p.id));

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[12.5px] font-semibold" style={{ color: "var(--text-2)" }}>
        Who's going
      </span>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((p) => (
            <span
              key={p.id}
              className="inline-flex items-center gap-1.5 rounded-full text-[12.5px] font-semibold"
              style={{ background: "var(--accent-100)", color: "var(--accent-600)", padding: "3px 7px 3px 10px" }}
            >
              {p.name}
              <button
                type="button"
                onClick={() => onChange(value.filter((id) => id !== p.id))}
                title="Remove"
                className="grid place-items-center rounded-full"
                style={{ width: 16, height: 16, background: "rgba(0,0,0,.10)", color: "inherit" }}
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
      <ComboBox
        value={null}
        placeholder={remaining.length ? "Add a person…" : "Everyone added"}
        options={remaining.map((p) => ({ value: p.id, label: p.name }))}
        onSelect={(id) => onChange([...value, id])}
        disabled={remaining.length === 0}
      />
    </div>
  );
}

type KindLabels = {
  title: string;
  titlePlaceholder: string;
  startTime: string;
  endTime: string;
  location: string;
  locationPlaceholder: string;
  endLocation: string;
  endLocationPlaceholder: string;
};

const LABELS: Record<ItineraryKind, KindLabels> = {
  event: {
    title: "Name",
    titlePlaceholder: "Group dinner",
    startTime: "Start",
    endTime: "End",
    location: "Location",
    locationPlaceholder: "Where",
    endLocation: "",
    endLocationPlaceholder: "",
  },
  drive: {
    title: "Name",
    titlePlaceholder: "Drive",
    startTime: "Depart",
    endTime: "",
    location: "From",
    locationPlaceholder: "Start location",
    endLocation: "To",
    endLocationPlaceholder: "Destination",
  },
  hotel: {
    title: "Hotel name",
    titlePlaceholder: "Grand Portage Casino Hotel",
    startTime: "Check-in",
    endTime: "",
    location: "Location",
    locationPlaceholder: "City / address",
    endLocation: "",
    endLocationPlaceholder: "",
  },
  flight: {
    title: "Name",
    titlePlaceholder: "Fly to MSP",
    startTime: "",
    endTime: "",
    location: "From",
    locationPlaceholder: "Shared origin (optional)",
    endLocation: "To",
    endLocationPlaceholder: "Minneapolis (MSP)",
  },
};

function msg(e: unknown, fallback: string) {
  return e && typeof e === "object" && "message" in e ? String((e as { message?: string }).message) : fallback;
}
