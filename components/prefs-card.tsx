"use client";

import { useEffect, useMemo, useRef } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Badge, Card } from "@/components/ui";
import {
  api,
  type PackLine,
  type PackPerson,
  type PrefRule,
  type Segment,
  type Stay,
} from "@/lib/api";
import { attendedDays, effectivePref, fmtQty, personRow, prefRuleStatus } from "@/lib/packing";

/* One participant's prefs: the "how many do you want?" card. Rule targets at
   the top, items under thin taxonomy bands, and a typed input per line —
   steppers in the item's increment for numbers, Yes/No for bools. Answers
   initialize at the item's default; only an explicit answer counts as
   "answered". Used by the My-prefs page. */

/** The "Type — Category — Subcategory" section a line files under. */
function groupLabel(l: PackLine): string {
  return [l.item.item_type, l.item.category, l.item.subcategory].filter(Boolean).join(" — ");
}

function RuleBanner({ rule, target, picked, met }: {
  rule: PrefRule; target: number; picked: number; met: boolean;
}) {
  return (
    <div
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
  );
}

export function PrefsCard({ tripId, lines, setLines, participantId, segments, stays, onError }: {
  tripId: string;
  lines: PackLine[];
  setLines: (fn: (prev: PackLine[] | null) => PackLine[] | null) => void;
  participantId: string;
  segments: Segment[];
  stays: Stay[];
  onError: (msg: string) => void;
}) {
  const prefs = useMemo(() => lines.filter((l) => l.item.collect_prefs), [lines]);

  // Rule check: each pref rule covering this trip's prefs lines, with the
  // selected person's standing (per_day targets scale by their attended days).
  // When all of a rule's lines sit in one taxonomy section (the typical case),
  // `group` carries that section's label so the banner renders inside it.
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
    return [...byRule.values()].map(({ rule, lines: ruleLines }) => {
      const labels = new Set(ruleLines.map(groupLabel));
      return {
        rule,
        group: labels.size === 1 ? [...labels][0] : null,
        ...prefRuleStatus(rule, ruleLines, participantId, days),
      };
    });
  }, [prefs, participantId, segments, stays]);

  // Grouped under thin "Type — Category — Subcategory" headers. Lines arrive
  // server-ordered by that taxonomy, so consecutive grouping holds.
  const prefGroups = useMemo(() => {
    const groups: { label: string; lines: PackLine[] }[] = [];
    for (const l of prefs) {
      const label = groupLabel(l);
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.lines.push(l);
      else groups.push({ label, lines: [l] });
    }
    return groups;
  }, [prefs]);

  /** Saves are serialized per (line, person): one request in flight, only the
   *  *newest* value queued behind it, and only the final response merged —
   *  otherwise a slow early response lands after a later tap and snaps the
   *  count backwards. */
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
      onError(e && typeof e === "object" && "message" in e ? String((e as { message?: string }).message) : "Save failed");
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

  function bumpPref(line: PackLine, direction: 1 | -1) {
    if (!participantId) return;
    const key = `${line.id}:${participantId}`;
    const step = (line.item.pref_increment || 1) * direction;
    // Step from the latest intent, else the effective value (explicit answer
    // or the item's default — the value the input is showing). A first tap on
    // an unset pref lands at 0 ("none for me"); stepping starts from there.
    const current = prefIntent.current.has(key)
      ? prefIntent.current.get(key)!
      : effectivePref(line, participantId);
    const next = current == null ? 0 : Math.max(0, current + step);
    if (next !== current) setPref(line, next);
  }

  const answered = prefs.filter((l) => (personRow(l, participantId)?.pref_qty ?? null) != null).length;

  // Keep the sidebar's "prefs needing attention" badge live while answering.
  useEffect(() => {
    if (!participantId) return;
    window.dispatchEvent(new CustomEvent("gf:prefs-answered", {
      detail: { participantId, unanswered: prefs.length - answered },
    }));
  }, [participantId, prefs.length, answered]);

  if (prefs.length === 0) return null;

  return (
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
        <Badge tone={answered === prefs.length ? "success" : "neutral"}>
          {answered} / {prefs.length} answered
        </Badge>
      </div>
      {/* Rules spanning more than one section show at the top; single-section
          rules render inside their section instead (the typical case). */}
      {ruleStatuses.some((r) => r.group == null) && (
        <div className="flex flex-col gap-1.5 px-4 sm:px-5 pb-3">
          {ruleStatuses.filter((r) => r.group == null).map((s) => <RuleBanner key={s.rule.id} {...s} />)}
        </div>
      )}
      {prefGroups.map((group) => {
        const groupRules = ruleStatuses.filter((r) => r.group === group.label);
        return (
        <div key={group.label}>
          {/* thin taxonomy band — the subcategory header style from the packing list */}
          <div className="px-4 sm:px-5 py-1" style={{ background: "var(--primary-100)" }}>
            <span className="block truncate text-[11px] font-bold uppercase"
              style={{ letterSpacing: ".05em", color: "var(--primary)" }}>
              {group.label}
            </span>
          </div>
          {groupRules.length > 0 && (
            <div className="flex flex-col gap-1.5 px-4 sm:px-5 py-2">
              {groupRules.map((s) => <RuleBanner key={s.rule.id} {...s} />)}
            </div>
          )}
          {group.lines.map((line) => {
            const row = participantId ? personRow(line, participantId) : null;
            const explicit = row?.pref_qty != null;
            const shown = effectivePref(line, participantId); // explicit answer or the item's default
            const sub = line.notes || line.item.notes || null;
            return (
              <div key={line.id} className="flex items-center gap-3 px-4 sm:px-5 py-2"
                style={{ borderTop: "1px solid var(--border)" }}>
                {/* unanswered marker — same accent as the sidebar badge; always
                    rendered (transparent when answered) so names stay aligned */}
                <span className="flex-none rounded-full" title={explicit ? undefined : "Needs your answer"}
                  style={{ width: 7, height: 7, background: explicit ? "transparent" : "var(--accent-600)" }} />
                <div className="flex-1 min-w-0">
                  <div className="truncate text-[14px] font-semibold" style={{ color: "var(--text)" }}>
                    {line.item.name}
                  </div>
                  {sub && <div className="truncate text-[12px]" style={{ color: "var(--text-3)" }}>{sub}</div>}
                </div>
                {line.item.pref_type === "bool" ? (
                  /* Yes/No — stored as 1/0 */
                  <select
                    value={shown == null ? "" : shown > 0 ? "yes" : "no"}
                    onChange={(e) => setPref(line, e.target.value === "" ? null : e.target.value === "yes" ? 1 : 0)}
                    className="w-[108px] flex-none rounded-[9px] px-2 py-1.5 text-[13.5px]"
                    style={{
                      background: "var(--surface)", border: "1px solid var(--border-strong)",
                      color: explicit ? "var(--text)" : "var(--text-3)",
                    }}
                  >
                    <option value="">—</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                ) : (
                  /* − [count] + stepper in the item's increment; typing still works */
                  <div className="flex items-stretch flex-none rounded-[9px] overflow-hidden"
                    style={{ border: "1px solid var(--border-strong)" }}>
                    <button onClick={() => bumpPref(line, -1)} title="Fewer (0 = none for me)"
                      className="grid place-items-center"
                      style={{ width: 30, background: "var(--surface-2)", color: "var(--text-2)", borderRight: "1px solid var(--border)" }}>
                      −
                    </button>
                    <input
                      key={`${line.id}-${participantId}-${shown ?? "ø"}`}
                      type="number" inputMode="decimal" min={0} step="any"
                      defaultValue={shown ?? ""}
                      placeholder="—"
                      onBlur={(e) => {
                        let v = e.target.value === "" ? null : Number(e.target.value);
                        if (v != null && line.item.pref_type === "int") v = Math.round(v);
                        // compare against the displayed value, so focusing and
                        // leaving an untouched default doesn't mark it answered
                        if (v !== shown) setPref(line, v);
                      }}
                      className="w-[46px] py-1.5 text-[13.5px] text-center gf-mono outline-none"
                      style={{
                        background: "var(--surface)", border: "none",
                        // muted while showing the un-answered default
                        color: explicit ? "var(--text)" : "var(--text-3)",
                      }}
                    />
                    <button onClick={() => bumpPref(line, 1)} title="More"
                      className="grid place-items-center"
                      style={{ width: 30, background: "var(--surface-2)", color: "var(--text-2)", borderLeft: "1px solid var(--border)" }}>
                      +
                    </button>
                  </div>
                )}
                {/* fixed-width unit slot so the inputs align down the column */}
                <span className="w-[64px] flex-none truncate text-[12px]"
                  title={line.effective_unit ?? undefined}
                  style={{ color: "var(--text-3)" }}>
                  {line.effective_unit ?? ""}
                </span>
              </div>
            );
          })}
        </div>
      );})}
    </Card>
  );
}
