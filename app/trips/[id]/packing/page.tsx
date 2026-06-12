"use client";

import { use, useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight, ClipboardList, Copy, DollarSign, Layers, Package, Pencil, Plus, Search, Trash2, Users } from "lucide-react";
import { Badge, Btn, Card, EmptyState, Field, ModalShell, SectionTitle, StatCard } from "@/components/ui";
import { GroupHeader, TypeHeader, useFoldState } from "@/components/collapsible";
import {
  type ItemDraft,
  ItemFields,
  SelectField,
  emptyItemDraft,
  itemBodyFromDraft,
  prefRuleOption,
} from "@/components/inventory-form";
import {
  api,
  INVENTORY_TYPES,
  type Box,
  type InventoryItem,
  type InventoryType,
  type PackCopyResult,
  type PackLine,
  type PackLineStatus,
  type PackPerson,
  type PackUnit,
  type Participant,
  type PrefRule,
  type QtyBasis,
  type QtyPeriod,
  type Segment,
  type Source,
  type Stay,
  type Trip,
  type TripLake,
} from "@/lib/api";
import { fmtQty, hintLabel, prefsAnswered, prefsTotal, sourceLabel, suggestQty, tripFacts, unitsTotal } from "@/lib/packing";

const STATUS_NEXT: Record<PackLineStatus, PackLineStatus> = {
  planned: "purchased",
  purchased: "packed",
  packed: "planned",
};
const STATUS_TONE: Record<PackLineStatus, "neutral" | "info" | "success"> = {
  planned: "neutral",
  purchased: "info",
  packed: "success",
};

function errMsg(e: unknown, fallback: string): string {
  return e && typeof e === "object" && "message" in e
    ? String((e as { message?: string }).message)
    : fallback;
}

