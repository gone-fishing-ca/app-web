"use client";

import { use, useEffect, useMemo, useState } from "react";
import { ClipboardList, Pencil, Plus, Trash2 } from "lucide-react";
import {
  Badge,
  Btn,
  Card,
  EmptyState,
  Field,
  SectionTitle,
  StatCard,
} from "@/components/ui";
import { api, type PackItem, type PackStatus, type Participant } from "@/lib/api";

type Draft = { id?: string; name: string; category: string; notes: string };
const EMPTY: Draft = { name: "", category: "Gear", notes: "" };

const CATEGORIES = ["Documents", "Clothing", "Gear", "Optional"];

export default function PackListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: tripId } = use(params);
  const [items, setItems] = useState<PackItem[] | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [statuses, setStatuses] = useState<PackStatus[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<PackItem[]>(`/trips/${tripId}/pack-list/items`).then(setItems).catch((e) => setError(e.message ?? "Load failed"));
    api.get<Participant[]>(`/trips/${tripId}/participants`).then(setParticipants).catch(() => {});
    api.get<PackStatus[]>(`/trips/${tripId}/pack-list/statuses`).then(setStatuses).catch(() => {});
  }, [tripId]);

  const statusMap = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const s of statuses) m.set(`${s.item_id}|${s.participant_id}`, s.done);
    return m;
  }, [statuses]);

  function startNew(cat?: string) { setDraft({ ...EMPTY, category: cat ?? "Gear" }); }
  function startEdit(it: PackItem) {
    setDraft({ id: it.id, name: it.name, category: it.category, notes: it.notes ?? "" });
  }
  function cancel() { setDraft(null); setError(null); }

  async function save() {
    if (!draft) return;
    setBusy(true); setError(null);
    const body = { name: draft.name, category: draft.category, notes: draft.notes || null };
    try {
      if (draft.id) {
        const updated = await api.patch<PackItem>(`/trips/${tripId}/pack-list/items/${draft.id}`, body);
        setItems((prev) => prev?.map((p) => (p.id === updated.id ? updated : p)) ?? null);
      } else {
        const created = await api.post<PackItem>(`/trips/${tripId}/pack-list/items`, body);
        setItems((prev) => (prev ? [...prev, created] : [created]));
      }
      setDraft(null);
    } catch (e) {
      setError(e && typeof e === "object" && "message" in e ? String((e as { message?: string }).message) : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Remove this item from the pack list?")) return;
    try {
      await api.del(`/trips/${tripId}/pack-list/items/${id}`);
      setItems((prev) => prev?.filter((p) => p.id !== id) ?? null);
      setStatuses((prev) => prev.filter((s) => s.item_id !== id));
    } catch (e) {
      const m = e && typeof e === "object" && "message" in e ? String((e as { message?: string }).message) : "Delete failed";
      setError(m);
    }
  }

  async function toggleStatus(item: PackItem, participant: Participant) {
    const key = `${item.id}|${participant.id}`;
    const current = statusMap.get(key) ?? false;
    const next = !current;
    // optimistic
    setStatuses((prev) => {
      const without = prev.filter((s) => !(s.item_id === item.id && s.participant_id === participant.id));
      return [...without, { id: `tmp-${key}`, item_id: item.id, participant_id: participant.id, done: next }];
    });
    try {
      const saved = await api.put<PackStatus>(`/trips/${tripId}/pack-list/statuses`, {
        item_id: item.id, participant_id: participant.id, done: next,
      });
      setStatuses((prev) => {
        const without = prev.filter((s) => !(s.item_id === item.id && s.participant_id === participant.id));
        return [...without, saved];
      });
    } catch {
      // revert on failure
      setStatuses((prev) => {
        const without = prev.filter((s) => !(s.item_id === item.id && s.participant_id === participant.id));
        return current
          ? [...without, { id: `tmp-${key}`, item_id: item.id, participant_id: participant.id, done: true }]
          : without;
      });
    }
  }

  const grouped = useMemo(() => {
    const map: Record<string, PackItem[]> = {};
    for (const c of CATEGORIES) map[c] = [];
    for (const it of items ?? []) {
      (map[it.category] ||= []).push(it);
    }
    return map;
  }, [items]);

  const totalSlots = (items?.length ?? 0) * participants.length;
  const packedCount = statuses.filter((s) => s.done).length;
  const pct = totalSlots > 0 ? Math.round((packedCount / totalSlots) * 100) : 0;

  return (
    <div className="p-4 sm:p-7 max-w-[1240px] mx-auto">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 mb-6">
        <StatCard icon={ClipboardList} label="Items on list" value={items?.length ?? 0} />
        <StatCard icon={ClipboardList} label="Packed" value={`${packedCount} / ${totalSlots}`} foot={`${pct}% complete`} tone="primary" />
        <StatCard icon={ClipboardList} label="Categories" value={Object.values(grouped).filter((g) => g.length > 0).length} />
      </div>

      <SectionTitle right={<Btn kind="accent" icon={Plus} onClick={() => startNew()}>Add item</Btn>}>
        Master pack list
      </SectionTitle>

      {error && (
        <div className="mb-4 rounded-[10px] px-3 py-2.5 text-[13px]"
          style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{error}</div>
      )}

      {items === null ? (
        <div style={{ color: "var(--text-3)" }}>Loading…</div>
      ) : items.length === 0 && !draft ? (
        <EmptyState icon={ClipboardList} title="Master list is empty"
          subtitle="Add the first item — Documents, Clothing, Gear, or Optional."
          action={<Btn kind="accent" icon={Plus} onClick={() => startNew()}>Add item</Btn>} />
      ) : (
        <div className="flex flex-col gap-5">
          {CATEGORIES.map((cat) => {
            const list = grouped[cat] || [];
            if (list.length === 0) return null;
            // Per-person check columns can outgrow a phone screen — the grid
            // below the card header scrolls sideways instead of squishing.
            const tableMinW = participants.length > 0 ? 300 + participants.length * 44 + 90 : 0;
            return (
              <Card key={cat}>
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-5 py-3.5"
                  style={{ borderBottom: "1px solid var(--border)" }}>
                  <div className="flex items-center gap-2.5">
                    <div
                      style={{
                        fontFamily: "var(--font-display)",
                        fontWeight: "var(--display-weight)" as unknown as number,
                        letterSpacing: "var(--display-tracking)",
                        fontSize: 17,
                        color: "var(--text)",
                      }}
                    >
                      {cat}
                    </div>
                    <Badge tone="neutral">{list.length}</Badge>
                  </div>
                  <Btn kind="ghost" size="sm" icon={Plus} onClick={() => startNew(cat)}>Add to {cat}</Btn>
                </div>

                <div className="overflow-x-auto">
                  <div style={tableMinW ? { minWidth: tableMinW } : undefined}>
                    {/* header */}
                    {participants.length > 0 && (
                      <div className="grid items-center px-4 sm:px-5 py-2 text-[11.5px] font-bold uppercase"
                        style={{
                          gridTemplateColumns: `2fr 1fr repeat(${participants.length}, 36px) 90px`,
                          gap: 8,
                          borderBottom: "1px solid var(--border)",
                          letterSpacing: ".05em",
                          color: "var(--text-3)",
                        }}
                      >
                        <span>Item</span><span>Notes</span>
                        {participants.map((p) => (
                          <span key={p.id} className="text-center" title={p.name}>
                            {initials(p.name)}
                          </span>
                        ))}
                        <span></span>
                      </div>
                    )}

                    {list.map((it, i) => (
                      <div key={it.id} className="grid items-center px-4 sm:px-5 py-2.5"
                        style={{
                          gridTemplateColumns: participants.length > 0
                            ? `2fr 1fr repeat(${participants.length}, 36px) 90px`
                            : "2fr 1fr 90px",
                          gap: 8,
                          borderTop: i ? "1px solid var(--border)" : "none",
                        }}
                      >
                        <div className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>{it.name}</div>
                        <div className="text-[12.5px]" style={{ color: "var(--text-3)" }}>{it.notes || "—"}</div>
                        {participants.map((p) => {
                          const done = statusMap.get(`${it.id}|${p.id}`) ?? false;
                          return (
                            <button key={p.id} onClick={() => toggleStatus(it, p)} title={`${p.name}: ${done ? "Packed" : "Not yet"}`}
                              className="mx-auto grid place-items-center"
                              style={{
                                width: 22, height: 22, borderRadius: 6,
                                background: done ? "var(--accent)" : "transparent",
                                border: done ? "1px solid transparent" : "1.5px solid var(--border-strong)",
                                color: "var(--on-accent)",
                              }}
                            >
                              {done && <span style={{ fontSize: 13, fontWeight: 700 }}>✓</span>}
                            </button>
                          );
                        })}
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => startEdit(it)} title="Edit"
                            className="grid place-items-center"
                            style={{ width: 28, height: 28, borderRadius: 7, background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => remove(it.id)} title="Delete"
                            className="grid place-items-center"
                            style={{ width: 28, height: 28, borderRadius: 7, background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {draft && (
        <Card pad={20} className="mt-5">
          <div className="text-[13px] font-bold uppercase mb-3" style={{ letterSpacing: ".05em", color: "var(--text-3)" }}>
            {draft.id ? "Edit pack list item" : "New pack list item"}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Field label="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Wool socks" />
            <label className="flex flex-col gap-1.5">
              <span className="text-[12.5px] font-semibold" style={{ color: "var(--text-2)" }}>Category</span>
              <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                className="rounded-[11px] py-3 px-3.5 text-[14.5px]"
                style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", color: "var(--text)" }}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <Field label="Notes" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="2 pairs minimum" />
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Btn kind="ghost" onClick={cancel}>Cancel</Btn>
            <Btn kind="accent" onClick={save} disabled={busy || !draft.name.trim()}>
              {busy ? "Saving…" : draft.id ? "Save changes" : "Add"}
            </Btn>
          </div>
        </Card>
      )}
    </div>
  );
}

function initials(name: string): string {
  return name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}
