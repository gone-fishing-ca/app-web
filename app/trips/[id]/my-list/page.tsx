"use client";

import { use, useEffect, useMemo, useState } from "react";
import { Backpack, Home, Luggage, Tag } from "lucide-react";
import { Badge, Card, EmptyState, SectionTitle } from "@/components/ui";
import {
  api,
  type PackLine,
  type PackPerson,
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

/** The "Type — Category — Subcategory" section a line files under. */
function groupLabel(l: PackLine): string {
  return [l.item.item_type, l.item.category, l.item.subcategory].filter(Boolean).join(" — ");
}

/** Consecutive taxonomy grouping — lines arrive server-ordered by taxonomy,
 *  and every list here is built in that order, so this holds. */
function groupByTaxonomy<T>(items: T[], lineOf: (t: T) => PackLine): { label: string; items: T[] }[] {
  const groups: { label: string; items: T[] }[] = [];
  for (const it of items) {
    const label = groupLabel(lineOf(it));
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(it);
    else groups.push({ label, items: [it] });
  }
  return groups;
}

/** The thin taxonomy band — the My-prefs page's compact header style. */
function Band({ label }: { label: string }) {
  return (
    <div className="px-4 sm:px-5 py-1" style={{ background: "var(--primary-100)" }}>
      <span className="block truncate text-[11px] font-bold uppercase"
        style={{ letterSpacing: ".05em", color: "var(--primary)" }}>
        {label}
      </span>
    </div>
  );
}

/** One "Provided for you" row: a unit explicitly assigned to this person, or a
 *  per-person line nobody itemized (everyone gets one from the group packing). */
type ProvidedEntry = { key: string; line: PackLine; title: string; sub: string | null };

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

  const { bring, stored, shared, provided, owned } = useMemo(() => {
    const segName = new Map(segments.map((s) => [s.id, s.name]));
    // Itemized lines speak through their unit assignments instead of the
    // generic everyone-gets-one rows.
    const personal = (lines ?? []).filter(
      (l) => l.effective_personal && l.units.length === 0,
    );
    // "Provided for you": units assigned to this person, plus shared per-person
    // lines nobody itemized — everyone gets one, so show it here too (and they
    // can bring their own if it's not enough). Built in line order so taxonomy
    // grouping stays consecutive.
    const provided: ProvidedEntry[] = [];
    for (const l of lines ?? []) {
      if (l.effective_personal) continue;
      for (const u of l.units) {
        const mine = u.assignments.filter((a) => a.participant_id === participantId);
        if (mine.length > 0) {
          provided.push({
            key: u.id, line: l,
            title: `${l.item.name}${u.label ? ` — ${u.label}` : ""}`,
            sub: mine.map((a) => segName.get(a.segment_id) ?? "Week").join(" · "),
          });
        }
      }
      const perPerson = l.item.qty_basis === "per_person" || l.item.qty_basis === "per_person_peak";
      const anyAssigned = l.units.some((u) => u.assignments.length > 0);
      // Gear only — per-person food is provisioning, not something you'd
      // bring your own copy of.
      if (perPerson && l.item.item_type !== "Food" && !l.item.collect_prefs && !anyAssigned
        // lines this person packs already show under "You pack for the group"
        && l.assignee_participant_id !== participantId) {
        provided.push({ key: l.id, line: l, title: l.item.name, sub: hintLabel(l.item) });
      }
    }
    return {
      bring: personal.filter((l) => participantId && effectiveSource(l, participantId) === "self"),
      stored: personal.filter((l) => participantId && effectiveSource(l, participantId) === "stored"),
      shared: (lines ?? []).filter(
        (l) => !l.effective_personal && l.assignee_participant_id === participantId,
      ),
      provided,
      // Belongs to this person on the trip, but someone else packs it (lines
      // they pack themselves already show under the shared section).
      owned: (lines ?? []).filter(
        (l) => l.owner_participant_id === participantId && l.assignee_participant_id !== participantId,
      ),
    };
  }, [lines, participantId, segments]);

  async function setPacked(line: PackLine, packed: boolean) {
    if (!participantId) return;
    try {
      const saved = await api.put<PackPerson>(`/trips/${tripId}/pack/people`, {
        pack_item_id: line.id,
        participant_id: participantId,
        packed,
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

  function Row({ line }: { line: PackLine }) {
    const row = participantId ? personRow(line, participantId) : null;
    const packed = row?.packed ?? false;
    const sub = line.notes || line.item.notes || hintLabel(line.item);
    return (
      <div className="flex items-center gap-3 px-4 sm:px-5 py-2.5" style={{ borderTop: "1px solid var(--border)" }}>
        <button
          onClick={() => void setPacked(line, !packed)}
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
      </div>
    );
  }

  function Section({ icon: Icon, title, subtitle, list }: {
    icon: typeof Backpack; title: string; subtitle: string; list: PackLine[];
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
        {groupByTaxonomy(list, (l) => l).map((g) => (
          <div key={g.label}>
            <Band label={g.label} />
            {g.items.map((l) => <Row key={l.id} line={l} />)}
          </div>
        ))}
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
      ) : bring.length + stored.length + shared.length + provided.length + owned.length === 0 ? (
        <EmptyState icon={Backpack} title="Nothing assigned yet"
          subtitle="Personal items and shared items assigned to this person will show up here as the Packing list comes together." />
      ) : (
        <div className="flex flex-col gap-5">
          <Section icon={Luggage} title="You bring"
            subtitle="Pack these yourself." list={bring} />
          <Section icon={Home} title="Stored for you"
            subtitle="Your copies live at the group's storage between trips — they come up with the group gear." list={stored} />
          {provided.length > 0 && (
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
                    Provided for you
                  </div>
                  <div className="text-[12px]" style={{ color: "var(--text-3)" }}>
                    Assigned to you or one-per-person — packed with the group gear. Bring your own if something&apos;s missing.
                  </div>
                </div>
                <Badge tone="neutral">{provided.length}</Badge>
              </div>
              {groupByTaxonomy(provided, (e) => e.line).map((g) => (
                <div key={g.label}>
                  <Band label={g.label} />
                  {g.items.map((e) => (
                    <div key={e.key} className="flex items-center gap-3 px-4 sm:px-5 py-2.5"
                      style={{ borderTop: "1px solid var(--border)" }}>
                      <div className="flex-1 min-w-0">
                        <div className="truncate text-[14px] font-semibold" style={{ color: "var(--text)" }}>
                          {e.title}
                        </div>
                        {e.sub && <div className="truncate text-[12px]" style={{ color: "var(--text-3)" }}>{e.sub}</div>}
                      </div>
                    </div>
                  ))}
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
              {groupByTaxonomy(owned, (l) => l).map((g) => (
                <div key={g.label}>
                  <Band label={g.label} />
                  {g.items.map((line) => {
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
                      </div>
                    );
                  })}
                </div>
              ))}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