export default function PackingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: tripId } = use(params);
  const [lines, setLines] = useState<PackLine[] | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [stays, setStays] = useState<Stay[]>([]);
  const [otherTrips, setOtherTrips] = useState<Trip[]>([]);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const [tripLakes, setTripLakes] = useState<TripLake[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [prefRules, setPrefRules] = useState<PrefRule[]>([]);
  const [typeFilter, setTypeFilter] = useState<"All" | InventoryType>("All");
  const [addOpen, setAddOpen] = useState(false);
  // Scope for a header-launched "Add" — pre-filters the browser and prefills creation.
  const [addScope, setAddScope] = useState<{ type: InventoryType; category: string | null; subcategory: string | null } | null>(null);
  const [editing, setEditing] = useState<PackLine | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const [boxesOpen, setBoxesOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  function reload() {
    api.get<PackLine[]>(`/trips/${tripId}/pack`).then(setLines).catch((e) => setError(errMsg(e, "Load failed")));
    api.get<InventoryItem[]>(`/inventory`).then(setInventory).catch(() => {});
  }

  useEffect(() => {
    reload();
    api.get<Participant[]>(`/trips/${tripId}/participants`).then(setParticipants).catch(() => {});
    api.get<Segment[]>(`/trips/${tripId}/segments`).then(setSegments).catch(() => {});
    api.get<Stay[]>(`/trips/${tripId}/stays`).then(setStays).catch(() => {});
    api.get<Box[]>(`/trips/${tripId}/boxes`).then(setBoxes).catch(() => {});
    api.get<TripLake[]>(`/trips/${tripId}/lakes`).then(setTripLakes).catch(() => {});
    api.get<Source[]>(`/sources`).then(setSources).catch(() => {});
    api.get<PrefRule[]>(`/pref-rules`).then(setPrefRules).catch(() => {});
    api.get<Trip[]>(`/trips`).then((ts) => setOtherTrips(ts.filter((t) => t.id !== tripId))).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  function toggleExpanded(lineId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
  }

  function replaceUnit(lineId: string, unit: PackUnit) {
    setLines((prev) =>
      prev?.map((l) =>
        l.id === lineId ? { ...l, units: l.units.map((u) => (u.id === unit.id ? unit : u)) } : l,
      ) ?? null,
    );
  }

  const facts = useMemo(() => tripFacts(participants.length, segments, stays), [participants, segments, stays]);
  const segName = useMemo(() => new Map(segments.map((s) => [s.id, s.name])), [segments]);
  const cabins = useMemo(
    () => tripLakes.flatMap((l) => l.cabins.map((c) => ({ id: c.id, name: tripLakes.length > 1 ? `${c.name} — ${l.name}` : c.name }))),
    [tripLakes],
  );

  /** "Belongs to" on the trip — a person's, a cabin's, or null = the group's. */
  function ownerLabel(line: PackLine): string | null {
    if (line.owner_participant_id) {
      return participants.find((p) => p.id === line.owner_participant_id)?.name ?? null;
    }
    if (line.owner_cabin_id) return cabins.find((c) => c.id === line.owner_cabin_id)?.name ?? null;
    return null;
  }

  /** Default "Packed by" for an item with a source: the source's responsible
   *  contact (Greg packs from his house, Dave packs what he buys), when that
   *  person is on this trip's roster. */
  function defaultPacker(item: InventoryItem): string | null {
    const contactId = item.source?.responsible_contact_id;
    if (!contactId) return null;
    return participants.find((p) => p.contact_id === contactId)?.id ?? null;
  }

  const filtered = useMemo(
    () => (lines ?? []).filter((l) => typeFilter === "All" || l.item.item_type === typeFilter),
    [lines, typeFilter],
  );

  /** type → category → subcategory ("" = none) → lines, in server order. */
  const grouped = useMemo(() => {
    const byType = new Map<string, Map<string, Map<string, PackLine[]>>>();
    for (const l of filtered) {
      const cats = byType.get(l.item.item_type) ?? new Map<string, Map<string, PackLine[]>>();
      const cat = l.item.category || "General";
      const subs = cats.get(cat) ?? new Map<string, PackLine[]>();
      const sub = l.item.subcategory || "";
      subs.set(sub, [...(subs.get(sub) ?? []), l]);
      cats.set(cat, subs);
      byType.set(l.item.item_type, cats);
    }
    return byType;
  }, [filtered]);

  const { isOpen: foldOpen, toggle, setMany } = useFoldState(`gf-packing-fold-${tripId}`);

  /** Every category/subcategory fold key inside one type's groups. */
  function groupKeys(type: string, cats: Map<string, Map<string, PackLine[]>>): string[] {
    const keys: string[] = [];
    for (const [cat, subs] of cats) {
      keys.push(`${type}|${cat}`);
      for (const sub of subs.keys()) if (sub) keys.push(`${type}|${cat}|${sub}`);
    }
    return keys;
  }

  function openAdd(scope: { type: InventoryType; category: string | null; subcategory: string | null } | null) {
    setAddScope(scope);
    setAddOpen(true);
  }

  const packedCount = (lines ?? []).filter((l) => l.status === "packed").length;
  const spent = (lines ?? []).reduce((sum, l) => sum + (l.cost ?? 0), 0);

  async function patchLine(line: PackLine, body: Record<string, unknown>) {
    try {
      const updated = await api.patch<PackLine>(`/trips/${tripId}/pack/${line.id}`, body);
      setLines((prev) => prev?.map((l) => (l.id === updated.id ? updated : l)) ?? null);
      return updated;
    } catch (e) {
      setError(errMsg(e, "Save failed"));
      return null;
    }
  }

  async function removeLine(line: PackLine) {
    if (!confirm(`Remove “${line.item.name}” from this trip's list? (It stays in your inventory.)`)) return;
    try {
      await api.del(`/trips/${tripId}/pack/${line.id}`);
      setLines((prev) => prev?.filter((l) => l.id !== line.id) ?? null);
    } catch (e) {
      setError(errMsg(e, "Delete failed"));
    }
  }

  async function addUnits(line: PackLine, count: number) {
    try {
      const created = await api.post<PackUnit[]>(`/trips/${tripId}/pack/${line.id}/units`, { count });
      setLines((prev) => prev?.map((l) => (l.id === line.id ? { ...l, units: [...l.units, ...created] } : l)) ?? null);
      setExpanded((prev) => new Set(prev).add(line.id));
    } catch (e) {
      setError(errMsg(e, "Couldn't add units"));
    }
  }

  async function patchUnit(line: PackLine, unit: PackUnit, body: Record<string, unknown>) {
    try {
      const updated = await api.patch<PackUnit>(`/trips/${tripId}/pack/units/${unit.id}`, body);
      replaceUnit(line.id, updated);
    } catch (e) {
      setError(errMsg(e, "Save failed"));
    }
  }

  async function deleteUnit(line: PackLine, unit: PackUnit) {
    try {
      await api.del(`/trips/${tripId}/pack/units/${unit.id}`);
      setLines((prev) => prev?.map((l) => (l.id === line.id ? { ...l, units: l.units.filter((u) => u.id !== unit.id) } : l)) ?? null);
    } catch (e) {
      setError(errMsg(e, "Delete failed"));
    }
  }

  async function assignUnit(line: PackLine, unit: PackUnit, segmentId: string, participantId: string | null) {
    try {
      const updated = await api.put<PackUnit>(`/trips/${tripId}/pack/units/${unit.id}/assignment`, {
        segment_id: segmentId, participant_id: participantId,
      });
      replaceUnit(line.id, updated);
    } catch (e) {
      setError(errMsg(e, "Save failed"));
    }
  }

  async function setPref(line: PackLine, participantId: string, prefQty: number | null) {
    try {
      const saved = await api.put<PackPerson>(`/trips/${tripId}/pack/people`, {
        pack_item_id: line.id, participant_id: participantId, pref_qty: prefQty,
      });
      setLines((prev) => prev?.map((l) => (l.id === line.id ? {
        ...l,
        people: [...l.people.filter((pp) => pp.id !== saved.id && pp.participant_id !== participantId), saved],
      } : l)) ?? null);
    } catch (e) {
      setError(errMsg(e, "Save failed"));
    }
  }

  async function copyFrom(sourceId: string) {
    try {
      const res = await api.post<PackCopyResult>(`/trips/${tripId}/pack/copy-from/${sourceId}`);
      setCopyOpen(false);
      reload();
      if (res.skipped > 0) setError(null);
    } catch (e) {
      setError(errMsg(e, "Copy failed"));
    }
  }

  const latestOther = otherTrips[0] ?? null; // /trips sorts newest first

  return (
    <div className="p-4 sm:p-7 max-w-[1240px] mx-auto">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <StatCard icon={ClipboardList} label="On the list" value={lines?.length ?? 0} />
        <StatCard icon={Check} label="Packed" value={`${packedCount} / ${lines?.length ?? 0}`} tone="primary" />
        <StatCard icon={DollarSign} label="Spent" value={spent > 0 ? `$${fmtQty(spent)}` : "—"}
          foot={spent > 0 ? "costs entered on lines" : "enter costs via Edit"} />
        <StatCard icon={Users} label="People × days" value={facts.personDays || "—"}
          foot={`${facts.people} people · ${facts.cabins} cabins · ${facts.boats} boats`} />
      </div>

      <SectionTitle
        right={
          <div className="flex flex-wrap gap-2">
            <Btn kind="ghost" icon={Package} onClick={() => setBoxesOpen(true)}>
              Boxes{boxes.length > 0 ? ` (${boxes.length})` : ""}
            </Btn>
            {otherTrips.length > 0 && (
              <Btn kind="ghost" icon={Copy} onClick={() => setCopyOpen(true)}>Copy from…</Btn>
            )}
            <Btn kind="accent" icon={Plus} onClick={() => openAdd(null)}>Add items</Btn>
          </div>
        }
      >
        Packing list
      </SectionTitle>

      {/* Type filter tabs */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {(["All", ...INVENTORY_TYPES] as const).map((t) => {
          const active = typeFilter === t;
          const count = t === "All" ? lines?.length ?? 0 : (lines ?? []).filter((l) => l.item.item_type === t).length;
          return (
            <button key={t} onClick={() => setTypeFilter(t)}
              className="px-3 py-1.5 rounded-full text-[13px] font-semibold"
              style={{
                background: active ? "var(--primary)" : "var(--surface)",
                color: active ? "var(--on-primary)" : "var(--text-2)",
                border: `1px solid ${active ? "transparent" : "var(--border)"}`,
              }}
            >
              {t} {count > 0 && <span style={{ opacity: 0.65 }}>{count}</span>}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="mb-4 rounded-[10px] px-3 py-2.5 text-[13px]"
          style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{error}</div>
      )}

      {lines === null ? (
        <div style={{ color: "var(--text-3)" }}>Loading…</div>
      ) : lines.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Nothing on the list yet"
          subtitle={latestOther
            ? `Most years start from the previous trip's list — copy ${latestOther.name}'s and adjust from there.`
            : "Add items from your master inventory, or create new ones as you go."}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {latestOther && (
                <Btn kind="accent" icon={Copy} onClick={() => copyFrom(latestOther.id)}>
                  Copy from {latestOther.name}
                </Btn>
              )}
              <Btn kind={latestOther ? "ghost" : "accent"} icon={Plus} onClick={() => openAdd(null)}>Add items</Btn>
            </div>
          } />
      ) : (
        <div className="flex flex-col gap-5">
          {INVENTORY_TYPES.filter((t) => grouped.has(t)).map((type) => {
            const cats = grouped.get(type)!;
            const typeCount = [...cats.values()].reduce(
              (n, subs) => n + [...subs.values()].reduce((m, g) => m + g.length, 0), 0,
            );
            const typeOpen = foldOpen(type, true);
            return (
            <Card key={type}>
              <TypeHeader label={type} count={typeCount} open={typeOpen}
                onToggle={() => toggle(type, true)}
                onSetAll={(open) => setMany(open ? [type, ...groupKeys(type, cats)] : groupKeys(type, cats), open)} />

              {typeOpen && (
              <div className="overflow-x-auto">
                <div style={{ minWidth: 760 }}>
                  {[...cats.entries()].map(([cat, subs]) => {
                    const catKey = `${type}|${cat}`;
                    const catCount = [...subs.values()].reduce((m, g) => m + g.length, 0);
                    const catOpen = foldOpen(catKey, false);
                    const namedSubKeys = [...subs.keys()].filter(Boolean).map((s) => `${catKey}|${s}`);
                    return (
                    <div key={cat}>
                      <GroupHeader level={1} label={cat} count={catCount} open={catOpen}
                        onToggle={() => toggle(catKey, false)}
                        onAdd={() => openAdd({ type, category: cat === "General" ? null : cat, subcategory: null })}
                        onSetAll={namedSubKeys.length > 0
                          // expanding opens the category too; collapsing keeps it
                          // open so the folded subcategory headers stay visible
                          ? (open) => setMany(open ? [catKey, ...namedSubKeys] : namedSubKeys, open)
                          : undefined} />
                      {catOpen && [...subs.entries()].map(([sub, group]) => {
                        const subKey = `${catKey}|${sub}`;
                        const subOpen = !sub || foldOpen(subKey, false);
                        return (
                        <div key={sub || "_"}>
                          {sub && (
                            <GroupHeader level={2} label={sub} count={group.length} open={subOpen}
                              onToggle={() => toggle(subKey, false)}
                              onAdd={() => openAdd({ type, category: cat === "General" ? null : cat, subcategory: sub })} />
                          )}
                          {subOpen && group.map((line) => {
                        // Prefs lines suggest the sum of member answers; everything else from the hint.
                        const suggestion = line.item.collect_prefs
                          ? (prefsAnswered(line) > 0 ? prefsTotal(line) : null)
                          : suggestQty(line.item, line.segment_id ? tripFacts(participants.length, segments, stays, line.segment_id) : facts);
                        const itemized = line.units.length > 0;
                        const unitQty = unitsTotal(line.units);
                        const owner = ownerLabel(line);
                        const isOpen = expanded.has(line.id);
                        return (
                          <div key={line.id}>
                          <div className="grid items-center px-4 sm:px-5 py-2"
                            style={{ gridTemplateColumns: "minmax(220px,2fr) 150px 130px minmax(140px,1fr) 110px 100px", gap: 10 }}>
                            {/* name + hint */}
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="truncate text-[14px] font-semibold" style={{ color: "var(--text)" }}>{line.item.name}</span>
                                {line.item.is_spare && <Badge tone="warning">Spare</Badge>}
                                {line.item.collect_prefs && <Badge tone="info">Prefs</Badge>}
                                {line.segment_id && <Badge tone="info">{segName.get(line.segment_id) ?? "Week"}</Badge>}
                                {owner && <Badge tone="neutral">{owner}&rsquo;s</Badge>}
                              </div>
                              {(line.cost != null || line.notes || line.item.notes || hintLabel(line.item)) && (
                                <div className="truncate text-[12px] mt-0.5" style={{ color: "var(--text-3)" }}>
                                  {[line.cost != null ? `$${fmtQty(line.cost)}` : null,
                                    line.notes || line.item.notes || hintLabel(line.item)]
                                    .filter(Boolean).join(" · ")}
                                </div>
                              )}
                            </div>

                            {/* qty — itemized lines count their units instead */}
                            {itemized ? (
                              <button onClick={() => toggleExpanded(line.id)}
                                className="inline-flex items-center gap-1.5 rounded-[9px] px-2 py-1.5 text-[13px] font-semibold w-fit"
                                style={{ background: "var(--accent-100)", color: "var(--accent-600)", border: "1px solid transparent" }}
                                title="Show the individual units">
                                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                {unitQty === line.units.length
                                  ? `${line.units.length} units`
                                  : `${fmtQty(unitQty)} in ${line.units.length}`}
                                {suggestion != null && unitQty === Math.round(suggestion) && <Check size={13} />}
                              </button>
                            ) : (
                            <div className="flex items-baseline gap-1.5">
                              <input
                                type="number" inputMode="decimal" min={0} step="any"
                                value={line.quantity ?? ""}
                                placeholder={suggestion != null ? fmtQty(suggestion) : "—"}
                                onChange={(e) => {
                                  const v = e.target.value === "" ? null : Number(e.target.value);
                                  setLines((prev) => prev?.map((l) => (l.id === line.id ? { ...l, quantity: v } : l)) ?? null);
                                }}
                                onBlur={(e) => {
                                  const v = e.target.value === "" ? null : Number(e.target.value);
                                  if (v !== line.quantity) void patchLine(line, { quantity: v });
                                }}
                                className="w-[64px] rounded-[9px] px-2 py-1.5 text-[13.5px] text-right gf-mono outline-none"
                                style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", color: line.quantity == null ? "var(--text-3)" : "var(--text)" }}
                              />
                              {line.item.collect_prefs ? (
                                <button onClick={() => toggleExpanded(line.id)}
                                  title="Member prefs — who wants how many"
                                  className="text-[12px] font-semibold flex-none rounded-full px-2 py-0.5"
                                  style={{ background: "var(--accent-100)", color: "var(--accent-600)" }}>
                                  {prefsAnswered(line)}/{participants.length} prefs
                                </button>
                              ) : (
                              <span className="text-[12px] truncate" style={{ color: "var(--text-3)" }}>
                                {line.effective_unit || (line.quantity == null && suggestion != null ? "suggested" : "")}
                              </span>
                              )}
                            </div>
                            )}

                            {/* personal vs shared — display only; the rare per-trip
                                flip lives in Edit ("Personal (override)") */}
                            <span
                              className="inline-flex w-fit items-center rounded-full px-2.5 py-1 text-[11.5px] font-bold"
                              title={line.personal != null
                                ? "Overridden for this trip — change in Edit"
                                : "From the inventory item — change in Edit"}
                              style={{
                                background: "var(--surface-2)",
                                border: `1px solid ${line.personal != null ? "var(--accent)" : "var(--border)"}`,
                                color: "var(--text-2)",
                              }}
                            >
                              {line.effective_personal ? "Personal" : "Shared"}
                            </span>

                            {/* packed-by (shared) / people summary (personal) */}
                            {!line.effective_personal ? (
                              <select
                                value={line.assignee_participant_id ?? ""}
                                onChange={(e) => void patchLine(line, { assignee_participant_id: e.target.value || null })}
                                title="Who packs this — ownership lives in Edit"
                                className="rounded-[9px] px-2 py-1.5 text-[12.5px] w-full min-w-0"
                                style={{
                                  background: "var(--surface)", border: "1px solid var(--border)",
                                  color: line.assignee_participant_id ? "var(--text)" : "var(--text-3)",
                                }}
                              >
                                <option value="">Packed by —</option>
                                {participants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                              </select>
                            ) : (
                              <span className="text-[12.5px] truncate" style={{ color: "var(--text-3)" }}>
                                {line.item.source?.kind === "storage"
                                  ? `At ${line.item.source.name} for each person`
                                  : "Everyone brings their own"}
                                {line.people.filter((pp) => pp.packed).length > 0 &&
                                  ` · ${line.people.filter((pp) => pp.packed).length}/${participants.length} packed`}
                              </span>
                            )}

                            {/* status */}
                            <button onClick={() => void patchLine(line, { status: STATUS_NEXT[line.status] })} title="Click to advance">
                              <Badge tone={STATUS_TONE[line.status]}>{line.status}</Badge>
                            </button>

                            {/* row actions */}
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => toggleExpanded(line.id)}
                                title={line.item.collect_prefs ? "Member prefs — who wants how many"
                                  : itemized ? "Show units" : "Itemize — label, assign, and box individual units"}
                                className="grid place-items-center"
                                style={{
                                  width: 28, height: 28, borderRadius: 7,
                                  background: isOpen ? "var(--accent-100)" : "var(--surface-2)",
                                  border: "1px solid var(--border)",
                                  color: isOpen ? "var(--accent-600)" : "var(--text-2)",
                                }}>
                                <Layers size={13} />
                              </button>
                              <button onClick={() => setEditing(line)} title="Edit"
                                className="grid place-items-center"
                                style={{ width: 28, height: 28, borderRadius: 7, background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
                                <Pencil size={13} />
                              </button>
                              <button onClick={() => void removeLine(line)} title="Remove from trip"
                                className="grid place-items-center"
                                style={{ width: 28, height: 28, borderRadius: 7, background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>

                          {isOpen && line.item.collect_prefs && (
                            <PrefsPanel
                              line={line}
                              participants={participants}
                              onSet={(pid, qty) => void setPref(line, pid, qty)}
                            />
                          )}
                          {isOpen && !line.item.collect_prefs && (
                            <UnitPanel
                              line={line}
                              segments={line.segment_id ? segments.filter((s) => s.id === line.segment_id) : segments}
                              participants={participants}
                              stays={stays}
                              boxes={boxes}
                              cabins={cabins}
                              suggestion={suggestion}
                              onAdd={(count) => void addUnits(line, count)}
                              onPatch={(unit, body) => void patchUnit(line, unit, body)}
                              onDelete={(unit) => void deleteUnit(line, unit)}
                              onAssign={(unit, segId, pid) => void assignUnit(line, unit, segId, pid)}
                            />
                          )}
                          </div>
                          );
                          })}
                        </div>
                        );
                      })}
                    </div>
                    );
                  })}
                  <div className="pb-2" />
                </div>
              </div>
              )}
            </Card>
            );
          })}
        </div>
      )}

      {addOpen && (
        <AddItemsModal
          tripId={tripId}
          inventory={inventory}
          lines={lines ?? []}
          initial={addScope}
          sources={sources}
          prefRules={prefRules}
          defaultPacker={defaultPacker}
          onAdded={(line, item) => {
            setLines((prev) => (prev ? [...prev, line] : [line]));
            if (!inventory.some((i) => i.id === item.id)) setInventory((prev) => [...prev, item]);
          }}
          onClose={() => setAddOpen(false)}
        />
      )}

      {boxesOpen && (
        <BoxesModal
          tripId={tripId}
          boxes={boxes}
          setBoxes={setBoxes}
          tripLakes={tripLakes}
          onClose={() => setBoxesOpen(false)}
        />
      )}

      {editing && (
        <EditLineModal
          line={editing}
          segments={segments}
          participants={participants}
          boxes={boxes}
          cabins={cabins}
          sources={sources}
          prefRules={prefRules}
          onSave={async (lineBody, itemBody) => {
            let ok = true;
            if (Object.keys(itemBody).length > 0) {
              try {
                const item = await api.patch<InventoryItem>(`/inventory/${editing.inventory_item_id}`, itemBody);
                // Re-resolve the inherited values on every line of this item.
                setLines((prev) => prev?.map((l) => (l.inventory_item_id === item.id ? {
                  ...l, item,
                  effective_unit: l.unit ?? item.default_unit,
                  effective_personal: l.personal ?? item.is_personal,
                } : l)) ?? null);
                setInventory((prev) => prev.map((i) => (i.id === item.id ? item : i)));
              } catch (e) {
                setError(errMsg(e, "Couldn't update the inventory item (only its owner can)"));
                ok = false;
              }
            }
            if (Object.keys(lineBody).length > 0) {
              const updated = await patchLine(editing, lineBody);
              ok = ok && updated !== null;
            }
            if (ok) setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}

      {copyOpen && (
        <ModalShell title="Copy packing list" subtitle="Re-links the same inventory items; quantities and responsibilities carry over, progress resets." onClose={() => setCopyOpen(false)}>
          <div className="flex flex-col gap-2">
            {otherTrips.map((t) => (
              <button key={t.id} onClick={() => void copyFrom(t.id)}
                className="flex items-center justify-between rounded-[11px] px-4 py-3 text-left"
                style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                <span className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>{t.name}</span>
                <Copy size={15} style={{ color: "var(--text-3)" }} />
              </button>
            ))}
          </div>
        </ModalShell>
      )}
    </div>
  );
}

/* ---- Prefs: who wants how many, gathered before the trip --------------------
   Each member answers on their My-list page; the organizer sees (and can fill
   in) the grid here. Blank = hasn't answered, 0 = none for me; the sum is the
   line's suggested quantity. */
function PrefsPanel({ line, participants, onSet }: {
  line: PackLine;
  participants: Participant[];
  onSet: (participantId: string, prefQty: number | null) => void;
}) {
  const answered = prefsAnswered(line);
  return (
    <div className="px-4 sm:px-5 pb-3">
      <div className="rounded-[12px] px-3 py-2"
        style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
        <div className="flex items-center justify-between py-1 text-[11px] font-bold uppercase"
          style={{ letterSpacing: ".05em", color: "var(--text-3)" }}>
          <span>Prefs — how many does each person want?</span>
          <span className="gf-mono">
            {answered}/{participants.length} answered · total {fmtQty(prefsTotal(line))}
            {line.effective_unit ? ` ${line.effective_unit}` : ""}
          </span>
        </div>
        <div className="grid gap-x-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))" }}>
          {participants.map((p) => {
            const row = line.people.find((pp) => pp.participant_id === p.id);
            return (
              <div key={p.id} className="flex items-center justify-between gap-2 py-1.5"
                style={{ borderTop: "1px solid var(--border)" }}>
                <span className="truncate text-[13px]" style={{ color: "var(--text)" }}>{p.name}</span>
                <input
                  type="number" inputMode="decimal" min={0} step="any"
                  defaultValue={row?.pref_qty ?? ""}
                  placeholder="—"
                  onBlur={(e) => {
                    const v = e.target.value === "" ? null : Number(e.target.value);
                    if (v !== (row?.pref_qty ?? null)) onSet(p.id, v);
                  }}
                  className="w-[56px] flex-none rounded-[8px] px-2 py-1 text-[13px] text-right gf-mono outline-none"
                  style={{
                    background: "var(--surface)", border: "1px solid var(--border)",
                    color: row?.pref_qty == null ? "var(--text-3)" : "var(--text)",
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---- Units: the itemized breakdown of one line ------------------------------
   A unit is a labeled physical thing (a dry bag, qty blank = 1) or a split
   portion ("12 of the 24 batteries" for one cabin). Person ownership is the
   per-week selects (the handoff); cabin ownership is the Cabin column. */
function UnitPanel({
  line, segments, participants, stays, boxes, cabins, suggestion, onAdd, onPatch, onDelete, onAssign,
}: {
  line: PackLine;
  segments: Segment[];
  participants: Participant[];
  stays: Stay[];
  boxes: Box[];
  cabins: { id: string; name: string }[];
  suggestion: number | null;
  onAdd: (count: number) => void;
  onPatch: (unit: PackUnit, body: Record<string, unknown>) => void;
  onDelete: (unit: PackUnit) => void;
  onAssign: (unit: PackUnit, segmentId: string, participantId: string | null) => void;
}) {
  const attendees = useMemo(() => {
    const m = new Map<string, Participant[]>();
    for (const seg of segments) {
      const ids = new Set(stays.filter((s) => s.segment_id === seg.id).map((s) => s.participant_id));
      m.set(seg.id, participants.filter((p) => ids.has(p.id)));
    }
    return m;
  }, [segments, participants, stays]);

  const remaining = suggestion != null ? Math.max(0, Math.round(suggestion) - unitsTotal(line.units)) : 0;
  const cols = `minmax(120px,1.2fr) 58px repeat(${segments.length}, minmax(120px,1fr)) 130px 130px 34px`;

  return (
    <div className="px-4 sm:px-5 pb-3">
      <div className="rounded-[12px] px-3 py-2"
        style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
        {line.units.length > 0 && (
          <div className="grid items-center gap-2 py-1 text-[11px] font-bold uppercase"
            style={{ gridTemplateColumns: cols, letterSpacing: ".05em", color: "var(--text-3)" }}>
            <span>Unit</span>
            <span>Qty</span>
            {segments.map((s) => <span key={s.id}>{s.name}</span>)}
            <span>Cabin</span>
            <span>Box</span>
            <span />
          </div>
        )}
        {line.units.map((unit) => (
          <div key={unit.id} className="grid items-center gap-2 py-1.5"
            style={{ gridTemplateColumns: cols, borderTop: "1px solid var(--border)" }}>
            <input
              defaultValue={unit.label ?? ""}
              placeholder="Label — Blue, Ron's…"
              onBlur={(e) => {
                const v = e.target.value.trim() || null;
                if (v !== unit.label) onPatch(unit, { label: v });
              }}
              className="rounded-[8px] px-2 py-1.5 text-[13px] outline-none min-w-0"
              style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}
            />
            <input
              type="number" inputMode="decimal" min={0} step="any"
              defaultValue={unit.quantity ?? ""}
              placeholder="1"
              title="Portion quantity — blank = one physical unit"
              onBlur={(e) => {
                const v = e.target.value === "" ? null : Number(e.target.value);
                if (v !== unit.quantity) onPatch(unit, { quantity: v });
              }}
              className="rounded-[8px] px-2 py-1.5 text-[13px] text-right gf-mono outline-none min-w-0"
              style={{ background: "var(--surface)", border: "1px solid var(--border)", color: unit.quantity == null ? "var(--text-3)" : "var(--text)" }}
            />
            {segments.map((seg) => {
              const assigned = unit.assignments.find((a) => a.segment_id === seg.id);
              return (
                <select key={seg.id}
                  value={assigned?.participant_id ?? ""}
                  onChange={(e) => onAssign(unit, seg.id, e.target.value || null)}
                  className="rounded-[8px] px-2 py-1.5 text-[12.5px] min-w-0"
                  style={{
                    background: "var(--surface)", border: "1px solid var(--border)",
                    color: assigned ? "var(--text)" : "var(--text-3)",
                  }}
                >
                  <option value="">—</option>
                  {(attendees.get(seg.id) ?? []).map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              );
            })}
            <select
              value={unit.cabin_id ?? ""}
              onChange={(e) => onPatch(unit, { cabin_id: e.target.value || null })}
              title="Cabin this portion belongs to"
              className="rounded-[8px] px-2 py-1.5 text-[12.5px] min-w-0"
              style={{
                background: "var(--surface)", border: "1px solid var(--border)",
                color: unit.cabin_id ? "var(--text)" : "var(--text-3)",
              }}
            >
              <option value="">No cabin</option>
              {cabins.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select
              value={unit.box_id ?? ""}
              onChange={(e) => onPatch(unit, { box_id: e.target.value || null })}
              className="rounded-[8px] px-2 py-1.5 text-[12.5px] min-w-0"
              style={{
                background: "var(--surface)", border: "1px solid var(--border)",
                color: unit.box_id ? "var(--text)" : "var(--text-3)",
              }}
            >
              <option value="">No box</option>
              {boxes.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
            </select>
            <button onClick={() => onDelete(unit)} title="Remove unit"
              className="grid place-items-center"
              style={{ width: 26, height: 26, borderRadius: 7, background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
              <Trash2 size={12} />
            </button>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-3 py-1.5"
          style={{ borderTop: line.units.length > 0 ? "1px solid var(--border)" : "none" }}>
          <button onClick={() => onAdd(1)}
            className="inline-flex items-center gap-1 text-[12.5px] font-semibold"
            style={{ color: "var(--accent-600)" }}>
            <Plus size={13} /> Add unit
          </button>
          {remaining > 0 && (
            <button onClick={() => onAdd(remaining)}
              className="text-[12.5px] font-semibold"
              style={{ color: "var(--accent-600)" }}>
              Create {remaining} more (suggested {fmtQty(suggestion!)})
            </button>
          )}
          {line.units.length === 0 && (
            <span className="text-[12px]" style={{ color: "var(--text-3)" }}>
              Units get a label, per-week person, cabin, and box — dry bags handed off at the swap, or &ldquo;12 per cabin&rdquo; splits (set Qty).
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---- Boxes: numbered containers, each tied to a cabin ----------------------- */
function BoxesModal({
  tripId, boxes, setBoxes, tripLakes, onClose,
}: {
  tripId: string;
  boxes: Box[];
  setBoxes: (fn: (prev: Box[]) => Box[]) => void;
  tripLakes: TripLake[];
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const cabins = useMemo(
    () => tripLakes.flatMap((l) => l.cabins.map((c) => ({ id: c.id, name: tripLakes.length > 1 ? `${c.name} — ${l.name}` : c.name }))),
    [tripLakes],
  );

  async function addBox() {
    try {
      const created = await api.post<Box>(`/trips/${tripId}/boxes`, {
        label: `Box ${boxes.length + 1}`, sort_order: boxes.length,
      });
      setBoxes((prev) => [...prev, created]);
    } catch (e) {
      setError(errMsg(e, "Couldn't add the box"));
    }
  }

  async function patchBox(box: Box, body: Record<string, unknown>) {
    try {
      const updated = await api.patch<Box>(`/trips/${tripId}/boxes/${box.id}`, body);
      setBoxes((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
    } catch (e) {
      setError(errMsg(e, "Save failed"));
    }
  }

  async function deleteBox(box: Box) {
    if (!confirm(`Delete ${box.label}? Items pointing at it just lose their box.`)) return;
    try {
      await api.del(`/trips/${tripId}/boxes/${box.id}`);
      setBoxes((prev) => prev.filter((b) => b.id !== box.id));
    } catch (e) {
      setError(errMsg(e, "Delete failed"));
    }
  }

  return (
    <ModalShell
      title="Boxes"
      subtitle="Numbered containers for the trip up — label each with the cabin it belongs to."
      maxWidth={520}
      onClose={onClose}
      footer={<Btn kind="subtle" icon={Plus} className="mr-auto" onClick={() => void addBox()}>Add box</Btn>}
    >
      {error && (
        <div className="mb-3 rounded-[10px] px-3 py-2 text-[13px]"
          style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{error}</div>
      )}
      {boxes.length === 0 ? (
        <div className="py-6 text-center text-[13.5px]" style={{ color: "var(--text-3)" }}>
          No boxes yet — add one, then assign items (or itemized units) to it from the list.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {boxes.map((box) => (
            <div key={box.id} className="flex items-center gap-2">
              <input
                defaultValue={box.label}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== box.label) void patchBox(box, { label: v });
                }}
                className="flex-1 min-w-0 rounded-[9px] px-2.5 py-2 text-[13.5px] font-semibold outline-none"
                style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", color: "var(--text)" }}
              />
              <select
                value={box.cabin_id ?? ""}
                onChange={(e) => void patchBox(box, { cabin_id: e.target.value || null })}
                className="rounded-[9px] px-2 py-2 text-[13px] w-[180px]"
                style={{
                  background: "var(--surface)", border: "1px solid var(--border)",
                  color: box.cabin_id ? "var(--text)" : "var(--text-3)",
                }}
              >
                <option value="">No cabin</option>
                {cabins.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button onClick={() => void deleteBox(box)} title="Delete box"
                className="grid place-items-center flex-none"
                style={{ width: 30, height: 30, borderRadius: 8, background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </ModalShell>
  );
}

/* ---- Add items: search the master inventory, Instacart-style --------------- */
function AddItemsModal({
  tripId, inventory, lines, initial, sources, prefRules, defaultPacker, onAdded, onClose,
}: {
  tripId: string;
  inventory: InventoryItem[];
  lines: PackLine[];
  /** Header-launched adds arrive pre-scoped to a category/subcategory. */
  initial: { type: InventoryType; category: string | null; subcategory: string | null } | null;
  sources: Source[];
  prefRules: PrefRule[];
  /** Resolves an item's source-responsible contact to a roster row — the
   *  materialized "Packed by" default for new lines. */
  defaultPacker: (item: InventoryItem) => string | null;
  onAdded: (line: PackLine, item: InventoryItem) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"All" | InventoryType>(initial?.type ?? "All");
  const [catFilter, setCatFilter] = useState<string | null>(initial?.category ?? null);
  const [subFilter, setSubFilter] = useState<string | null>(initial?.subcategory ?? null);
  const [creating, setCreating] = useState<ItemDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const onList = useMemo(() => new Set(lines.map((l) => l.inventory_item_id)), [lines]);

  const q = query.trim().toLowerCase();
  const results = useMemo(
    () =>
      inventory
        .filter((i) => !i.archived)
        .filter((i) => typeFilter === "All" || i.item_type === typeFilter)
        .filter((i) => !catFilter || i.category === catFilter)
        .filter((i) => !subFilter || i.subcategory === subFilter)
        .filter((i) =>
          !q ||
          i.name.toLowerCase().includes(q) ||
          (i.category ?? "").toLowerCase().includes(q) ||
          (i.subcategory ?? "").toLowerCase().includes(q),
        ),
    [inventory, typeFilter, catFilter, subFilter, q],
  );

  function startCreate() {
    setCreating({
      ...emptyItemDraft(query, typeFilter === "All" ? "Gear" : typeFilter),
      category: catFilter ?? "",
      subcategory: subFilter ?? "",
    });
  }

  async function add(item: InventoryItem) {
    try {
      const line = await api.post<PackLine>(`/trips/${tripId}/pack`, {
        inventory_item_id: item.id,
        // Stored items default to being packed by the location's responsible
        // person (materialized — editable per line afterwards).
        assignee_participant_id: defaultPacker(item),
      });
      onAdded(line, item);
    } catch (e) {
      setError(errMsg(e, "Couldn't add the item"));
    }
  }

  async function createAndAdd(draft: ItemDraft) {
    try {
      const src = sources.find((x) => x.id === draft.sourceId);
      const line = await api.post<PackLine>(`/trips/${tripId}/pack`, {
        new_item: itemBodyFromDraft(draft),
        assignee_participant_id: src
          ? defaultPacker({ source: src } as InventoryItem)
          : null,
      });
      onAdded(line, line.item);
      setCreating(null);
      setQuery("");
    } catch (e) {
      setError(errMsg(e, "Couldn't create the item"));
    }
  }

  return (
    <ModalShell
      title="Add items"
      subtitle="Search your master inventory — new items are saved to it for next year."
      maxWidth={640}
      onClose={onClose}
      footer={!creating && (
        <Btn kind="subtle" icon={Plus} className="mr-auto" onClick={startCreate}>
          New inventory item{query.trim() ? ` “${query.trim()}”` : ""}
        </Btn>
      )}
    >
      {creating ? (
        <NewItemForm draft={creating} setDraft={setCreating} error={error} sources={sources}
          prefRules={prefRules} onCancel={() => setCreating(null)} onSubmit={() => void createAndAdd(creating)} />
      ) : (
        <div className="flex flex-col gap-3">
          <Field icon={Search} value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or category…" autoFocus />
          <div className="flex flex-wrap items-center gap-1.5">
            {(["All", ...INVENTORY_TYPES] as const).map((t) => (
              <button key={t}
                onClick={() => {
                  setTypeFilter(t);
                  // a different type makes the category scope meaningless
                  if (t !== typeFilter) { setCatFilter(null); setSubFilter(null); }
                }}
                className="px-2.5 py-1 rounded-full text-[12.5px] font-semibold"
                style={{
                  background: typeFilter === t ? "var(--primary)" : "var(--surface-2)",
                  color: typeFilter === t ? "var(--on-primary)" : "var(--text-2)",
                  border: "1px solid var(--border)",
                }}
              >
                {t}
              </button>
            ))}
            {catFilter && (
              <button onClick={() => { setCatFilter(null); setSubFilter(null); }}
                title="Clear category filter"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[12.5px] font-semibold"
                style={{ background: "var(--accent-100)", color: "var(--accent-600)", border: "1px solid transparent" }}>
                {catFilter}{subFilter ? ` / ${subFilter}` : ""} ✕
              </button>
            )}
          </div>

          {error && (
            <div className="rounded-[10px] px-3 py-2 text-[13px]"
              style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{error}</div>
          )}

          <div className="flex flex-col">
            {results.map((item) => {
              const added = onList.has(item.id);
              const path = [item.item_type, item.category, item.subcategory].filter(Boolean).join(" / ");
              return (
                <div key={item.id} className="flex items-center gap-3 py-2.5" style={{ borderBottom: "1px solid var(--border)" }}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="truncate text-[14px] font-semibold" style={{ color: "var(--text)" }}>{item.name}</span>
                      {item.is_spare && <Badge tone="warning">Spare</Badge>}
                    </div>
                    <div className="truncate text-[12px]" style={{ color: "var(--text-3)" }}>
                      {path}{hintLabel(item) ? ` · ${hintLabel(item)}` : ""}
                    </div>
                  </div>
                  {added ? (
                    <Badge tone="success">On the list</Badge>
                  ) : (
                    <Btn kind="subtle" size="sm" icon={Plus} onClick={() => void add(item)}>Add</Btn>
                  )}
                </div>
              );
            })}
            {results.length === 0 && (
              <div className="py-6 text-center text-[13.5px]" style={{ color: "var(--text-3)" }}>
                No inventory matches{query ? ` “${query.trim()}”` : ""} — create it below.
              </div>
            )}
          </div>
        </div>
      )}
    </ModalShell>
  );
}

function NewItemForm({
  draft, setDraft, error, sources, prefRules, onCancel, onSubmit,
}: {
  draft: ItemDraft;
  setDraft: (d: ItemDraft) => void;
  error: string | null;
  sources: Source[];
  prefRules: PrefRule[];
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <ItemFields draft={draft} setDraft={setDraft} autoFocusName sources={sources} prefRules={prefRules} />
      {error && (
        <div className="rounded-[10px] px-3 py-2 text-[13px]"
          style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{error}</div>
      )}
      <div className="flex justify-end gap-2 mt-1">
        <Btn kind="ghost" onClick={onCancel}>Back to search</Btn>
        <Btn kind="accent" icon={Plus} disabled={!draft.name.trim()} onClick={onSubmit}>Create &amp; add to trip</Btn>
      </div>
    </div>
  );
}

/* ---- Edit one line (+ its master inventory item) --------------------------- */
function EditLineModal({
  line, segments, participants, boxes, cabins, sources, prefRules, onSave, onClose,
}: {
  line: PackLine;
  segments: Segment[];
  participants: Participant[];
  boxes: Box[];
  cabins: { id: string; name: string }[];
  sources: Source[];
  prefRules: PrefRule[];
  onSave: (lineBody: Record<string, unknown>, itemBody: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
}) {
  // Trip-level fields. unit/personal are the raw overrides — "" = inherit.
  const [qty, setQty] = useState(line.quantity == null ? "" : String(line.quantity));
  const [unit, setUnit] = useState(line.unit ?? "");
  const [personal, setPersonal] = useState(
    line.personal == null ? "" : line.personal ? "personal" : "shared",
  );
  const [assignee, setAssignee] = useState(line.assignee_participant_id ?? "");
  // One "Belongs to" select encodes both owner FKs: "" = the group's.
  const [owner, setOwner] = useState(
    line.owner_participant_id ? `p:${line.owner_participant_id}`
      : line.owner_cabin_id ? `c:${line.owner_cabin_id}` : "",
  );
  const [segmentId, setSegmentId] = useState(line.segment_id ?? "");
  const [boxId, setBoxId] = useState(line.box_id ?? "");
  // Cost capture for the balance sheet. Entering a cost with no payer assumes
  // the packer fronted it.
  const [cost, setCost] = useState(line.cost == null ? "" : String(line.cost));
  const [paidBy, setPaidBy] = useState(line.paid_by_participant_id ?? "");
  const [notes, setNotes] = useState(line.notes ?? "");
  // Master item fields (saved back to the inventory catalog).
  const [name, setName] = useState(line.item.name);
  const [itemType, setItemType] = useState<InventoryType>(line.item.item_type);
  const [category, setCategory] = useState(line.item.category ?? "");
  const [subcategory, setSubcategory] = useState(line.item.subcategory ?? "");
  const [defUnit, setDefUnit] = useState(line.item.default_unit ?? "");
  const [isPersonal, setIsPersonal] = useState(line.item.is_personal);
  const [isSpare, setIsSpare] = useState(line.item.is_spare);
  const [collectPrefs, setCollectPrefs] = useState(line.item.collect_prefs);
  const [prefRuleId, setPrefRuleId] = useState(line.item.pref_rule_id ?? "");
  const [defQty, setDefQty] = useState(line.item.default_qty == null ? "" : String(line.item.default_qty));
  const [basis, setBasis] = useState<QtyBasis>(line.item.qty_basis);
  const [period, setPeriod] = useState<QtyPeriod>(line.item.qty_period);
  const [sourceId, setSourceId] = useState(line.item.source_id ?? "");
  const [itemNotes, setItemNotes] = useState(line.item.notes ?? "");
  const [busy, setBusy] = useState(false);

  function diff(): { lineBody: Record<string, unknown>; itemBody: Record<string, unknown> } {
    const lineBody: Record<string, unknown> = {};
    const nQty = qty === "" ? null : Number(qty);
    if (nQty !== line.quantity) lineBody.quantity = nQty;
    if ((unit.trim() || null) !== line.unit) lineBody.unit = unit.trim() || null;
    const nPersonal = personal === "" ? null : personal === "personal";
    if (nPersonal !== line.personal) lineBody.personal = nPersonal;
    if ((assignee || null) !== line.assignee_participant_id) lineBody.assignee_participant_id = assignee || null;
    const ownerP = owner.startsWith("p:") ? owner.slice(2) : null;
    const ownerC = owner.startsWith("c:") ? owner.slice(2) : null;
    if (ownerP !== line.owner_participant_id || ownerC !== line.owner_cabin_id) {
      lineBody.owner_participant_id = ownerP;
      lineBody.owner_cabin_id = ownerC;
    }
    if ((segmentId || null) !== line.segment_id) lineBody.segment_id = segmentId || null;
    if ((boxId || null) !== line.box_id) lineBody.box_id = boxId || null;
    const nCost = cost === "" ? null : Number(cost);
    if (nCost !== line.cost) lineBody.cost = nCost;
    const nPaidBy = paidBy || (nCost != null ? assignee : "") || null;
    if (nPaidBy !== line.paid_by_participant_id) lineBody.paid_by_participant_id = nPaidBy;
    if ((notes || null) !== line.notes) lineBody.notes = notes || null;

    const itemBody: Record<string, unknown> = {};
    if (name.trim() && name.trim() !== line.item.name) itemBody.name = name.trim();
    if (itemType !== line.item.item_type) itemBody.item_type = itemType;
    if ((category.trim() || null) !== line.item.category) itemBody.category = category.trim() || null;
    if ((subcategory.trim() || null) !== line.item.subcategory) itemBody.subcategory = subcategory.trim() || null;
    if ((defUnit.trim() || null) !== line.item.default_unit) itemBody.default_unit = defUnit.trim() || null;
    if (isPersonal !== line.item.is_personal) itemBody.is_personal = isPersonal;
    if (isSpare !== line.item.is_spare) itemBody.is_spare = isSpare;
    if (collectPrefs !== line.item.collect_prefs) itemBody.collect_prefs = collectPrefs;
    const nRule = collectPrefs ? prefRuleId || null : null;
    if (nRule !== line.item.pref_rule_id) itemBody.pref_rule_id = nRule;
    const nDefQty = defQty === "" ? null : Number(defQty);
    if (nDefQty !== line.item.default_qty) itemBody.default_qty = nDefQty;
    if (basis !== line.item.qty_basis) itemBody.qty_basis = basis;
    if (period !== line.item.qty_period) itemBody.qty_period = period;
    if ((sourceId || null) !== line.item.source_id) itemBody.source_id = sourceId || null;
    if ((itemNotes.trim() || null) !== line.item.notes) itemBody.notes = itemNotes.trim() || null;
    return { lineBody, itemBody };
  }

  return (
    <ModalShell
      title={`Edit “${line.item.name}”`}
      maxWidth={620}
      onClose={onClose}
      footer={
        <>
          <Btn kind="ghost" onClick={onClose}>Cancel</Btn>
          <Btn kind="accent" disabled={busy} onClick={async () => {
            setBusy(true);
            const { lineBody, itemBody } = diff();
            await onSave(lineBody, itemBody);
            setBusy(false);
          }}>
            {busy ? "Saving…" : "Save"}
          </Btn>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="text-[12px] font-bold uppercase" style={{ letterSpacing: ".05em", color: "var(--text-3)" }}>
          Inventory item <span className="normal-case font-normal" style={{ letterSpacing: 0 }}>— applies everywhere this item is used</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <SelectField label="Type" value={itemType} onChange={(v) => setItemType(v as InventoryType)}
            options={INVENTORY_TYPES.map((t) => [t, t])} />
          <Field label="Category" value={category} onChange={(e) => setCategory(e.target.value)} />
          <Field label="Subcategory" value={subcategory} onChange={(e) => setSubcategory(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field label="Hint qty" type="number" value={defQty} onChange={(e) => setDefQty(e.target.value)} />
          <Field label="Unit" value={defUnit} onChange={(e) => setDefUnit(e.target.value)} placeholder="oz / lbs / —" />
          <SelectField label="Per" value={basis} onChange={(v) => setBasis(v as QtyBasis)}
            options={[
              ["per_person", "Person (everyone)"],
              ["per_person_peak", "Person, peak week"],
              ["per_cabin", "Cabin"],
              ["per_boat", "Boat"],
              ["per_group", "Group"],
            ]} />
          <SelectField label="Over" value={period} onChange={(v) => setPeriod(v as QtyPeriod)}
            options={[["per_trip", "The trip"], ["per_day", "Each day"]]} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <SelectField label="Source — where it comes from" value={sourceId} onChange={setSourceId}
            options={[
              ["", sources.length > 0 ? "Someone just brings it" : "No sources yet"],
              ...sources.map((x): [string, string] => [x.id, sourceLabel(x) ?? x.name]),
            ]} />
          <Field label="Notes" value={itemNotes} onChange={(e) => setItemNotes(e.target.value)} placeholder="Bring 2 — they break" />
        </div>
        {sources.length === 0 && (
          <div className="-mt-2 text-[12px]" style={{ color: "var(--text-3)" }}>
            Sources (and who packs from them) are managed on the Inventory page.
          </div>
        )}
        <label className="inline-flex items-center gap-2 text-[13.5px]" style={{ color: "var(--text)" }}>
          <input type="checkbox" checked={isPersonal}
            onChange={(e) => { setIsPersonal(e.target.checked); if (e.target.checked) setCollectPrefs(false); }} />
          Personal — everyone brings their own (if they want)
        </label>
        <label className="inline-flex items-center gap-2 text-[13.5px]" style={{ color: "var(--text)" }}>
          <input type="checkbox" checked={collectPrefs}
            onChange={(e) => { setCollectPrefs(e.target.checked); if (e.target.checked) setIsPersonal(false); }} />
          Prefs — members say how many they want before the trip (replaces the hint)
        </label>
        {collectPrefs && prefRules.length > 0 && (
          <SelectField label="Pref rule (shared target)" value={prefRuleId} onChange={setPrefRuleId}
            options={[["", "No rule"],
              ...prefRules.map((r): [string, string] => [r.id, prefRuleOption(r)])]} />
        )}
        <label className="inline-flex items-center gap-2 text-[13.5px]" style={{ color: "var(--text)" }}>
          <input type="checkbox" checked={isSpare} onChange={(e) => setIsSpare(e.target.checked)} />
          Spare — a backup item, not part of the working set
        </label>

        <div className="text-[12px] font-bold uppercase mt-2" style={{ letterSpacing: ".05em", color: "var(--text-3)" }}>
          This trip <span className="normal-case font-normal" style={{ letterSpacing: 0 }}>— overrides apply to this trip only</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field label="Quantity" type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
          <SelectField label="Week" value={segmentId} onChange={setSegmentId}
            options={[["", "Whole trip"], ...segments.map((s) => [s.id, s.name] as [string, string])]} />
          <Field label="Unit (override)" value={unit} onChange={(e) => setUnit(e.target.value)}
            placeholder={`Inherit (${line.item.default_unit || "—"})`} />
          <SelectField label="Personal (override)" value={personal} onChange={setPersonal}
            options={[
              ["", `Inherit (${line.item.is_personal ? "Personal" : "Shared"})`],
              ["shared", "Shared (this trip)"],
              ["personal", "Personal (this trip)"],
            ]} />
        </div>
        {(personal === "" ? !line.item.is_personal : personal === "shared") && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <SelectField label="Packed by" value={assignee} onChange={setAssignee}
              options={[["", "Unassigned"], ...participants.map((p) => [p.id, p.name] as [string, string])]} />
            <SelectField label="Belongs to (on the trip)" value={owner} onChange={setOwner}
              options={[
                ["", "The group"],
                ...cabins.map((c): [string, string] => [`c:${c.id}`, `${c.name} (cabin)`]),
                ...participants.map((p): [string, string] => [`p:${p.id}`, p.name]),
              ]} />
          </div>
        )}
        {line.units.length === 0 && boxes.length > 0 && (
          <SelectField label="Box" value={boxId} onChange={setBoxId}
            options={[["", "No box"], ...boxes.map((b) => [b.id, b.label] as [string, string])]} />
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Cost ($)" type="number" value={cost} onChange={(e) => setCost(e.target.value)}
            placeholder="What it cost this trip" />
          <SelectField label="Paid by" value={paidBy} onChange={setPaidBy}
            options={[
              ["", cost ? "Same as Packed by" : "—"],
              ...participants.map((p) => [p.id, p.name] as [string, string]),
            ]} />
        </div>
        <div className="-mt-2 text-[12px]" style={{ color: "var(--text-3)" }}>
          {line.item.collect_prefs
            ? "Splits by each person's pref amounts on the balance sheet."
            : "Splits evenly across the group on the balance sheet."}
        </div>
        <Field label="Trip notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Only for this trip" />
      </div>
    </ModalShell>
  );
}
