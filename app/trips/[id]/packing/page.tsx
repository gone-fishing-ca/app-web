"use client";

import { use, useEffect, useMemo, useState } from "react";
import { Check, ClipboardList, Copy, Pencil, Plus, Search, Trash2, Users } from "lucide-react";
import { Badge, Btn, Card, EmptyState, Field, ModalShell, SectionTitle, StatCard } from "@/components/ui";
import {
  type ItemDraft,
  ItemFields,
  SelectField,
  emptyItemDraft,
  itemBodyFromDraft,
} from "@/components/inventory-form";
import {
  api,
  INVENTORY_TYPES,
  type InventoryItem,
  type InventoryType,
  type PackCopyResult,
  type PackLine,
  type PackLineStatus,
  type Participant,
  type QtyBasis,
  type QtyPeriod,
  type Responsibility,
  type Segment,
  type Stay,
  type Trip,
} from "@/lib/api";
import { fmtQty, hintLabel, suggestQty, tripFacts } from "@/lib/packing";

const RESP_LABEL: Record<Responsibility, string> = {
  shared: "Shared",
  personal: "Personal",
  personal_stored: "Stored @ HQ",
};
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
  const [typeFilter, setTypeFilter] = useState<"All" | InventoryType>("All");
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<PackLine | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);
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
    api.get<Trip[]>(`/trips`).then((ts) => setOtherTrips(ts.filter((t) => t.id !== tripId))).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  const facts = useMemo(() => tripFacts(participants.length, segments, stays), [participants, segments, stays]);
  const segName = useMemo(() => new Map(segments.map((s) => [s.id, s.name])), [segments]);

  const filtered = useMemo(
    () => (lines ?? []).filter((l) => typeFilter === "All" || l.item.item_type === typeFilter),
    [lines, typeFilter],
  );

  /** type → category → lines, in the server's taxonomy order. */
  const grouped = useMemo(() => {
    const byType = new Map<string, Map<string, PackLine[]>>();
    for (const l of filtered) {
      const cats = byType.get(l.item.item_type) ?? new Map<string, PackLine[]>();
      const key = [l.item.category, l.item.subcategory].filter(Boolean).join(" · ") || "General";
      cats.set(key, [...(cats.get(key) ?? []), l]);
      byType.set(l.item.item_type, cats);
    }
    return byType;
  }, [filtered]);

  const packedCount = (lines ?? []).filter((l) => l.status === "packed").length;

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
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 mb-6">
        <StatCard icon={ClipboardList} label="On the list" value={lines?.length ?? 0} />
        <StatCard icon={Check} label="Packed" value={`${packedCount} / ${lines?.length ?? 0}`} tone="primary" />
        <StatCard icon={Users} label="People × days" value={facts.personDays || "—"}
          foot={`${facts.people} people · ${facts.cabins} cabins · ${facts.boats} boats`} />
      </div>

      <SectionTitle
        right={
          <div className="flex flex-wrap gap-2">
            {otherTrips.length > 0 && (
              <Btn kind="ghost" icon={Copy} onClick={() => setCopyOpen(true)}>Copy from…</Btn>
            )}
            <Btn kind="accent" icon={Plus} onClick={() => setAddOpen(true)}>Add items</Btn>
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
              <Btn kind={latestOther ? "ghost" : "accent"} icon={Plus} onClick={() => setAddOpen(true)}>Add items</Btn>
            </div>
          } />
      ) : (
        <div className="flex flex-col gap-5">
          {INVENTORY_TYPES.filter((t) => grouped.has(t)).map((type) => (
            <Card key={type}>
              <div className="flex items-center gap-2.5 px-4 sm:px-5 py-3.5" style={{ borderBottom: "1px solid var(--border)" }}>
                <div style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: "var(--display-weight)" as unknown as number,
                  letterSpacing: "var(--display-tracking)",
                  fontSize: 17, color: "var(--text)",
                }}>
                  {type}
                </div>
                <Badge tone="neutral">{[...grouped.get(type)!.values()].reduce((n, g) => n + g.length, 0)}</Badge>
              </div>

              <div className="overflow-x-auto">
                <div style={{ minWidth: 760 }}>
                  {[...grouped.get(type)!.entries()].map(([cat, group]) => (
                    <div key={cat}>
                      <div className="px-4 sm:px-5 pt-3 pb-1 text-[11.5px] font-bold uppercase"
                        style={{ letterSpacing: ".05em", color: "var(--text-3)" }}>
                        {cat}
                      </div>
                      {group.map((line) => {
                        const suggestion = suggestQty(line.item, line.segment_id ? tripFacts(participants.length, segments, stays, line.segment_id) : facts);
                        return (
                          <div key={line.id} className="grid items-center px-4 sm:px-5 py-2"
                            style={{ gridTemplateColumns: "minmax(220px,2fr) 150px 130px minmax(140px,1fr) 110px 70px", gap: 10 }}>
                            {/* name + hint */}
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="truncate text-[14px] font-semibold" style={{ color: "var(--text)" }}>{line.item.name}</span>
                                {line.segment_id && <Badge tone="info">{segName.get(line.segment_id) ?? "Week"}</Badge>}
                              </div>
                              {(line.notes || line.item.notes || hintLabel(line.item)) && (
                                <div className="truncate text-[12px] mt-0.5" style={{ color: "var(--text-3)" }}>
                                  {line.notes || line.item.notes || hintLabel(line.item)}
                                </div>
                              )}
                            </div>

                            {/* qty */}
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
                              <span className="text-[12px] truncate" style={{ color: "var(--text-3)" }}>
                                {line.unit || (line.quantity == null && suggestion != null ? "suggested" : "")}
                              </span>
                            </div>

                            {/* responsibility */}
                            <select
                              value={line.responsibility}
                              onChange={(e) => void patchLine(line, { responsibility: e.target.value })}
                              className="rounded-[9px] px-2 py-1.5 text-[12.5px] font-semibold"
                              style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-2)" }}
                            >
                              {(Object.keys(RESP_LABEL) as Responsibility[]).map((r) => (
                                <option key={r} value={r}>{RESP_LABEL[r]}</option>
                              ))}
                            </select>

                            {/* assignee (shared) / people summary (personal) */}
                            {line.responsibility === "shared" ? (
                              <select
                                value={line.assignee_participant_id ?? ""}
                                onChange={(e) => void patchLine(line, { assignee_participant_id: e.target.value || null })}
                                className="rounded-[9px] px-2 py-1.5 text-[12.5px] w-full min-w-0"
                                style={{
                                  background: "var(--surface)", border: "1px solid var(--border)",
                                  color: line.assignee_participant_id ? "var(--text)" : "var(--text-3)",
                                }}
                              >
                                <option value="">Unassigned</option>
                                {participants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                              </select>
                            ) : (
                              <span className="text-[12.5px] truncate" style={{ color: "var(--text-3)" }}>
                                {line.responsibility === "personal_stored" ? "At HQ for each person" : "Everyone brings their own"}
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
                        );
                      })}
                    </div>
                  ))}
                  <div className="pb-2" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {addOpen && (
        <AddItemsModal
          tripId={tripId}
          inventory={inventory}
          lines={lines ?? []}
          onAdded={(line, item) => {
            setLines((prev) => (prev ? [...prev, line] : [line]));
            if (!inventory.some((i) => i.id === item.id)) setInventory((prev) => [...prev, item]);
          }}
          onClose={() => setAddOpen(false)}
        />
      )}

      {editing && (
        <EditLineModal
          line={editing}
          segments={segments}
          participants={participants}
          onSave={async (lineBody, itemBody) => {
            let ok = true;
            if (Object.keys(itemBody).length > 0) {
              try {
                const item = await api.patch<InventoryItem>(`/inventory/${editing.inventory_item_id}`, itemBody);
                setLines((prev) => prev?.map((l) => (l.inventory_item_id === item.id ? { ...l, item } : l)) ?? null);
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

/* ---- Add items: search the master inventory, Instacart-style --------------- */
function AddItemsModal({
  tripId, inventory, lines, onAdded, onClose,
}: {
  tripId: string;
  inventory: InventoryItem[];
  lines: PackLine[];
  onAdded: (line: PackLine, item: InventoryItem) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"All" | InventoryType>("All");
  const [creating, setCreating] = useState<ItemDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const onList = useMemo(() => new Set(lines.map((l) => l.inventory_item_id)), [lines]);

  const q = query.trim().toLowerCase();
  const results = useMemo(
    () =>
      inventory
        .filter((i) => !i.archived)
        .filter((i) => typeFilter === "All" || i.item_type === typeFilter)
        .filter((i) =>
          !q ||
          i.name.toLowerCase().includes(q) ||
          (i.category ?? "").toLowerCase().includes(q) ||
          (i.subcategory ?? "").toLowerCase().includes(q),
        ),
    [inventory, typeFilter, q],
  );

  async function add(item: InventoryItem) {
    try {
      const line = await api.post<PackLine>(`/trips/${tripId}/pack`, { inventory_item_id: item.id });
      onAdded(line, item);
    } catch (e) {
      setError(errMsg(e, "Couldn't add the item"));
    }
  }

  async function createAndAdd(draft: ItemDraft) {
    try {
      const line = await api.post<PackLine>(`/trips/${tripId}/pack`, {
        new_item: itemBodyFromDraft(draft),
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
        <Btn kind="subtle" icon={Plus} className="mr-auto"
          onClick={() => setCreating(emptyItemDraft(query, typeFilter === "All" ? "Gear" : typeFilter))}>
          New inventory item{query.trim() ? ` “${query.trim()}”` : ""}
        </Btn>
      )}
    >
      {creating ? (
        <NewItemForm draft={creating} setDraft={setCreating} error={error}
          onCancel={() => setCreating(null)} onSubmit={() => void createAndAdd(creating)} />
      ) : (
        <div className="flex flex-col gap-3">
          <Field icon={Search} value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or category…" autoFocus />
          <div className="flex flex-wrap gap-1.5">
            {(["All", ...INVENTORY_TYPES] as const).map((t) => (
              <button key={t} onClick={() => setTypeFilter(t)}
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
                    <div className="truncate text-[14px] font-semibold" style={{ color: "var(--text)" }}>{item.name}</div>
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
  draft, setDraft, error, onCancel, onSubmit,
}: {
  draft: ItemDraft;
  setDraft: (d: ItemDraft) => void;
  error: string | null;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <ItemFields draft={draft} setDraft={setDraft} autoFocusName />
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
  line, segments, participants, onSave, onClose,
}: {
  line: PackLine;
  segments: Segment[];
  participants: Participant[];
  onSave: (lineBody: Record<string, unknown>, itemBody: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
}) {
  const [qty, setQty] = useState(line.quantity == null ? "" : String(line.quantity));
  const [unit, setUnit] = useState(line.unit ?? "");
  const [resp, setResp] = useState<Responsibility>(line.responsibility);
  const [assignee, setAssignee] = useState(line.assignee_participant_id ?? "");
  const [segmentId, setSegmentId] = useState(line.segment_id ?? "");
  const [notes, setNotes] = useState(line.notes ?? "");
  // Master item fields (saved back to the inventory catalog).
  const [name, setName] = useState(line.item.name);
  const [itemType, setItemType] = useState<InventoryType>(line.item.item_type);
  const [category, setCategory] = useState(line.item.category ?? "");
  const [subcategory, setSubcategory] = useState(line.item.subcategory ?? "");
  const [defQty, setDefQty] = useState(line.item.default_qty == null ? "" : String(line.item.default_qty));
  const [basis, setBasis] = useState<QtyBasis>(line.item.qty_basis);
  const [period, setPeriod] = useState<QtyPeriod>(line.item.qty_period);
  const [busy, setBusy] = useState(false);

  function diff(): { lineBody: Record<string, unknown>; itemBody: Record<string, unknown> } {
    const lineBody: Record<string, unknown> = {};
    const nQty = qty === "" ? null : Number(qty);
    if (nQty !== line.quantity) lineBody.quantity = nQty;
    if ((unit || null) !== line.unit) lineBody.unit = unit || null;
    if (resp !== line.responsibility) lineBody.responsibility = resp;
    if ((assignee || null) !== line.assignee_participant_id) lineBody.assignee_participant_id = assignee || null;
    if ((segmentId || null) !== line.segment_id) lineBody.segment_id = segmentId || null;
    if ((notes || null) !== line.notes) lineBody.notes = notes || null;

    const itemBody: Record<string, unknown> = {};
    if (name.trim() && name.trim() !== line.item.name) itemBody.name = name.trim();
    if (itemType !== line.item.item_type) itemBody.item_type = itemType;
    if ((category.trim() || null) !== line.item.category) itemBody.category = category.trim() || null;
    if ((subcategory.trim() || null) !== line.item.subcategory) itemBody.subcategory = subcategory.trim() || null;
    const nDefQty = defQty === "" ? null : Number(defQty);
    if (nDefQty !== line.item.default_qty) itemBody.default_qty = nDefQty;
    if (basis !== line.item.qty_basis) itemBody.qty_basis = basis;
    if (period !== line.item.qty_period) itemBody.qty_period = period;
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
          This trip
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field label="Quantity" type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
          <Field label="Unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="—" />
          <SelectField label="Who brings it" value={resp} onChange={(v) => setResp(v as Responsibility)}
            options={[["shared", "Shared"], ["personal", "Personal"], ["personal_stored", "Stored @ HQ"]]} />
          <SelectField label="Week" value={segmentId} onChange={setSegmentId}
            options={[["", "Whole trip"], ...segments.map((s) => [s.id, s.name] as [string, string])]} />
        </div>
        {resp === "shared" && (
          <SelectField label="Assigned to" value={assignee} onChange={setAssignee}
            options={[["", "Unassigned"], ...participants.map((p) => [p.id, p.name] as [string, string])]} />
        )}
        <Field label="Trip notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Only for this trip" />

        <div className="text-[12px] font-bold uppercase mt-2" style={{ letterSpacing: ".05em", color: "var(--text-3)" }}>
          Master inventory item <span className="normal-case font-normal" style={{ letterSpacing: 0 }}>— changes apply on every trip</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <SelectField label="Type" value={itemType} onChange={(v) => setItemType(v as InventoryType)}
            options={INVENTORY_TYPES.map((t) => [t, t])} />
          <Field label="Category" value={category} onChange={(e) => setCategory(e.target.value)} />
          <Field label="Subcategory" value={subcategory} onChange={(e) => setSubcategory(e.target.value)} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Hint qty" type="number" value={defQty} onChange={(e) => setDefQty(e.target.value)} />
          <SelectField label="Per" value={basis} onChange={(v) => setBasis(v as QtyBasis)}
            options={[["per_person", "Person"], ["per_cabin", "Cabin"], ["per_boat", "Boat"], ["per_group", "Group"]]} />
          <SelectField label="Over" value={period} onChange={(v) => setPeriod(v as QtyPeriod)}
            options={[["per_trip", "The trip"], ["per_day", "Each day"]]} />
        </div>
      </div>
    </ModalShell>
  );
}
