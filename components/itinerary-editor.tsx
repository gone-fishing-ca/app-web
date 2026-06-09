"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Btn, ComboBox, Field } from "@/components/ui";
import { KIND_META } from "@/components/itinerary-kit";
import { api, type ItineraryItem, type ItineraryKind, type Participant } from "@/lib/api";

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
  const [confirmation, setConfirmation] = useState(item?.confirmation_code ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [memberIds, setMemberIds] = useState<string[]>(item?.participant_ids ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Drives default to a "Drive" title; the others require one.
  const finalTitle = title.trim() || (effKind === "drive" ? "Drive" : "");
  const canSave = Boolean(finalTitle) && Boolean(itemDate);

  const show = {
    endLocation: effKind === "drive" || effKind === "flight",
    startTime: effKind !== "hotel",
    endTime: effKind === "event" || effKind === "flight",
    confirmation: effKind === "flight",
  };
  const timeCols = (show.startTime ? 1 : 0) + (show.endTime ? 1 : 0);
  const dateRowCols = timeCols === 2 ? "1.4fr 1fr 1fr" : timeCols === 1 ? "1.4fr 1fr" : "1fr";
  const labels = LABELS[effKind];

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
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4"
      style={{ background: "rgba(0,0,0,.45)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[480px] rounded-2xl"
        style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-md)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="flex items-center gap-2.5">
            <span
              className="grid place-items-center rounded-[8px]"
              style={{ width: 28, height: 28, background: meta.bg, color: meta.fg }}
            >
              <meta.Icon size={16} strokeWidth={2.2} />
            </span>
            <div className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>
              {item ? "Edit" : "Add"} {meta.label.toLowerCase()}
            </div>
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

          <Field label={labels.title} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={labels.titlePlaceholder} />

          <div className="grid gap-3" style={{ gridTemplateColumns: dateRowCols }}>
            <Field label="Date" type="date" value={itemDate} onChange={(e) => setItemDate(e.target.value)} />
            {show.startTime && (
              <Field label={labels.startTime} type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            )}
            {show.endTime && (
              <Field label={labels.endTime} type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            )}
          </div>

          {show.endLocation ? (
            <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <Field label={labels.location} value={location} onChange={(e) => setLocation(e.target.value)} placeholder={labels.locationPlaceholder} />
              <Field label={labels.endLocation} value={endLocation} onChange={(e) => setEndLocation(e.target.value)} placeholder={labels.endLocationPlaceholder} />
            </div>
          ) : (
            <Field label={labels.location} value={location} onChange={(e) => setLocation(e.target.value)} placeholder={labels.locationPlaceholder} />
          )}

          {show.confirmation && (
            <Field label="Confirmation #" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} placeholder="ABC123" />
          )}

          <MemberMultiSelect participants={participants} value={memberIds} onChange={setMemberIds} />

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

        <div className="flex items-center justify-between px-5 py-4" style={{ borderTop: "1px solid var(--border)" }}>
          <div>
            {item && onDeleted && (
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
              {busy ? "Saving…" : item ? "Save changes" : "Add"}
            </Btn>
          </div>
        </div>
      </div>
    </div>
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
    title: "Flight number",
    titlePlaceholder: "AC123",
    startTime: "Departs",
    endTime: "Arrives",
    location: "From",
    locationPlaceholder: "Origin",
    endLocation: "To",
    endLocationPlaceholder: "Destination",
  },
};

function msg(e: unknown, fallback: string) {
  return e && typeof e === "object" && "message" in e ? String((e as { message?: string }).message) : fallback;
}
