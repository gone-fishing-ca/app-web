"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import { Backpack, Home, Luggage, SlidersHorizontal, Tag } from "lucide-react";
import { Badge, Card, EmptyState, SectionTitle } from "@/components/ui";
import {
  api,
  type PackLine,
  type PackPerson,
  type PackUnit,
  type Participant,
  type PrefRule,
  type Segment,
  type Stay,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { attendedDays, effectiveSource, fmtQty, hintLabel, personRow, prefRuleStatus } from "@/lib/packing";

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
  const [stays, setStays] = useState<Stay[]>([]);
  const [selected, setSelected] = useState<string | "">("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<PackLine[]>(`/trips/${tripId}/pack`).then(setLines).catch((e) => setError(errMsg(e, "Load failed")));
    api.get<Participant[]>(`/trips/${tripId}/participants`).then(setParticipants).catch(() => {});
    api.get<Segment[]>(`/trips/${tripId}/segments`).then(setSegments).catch(() => {});
    api.get<Stay[]>(`/trips/${tripId}/stays`).then(setStays).catch(() => {});
  }, [tripId]);

  // Default to the signed-in user's roster row; organizers can view anyone's.
  const me = useMemo(
    () => participants.find((p) => p.user_id && p.user_id === user?.id) ?? null,
    [participants, user],
  );
  const participantId = selected || me?.id || participants[0]?.id || "";
  const participant = participants.find((p) => p.id === participantId) ?? null;

  const { bring, stored, shared, assignedUnits, owned, prefs } = useMemo(() => {
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
      // Prefs: lines asking everyone "how many do you want?" before the trip.
      prefs: (lines ?? []).filter((l) => l.item.collect_prefs),
    };
  }, [lines, participantId]);

  const segName = useMemo(() => new Map(segments.map((s) => [s.id, s.name])), [segments]);

  // Rule check: each pref rule covering this trip's prefs lines, with the
  // selected person's standing (per_day targets scale by their attended days).
  const ruleStatuses = useMemo(() => {
    if (!participantId) return [];
    const days = attendedDays(participantId, segments, stays);
    const byRule = new Map<string, { rule: PrefRule; lines: PackLine[] }>();
    for (const l of prefs) {
      const rule = l.item.pref_rule;
      if (!rule) continue;
      const entry = byRule.get(rule.id) ?? { rule, lines: [] };
      entry.lines.push(l);
      byRule.set(rule.id, entry);
    }
    return [...byRule.values()].map(({ rule, lines: ruleLines }) => ({
      rule,
      ...prefRuleStatus(rule, ruleLines, participantId, days),
    }));
  }, [prefs, participantId, segments, stays]);

  // Prefs grouped under thin "Type — Category — Subcategory" headers. Lines
  // arrive server-ordered by that taxonomy, so consecutive grouping holds.
  const prefGroups = useMemo(() => {
    const groups: { label: string; lines: PackLine[] }[] = [];
    for (const l of prefs) {
      const label = [l.item.item_type, l.item.category, l.item.subcategory]
        .filter(Boolean).join(" — ");
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.lines.push(l);
      else groups.push({ label, lines: [l] });
    }
    return groups;
  }, [prefs]);

  async function setPerson(line: PackLine, body: { packed?: boolean; source?: "self" | "stored" | null; pref_qty?: number | null }) {
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

  /** Set a pref optimistically, so rapid +/- taps step from the latest value
   *  instead of racing the server round trip. Saves are serialized per
   *  (line, person): one request in flight, only the *newest* value queued
   *  behind it, and only the final response merged back — otherwise a slow
   *  early response lands after a later tap and snaps the count backwards. */
  const prefSaves = useRef(new Map<string, { busy: boolean; next?: number | null }>());

  async function pushPref(lineId: string, pid: string, v: number | null) {
    const key = `${lineId}:${pid}`;
    const q = prefSaves.current.get(key) ?? { busy: false };
    prefSaves.current.set(key, q);
    if (q.busy) { q.next = v; return; }
    q.busy = true;
    delete q.next;
    try {
      const saved = await api.put<PackPerson>(`/trips/${tripId}/pack/people`, {
        pack_item_id: lineId, participant_id: pid, pref_qty: v,
      });
      // A newer tap queued while we were in flight — its merge supersedes ours.
      if (q.next === undefined) {
        setLines((prev) => prev?.map((l) =>
          l.id === lineId
            ? { ...l, people: [...l.people.filter((pp) => pp.id !== saved.id && pp.participant_id !== pid), saved] }
            : l,
        ) ?? null);
      }
    } catch (e) {
      setError(errMsg(e, "Save failed"));
    }
    q.busy = false;
    if (q.next !== undefined) {
      const nv = q.next;
      delete q.next;
      void pushPref(lineId, pid, nv);
    }
  }

  // The latest *intended* value per (line, person) — a ref, so taps faster
  // than a re-render still step from the newest value instead of a stale
  // render closure (three same-tick clicks must give +3, not +1).
  const prefIntent = useRef(new Map<string, number | null>());

  function setPref(line: PackLine, v: number | null) {
    if (!participantId) return;
    prefIntent.current.set(`${line.id}:${participantId}`, v);
    setLines((prev) => prev?.map((l) => {
      if (l.id !== line.id) return l;
      const existing = l.people.find((pp) => pp.participant_id === participantId);
      const row: PackPerson = existing
        ? { ...existing, pref_qty: v }
        : { id: `tmp-${l.id}-${participantId}`, pack_item_id: l.id,
            participant_id: participantId, source: null, pref_qty: v, packed: false };
      return { ...l, people: [...l.people.filter((pp) => pp.participant_id !== participantId), row] };
    }) ?? null);
    void pushPref(line.id, participantId, v);
  }

  function bumpPref(line: PackLine, delta: number) {
    if (!participantId) return;
    const key = `${line.id}:${participantId}`;
    const current = prefIntent.current.has(key)
      ? prefIntent.current.get(key)!
      : personRow(line, participantId)?.pref_qty ?? null;
    // First tap on an unanswered line: "+" starts at 1, "−" answers 0 (none for me).
    const next = current == null ? Math.max(0, delta) : Math.max(0, current + delta);
    if (next !== current) setPref(line, next);
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
      ) : bring.length + stored.length + shared.length + assignedUnits.length + owned.length + prefs.length === 0 ? (
        <EmptyState icon={Backpack} title="Nothing assigned yet"
          subtitle="Personal items and shared items assigned to this person will show up here as the Packing list comes together." />
      ) : (
        <div className="flex flex-col gap-5">
          {prefs.length > 0 && (
            <Card>
              <div className="flex items-center gap-2.5 px-4 sm:px-5 py-3.5">
                <SlidersHorizontal size={18} strokeWidth={1.9} style={{ color: "var(--accent-600)" }} />
                <div className="flex-1 min-w-0">
                  <div style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: "var(--display-weight)" as unknown as number,
                    letterSpacing: "var(--display-tracking)",
                    fontSize: 16.5, color: "var(--text)",
                  }}>
                    Your prefs
                  </div>
                  <div className="text-[12px]" style={{ color: "var(--text-3)" }}>
                    How many do you want? Answer before the trip — 0 means none for you.
                  </div>
                </div>
                <Badge tone={prefs.every((l) => (personRow(l, participantId)?.pref_qty ?? null) != null) ? "success" : "neutral"}>
                  {prefs.filter((l) => (personRow(l, participantId)?.pref_qty ?? null) != null).length} / {prefs.length} answered
                </Badge>
              </div>
              {ruleStatuses.length > 0 && (
                <div className="flex flex-col gap-1.5 px-4 sm:px-5 pb-3">
                  {ruleStatuses.map(({ rule, target, picked, met }) => (
                    <div key={rule.id}
                      className="flex items-center gap-2 rounded-[9px] px-3 py-1.5 text-[12.5px]"
                      style={{
                        background: met ? "var(--accent-100)" : "var(--warning-bg, var(--surface-2))",
                        color: met ? "var(--accent-600)" : "var(--text-2)",
                        border: met ? "1px solid transparent" : "1px solid var(--border-strong)",
                      }}>
                      <span className="flex-none font-bold">{met ? "✓" : "!"}</span>
                      <span className="min-w-0">
                        {rule.message || rule.name} ({fmtQty(target)}{rule.kind === "max" ? " max" : " total"})
                        {" — "}
                        <span className="font-semibold">
                          {met ? "done" : `${fmtQty(picked)} of ${fmtQty(target)} picked`}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {prefGroups.map((group) => (
                <div key={group.label}>
                  {/* thin taxonomy band — the subcategory header style from the packing list */}
                  <div className="px-4 sm:px-5 py-1" style={{ background: "var(--primary-100)" }}>
                    <span className="block truncate text-[11px] font-bold uppercase"
                      style={{ letterSpacing: ".05em", color: "var(--primary)" }}>
                      {group.label}
                    </span>
                  </div>
                  {group.lines.map((line) => {
                    const row = participantId ? personRow(line, participantId) : null;
                    const sub = line.notes || line.item.notes || null;
                    return (
                      <div key={line.id} className="flex items-center gap-3 px-4 sm:px-5 py-2"
                        style={{ borderTop: "1px solid var(--border)" }}>
                        <div className="flex-1 min-w-0">
                          <div className="truncate text-[14px] font-semibold" style={{ color: "var(--text)" }}>
                            {line.item.name}
                          </div>
                          {sub && <div className="truncate text-[12px]" style={{ color: "var(--text-3)" }}>{sub}</div>}
                        </div>
                        {/* − [count] + stepper; typing still works, saved on blur */}
                        <div className="flex items-stretch flex-none rounded-[9px] overflow-hidden"
                          style={{ border: "1px solid var(--border-strong)" }}>
                          <button onClick={() => bumpPref(line, -1)} title="Fewer (0 = none for me)"
                            className="grid place-items-center"
                            style={{ width: 30, background: "var(--surface-2)", color: "var(--text-2)", borderRight: "1px solid var(--border)" }}>
                            −
                          </button>
                          <input
                            key={`${line.id}-${participantId}-${row?.pref_qty ?? "ø"}`}
                            type="number" inputMode="decimal" min={0} step="any"
                            defaultValue={row?.pref_qty ?? ""}
                            placeholder="—"
                            onBlur={(e) => {
                              const v = e.target.value === "" ? null : Number(e.target.value);
                              if (v !== (row?.pref_qty ?? null)) setPref(line, v);
                            }}
                            className="w-[46px] py-1.5 text-[13.5px] text-center gf-mono outline-none"
                            style={{
                              background: "var(--surface)", border: "none",
                              color: row?.pref_qty == null ? "var(--text-3)" : "var(--text)",
                            }}
                          />
                          <button onClick={() => bumpPref(line, 1)} title="More"
                            className="grid place-items-center"
                            style={{ width: 30, background: "var(--surface-2)", color: "var(--text-2)", borderLeft: "1px solid var(--border)" }}>
                            +
                          </button>
                        </div>
                        {/* fixed-width unit slot so the steppers align down the column */}
                        <span className="w-[64px] flex-none truncate text-[12px]"
                          title={line.effective_unit ?? undefined}
                          style={{ color: "var(--text-3)" }}>
                          {line.effective_unit ?? ""}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </Card>
          )}
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
