"use client";

import { use, useEffect, useMemo, useState } from "react";
import { Backpack, Home, Luggage, Tag } from "lucide-react";
import { Badge, Card, EmptyState, SectionTitle } from "@/components/ui";
import {
  api,
  type PackLine,
  type PackPerson,
  type PackUnit,
  type Participant,
  type Segment,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { effectiveSource, hintLabel, personRow } from "@/lib/packing";

function errMsg(e: unknown, fallback: string): string {
  return e && typeof e === "object" && "message" in e
    ? String((e as { message?: string }).message)
    : fallback;
}

export default function MyListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: tripId } = use(params);
  const { user } = useAuth();
  const [lines, setLines] = useState<PackLine[] | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [selected, setSelected] = useState<string | "">("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<PackLine[]>(`/trips/${tripId}/pack`).then(setLines).catch((e) => setError(errMsg(e, "Load failed")));
    api.get<Participant[]>(`/trips/${tripId}/participants`).then(setParticipants).catch(() => {});
    api.get<Segment[]>(`/trips/${tripId}/segments`).then(setSegments).catch(() => {});
  }, [tripId]);

  // Default to the signed-in user's roster row; organizers can view anyone's.
  const me = useMemo(
    () => participants.find((p) => p.user_id && p.user_id === user?.id) ?? null,
    [participants, user],
  );
  const participantId = selected || me?.id || participants[0]?.id || "";
  const participant = participants.find((p) => p.id === participantId) ?? null;

  const { bring, stored, shared, assignedUnits, owned } = useMemo(() => {
    // Itemized lines speak through their unit assignments instead of the
    // generic everyone-gets-one rows.
    const personal = (lines ?? []).filter(
      (l) => l.effective_personal && l.units.length === 0,
    );
    const assigned: { line: PackLine; unit: PackUnit; segmentIds: string[] }[] = [];
    for (const l of lines ?? []) {
      for (const u of l.units) {
        const mine = u.assignments.filter((a) => a.participant_id === participantId);
        if (mine.length > 0) assigned.push({ line: l, unit: u, segmentIds: mine.map((a) => a.segment_id) });
      }
    }
    return {
      bring: personal.filter((l) => participantId && effectiveSource(l, participantId) === "self"),
      stored: personal.filter((l) => participantId && effectiveSource(l, participantId) === "stored"),
      shared: (lines ?? []).filter(
        (l) => !l.effective_personal && l.assignee_participant_id === participantId,
      ),
      assignedUnits: assigned,
      // Belongs to this person on the trip, but someone else packs it (lines
      // they pack themselves already show under the shared section).
      owned: (lines ?? []).filter(
        (l) => l.owner_participant_id === participantId && l.assignee_participant_id !== participantId,
      ),
    };
  }, [lines, participantId]);

  const segName = useMemo(() => new Map(segments.map((s) => [s.id, s.name])), [segments]);

  async function setPerson(line: PackLine, body: { packed?: boolean; source?: "self" | "stored" | null }) {
    if (!participantId) return;
    try {
      const saved = await api.put<PackPerson>(`/trips/${tripId}/pack/people`, {
        pack_item_id: line.id,
        participant_id: participantId,
        ...body,
      });
      setLines((prev) =>
        prev?.map((l) =>
          l.id === line.id
            ? {
                ...l,
                people: [...l.people.filter((pp) => pp.id !== saved.id && pp.participant_id !== participantId), saved],
              }
            : l,
        ) ?? null,
      );
    } catch (e) {
      setError(errMsg(e, "Save failed"));
    }
  }

  const packedOf = (list: PackLine[]) =>
    list.filter((l) => participantId && (personRow(l, participantId)?.packed ?? false)).length;

  function Row({ line, flip }: { line: PackLine; flip?: "self" | "stored" }) {
    const row = participantId ? personRow(line, participantId) : null;
    const packed = row?.packed ?? false;
    const sub = line.notes || line.item.notes || hintLabel(line.item);
    return (
      <div className="flex items-center gap-3 px-4 sm:px-5 py-2.5" style={{ borderTop: "1px solid var(--border)" }}>
        <button
          onClick={() => void setPerson(line, { packed: !packed })}
          title={packed ? "Packed" : "Not packed yet"}
          className="grid place-items-center flex-none"
          style={{
            width: 22, height: 22, borderRadius: 6,
            background: packed ? "var(--accent)" : "transparent",
            border: packed ? "1px solid transparent" : "1.5px solid var(--border-strong)",
            color: "var(--on-accent)",
          }}
        >
          {packed && <span style={{ fontSize: 13, fontWeight: 700 }}>✓</span>}
        </button>
        <div className="flex-1 min-w-0">
          <div className="truncate text-[14px] font-semibold"
            style={{ color: "var(--text)", textDecoration: packed ? "line-through" : "none", opacity: packed ? 0.6 : 1 }}>
            {line.item.name}
          </div>
          {sub && <div className="truncate text-[12px]" style={{ color: "var(--text-3)" }}>{sub}</div>}
        </div>
        <Badge tone="neutral">{line.item.item_type}</Badge>
        {flip && (
          <button
            onClick={() => void setPerson(line, { source: flip })}
            className="text-[12px] font-semibold flex-none"
            style={{ color: "var(--accent-600)" }}
            title={flip === "self" ? "This person brings their own instead" : "This person's is stored at HQ instead"}
          >
            {flip === "self" ? "brings own →" : "→ stored at HQ"}
          </button>
        )}
      </div>
    );
  }

  function Section({ icon: Icon, title, subtitle, list, flip }: {
    icon: typeof Backpack; title: string; subtitle: string; list: PackLine[]; flip?: "self" | "stored";
  }) {
    if (list.length === 0) return null;
    return (
      <Card>
        <div className="flex items-center gap-2.5 px-4 sm:px-5 py-3.5">
          <Icon size={18} strokeWidth={1.9} style={{ color: "var(--accent-600)" }} />
          <div className="flex-1 min-w-0">
            <div style={{
              fontFamily: "var(--font-display)",
              fontWeight: "var(--display-weight)" as unknown as number,
              letterSpacing: "var(--display-tracking)",
              fontSize: 16.5, color: "var(--text)",
            }}>
              {title}
            </div>
            <div className="text-[12px]" style={{ color: "var(--text-3)" }}>{subtitle}</div>
          </div>
          <Badge tone={packedOf(list) === list.length ? "success" : "neutral"}>
            {packedOf(list)} / {list.length} packed
          </Badge>
        </div>
        {list.map((l) => <Row key={l.id} line={l} flip={flip} />)}
      </Card>
    );
  }

  return (
    <div className="p-4 sm:p-7 max-w-[860px] mx-auto">
      <SectionTitle
        right={
          participants.length > 0 && (
            <select
              value={participantId}
              onChange={(e) => setSelected(e.target.value)}
              className="rounded-[11px] px-3 py-2 text-[13.5px] font-semibold"
              style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", color: "var(--text)" }}
            >
              {participants.map((p) => (
                <option key={p.id} value={p.id}>{p.name}{me?.id === p.id ? " (you)" : ""}</option>
              ))}
            </select>
          )
        }
      >
        {participant && me?.id !== participant.id ? `${participant.name}'s pack list` : "My pack list"}
      </SectionTitle>

      {error && (
        <div className="mb-4 rounded-[10px] px-3 py-2.5 text-[13px]"
          style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{error}</div>
      )}

      {lines === null ? (
        <div style={{ color: "var(--text-3)" }}>Loading…</div>
      ) : bring.length + stored.length + shared.length + assignedUnits.length + owned.length === 0 ? (
        <EmptyState icon={Backpack} title="Nothing assigned yet"
          subtitle="Personal items and shared items assigned to this person will show up here as the Packing list comes together." />
      ) : (
        <div className="flex flex-col gap-5">
          <Section icon={Luggage} title="You bring" flip="stored"
            subtitle="Pack these yourself — they fly with you." list={bring} />
          <Section icon={Home} title="Stored for you" flip="self"
            subtitle="Your copies live at the group's storage between trips — they come up with the group gear." list={stored} />
          {assignedUnits.length > 0 && (
            <Card>
              <div className="flex items-center gap-2.5 px-4 sm:px-5 py-3.5">
                <Tag size={18} strokeWidth={1.9} style={{ color: "var(--accent-600)" }} />
                <div className="flex-1 min-w-0">
                  <div style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: "var(--display-weight)" as unknown as number,
                    letterSpacing: "var(--display-tracking)",
                    fontSize: 16.5, color: "var(--text)",
                  }}>
                    Gear assigned to you
                  </div>
                  <div className="text-[12px]" style={{ color: "var(--text-3)" }}>
                    Specific units with your name on them — packed with the group gear.
                  </div>
                </div>
                <Badge tone="neutral">{assignedUnits.length}</Badge>
              </div>
              {assignedUnits.map(({ line, unit, segmentIds }) => (
                <div key={unit.id} className="flex items-center gap-3 px-4 sm:px-5 py-2.5"
                  style={{ borderTop: "1px solid var(--border)" }}>
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-[14px] font-semibold" style={{ color: "var(--text)" }}>
                      {line.item.name}{unit.label ? ` — ${unit.label}` : ""}
                    </div>
                    <div className="truncate text-[12px]" style={{ color: "var(--text-3)" }}>
                      {segmentIds.map((id) => segName.get(id) ?? "Week").join(" · ")}
                    </div>
                  </div>
                  <Badge tone="neutral">{line.item.item_type}</Badge>
                </div>
              ))}
            </Card>
          )}
          <Section icon={Backpack} title="You pack for the group"
            subtitle="Shared items with you as the packer on the Packing page." list={shared} />
          {owned.length > 0 && (
            <Card>
              <div className="flex items-center gap-2.5 px-4 sm:px-5 py-3.5">
                <Tag size={18} strokeWidth={1.9} style={{ color: "var(--accent-600)" }} />
                <div className="flex-1 min-w-0">
                  <div style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: "var(--display-weight)" as unknown as number,
                    letterSpacing: "var(--display-tracking)",
                    fontSize: 16.5, color: "var(--text)",
                  }}>
                    Yours on the trip
                  </div>
                  <div className="text-[12px]" style={{ color: "var(--text-3)" }}>
                    These belong to you once you&apos;re up there — someone else packs them.
                  </div>
                </div>
                <Badge tone="neutral">{owned.length}</Badge>
              </div>
              {owned.map((line) => {
                const packer = participants.find((p) => p.id === line.assignee_participant_id);
                return (
                  <div key={line.id} className="flex items-center gap-3 px-4 sm:px-5 py-2.5"
                    style={{ borderTop: "1px solid var(--border)" }}>
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-[14px] font-semibold" style={{ color: "var(--text)" }}>
                        {line.item.name}
                      </div>
                      <div className="truncate text-[12px]" style={{ color: "var(--text-3)" }}>
                        {packer ? `Packed by ${packer.name}` : "No packer assigned yet"}
                      </div>
                    </div>
                    <Badge tone="neutral">{line.item.item_type}</Badge>
                  </div>
                );
              })}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
