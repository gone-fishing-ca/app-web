"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, ArrowLeft, Boxes, MapPin, Pencil, Plus, Search, SlidersHorizontal, Trash2 } from "lucide-react";
import { GroupHeader, TypeHeader, useFoldState } from "@/components/collapsible";
import {
  type ItemDraft,
  ItemFields,
  draftFromItem,
  emptyItemDraft,
  itemBodyFromDraft,
} from "@/components/inventory-form";
import { Badge, Btn, Card, EmptyState, Eyebrow, Field, ModalShell, Wordmark } from "@/components/ui";
import { UserMenu } from "@/components/user-menu";
import {
  api,
  INVENTORY_TYPES,
  type Contact,
  type InventoryItem,
  type InventoryType,
  type PrefRule,
  type PrefRuleKind,
  type Source,
  type SourceKind,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { hintLabel, sourceLabel } from "@/lib/packing";

function errMsg(e: unknown, fallback: string): string {
  return e && typeof e === "object" && "message" in e
    ? String((e as { message?: string }).message)
    : fallback;
}

export default function InventoryPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<InventoryItem[] | null>(null);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"All" | InventoryType>("All");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<{ item: InventoryItem | null; draft: ItemDraft } | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [prefRules, setPrefRules] = useState<PrefRule[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [srcOpen, setSrcOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace("/login"); return; }
    api.get<InventoryItem[]>("/inventory?include_archived=true")
      .then(setItems)
      .catch((e) => setError(errMsg(e, "Failed to load inventory")));
    api.get<Source[]>("/sources").then(setSources).catch(() => {});
    api.get<PrefRule[]>("/pref-rules").then(setPrefRules).catch(() => {});
    api.get<Contact[]>("/contacts").then(setContacts).catch(() => {});
  }, [authLoading, user, router]);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      (items ?? [])
        .filter((i) => showArchived || !i.archived)
        .filter((i) => typeFilter === "All" || i.item_type === typeFilter)
        .filter((i) =>
          !q ||
          i.name.toLowerCase().includes(q) ||
          (i.category ?? "").toLowerCase().includes(q) ||
          (i.subcategory ?? "").toLowerCase().includes(q),
        ),
    [items, showArchived, typeFilter, q],
  );

  /** type → category → subcategory ("" = none) → items, in server order. */
  const grouped = useMemo(() => {
    const byType = new Map<string, Map<string, Map<string, InventoryItem[]>>>();
    for (const i of filtered) {
      const cats = byType.get(i.item_type) ?? new Map<string, Map<string, InventoryItem[]>>();
      const cat = i.category || "General";
      const subs = cats.get(cat) ?? new Map<string, InventoryItem[]>();
      const sub = i.subcategory || "";
      subs.set(sub, [...(subs.get(sub) ?? []), i]);
      cats.set(cat, subs);
      byType.set(i.item_type, cats);
    }
    return byType;
  }, [filtered]);

  const { isOpen: storedOpen, toggle, setMany } = useFoldState("gf-inventory-fold");
  // An active search would otherwise hide its hits inside collapsed groups.
  const searching = q.length > 0;
  const foldOpen = (key: string, defaultOpen: boolean) => searching || storedOpen(key, defaultOpen);

  /** Every category/subcategory fold key inside one type's groups. */
  function groupKeys(type: string, cats: Map<string, Map<string, InventoryItem[]>>): string[] {
    const keys: string[] = [];
    for (const [cat, subs] of cats) {
      keys.push(`${type}|${cat}`);
      for (const sub of subs.keys()) if (sub) keys.push(`${type}|${cat}|${sub}`);
    }
    return keys;
  }

  function newItemIn(type: InventoryType, category: string | null, subcategory: string | null) {
    setEditing({
      item: null,
      draft: { ...emptyItemDraft("", type), category: category ?? "", subcategory: subcategory ?? "" },
    });
  }

  const categoryHints = useMemo(
    () => [...new Set((items ?? []).map((i) => i.category).filter((c): c is string => !!c))].sort(),
    [items],
  );

  async function save() {
    if (!editing) return;
    setError(null);
    const body = itemBodyFromDraft(editing.draft);
    try {
      if (editing.item) {
        const updated = await api.patch<InventoryItem>(`/inventory/${editing.item.id}`, body);
        setItems((prev) => prev?.map((i) => (i.id === updated.id ? updated : i)) ?? null);
      } else {
        const created = await api.post<InventoryItem>("/inventory", body);
        setItems((prev) => (prev ? [...prev, created] : [created]));
      }
      setEditing(null);
    } catch (e) {
      setError(errMsg(e, "Save failed"));
    }
  }

  async function setArchived(item: InventoryItem, archived: boolean) {
    try {
      const updated = await api.patch<InventoryItem>(`/inventory/${item.id}`, { archived });
      setItems((prev) => prev?.map((i) => (i.id === updated.id ? updated : i)) ?? null);
    } catch (e) {
      setError(errMsg(e, "Save failed"));
    }
  }

  async function remove(item: InventoryItem) {
    if (!confirm(`Delete “${item.name}” from your inventory? This only works if no trip has ever packed it.`)) return;
    try {
      await api.del(`/inventory/${item.id}`);
      setItems((prev) => prev?.filter((i) => i.id !== item.id) ?? null);
    } catch (e) {
      setError(errMsg(e, "Delete failed"));
    }
  }

  if (authLoading || !user) return null;

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <header
        className="flex items-center px-4 sm:px-8 py-4 sm:py-5"
        style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}
      >
        <Link href="/trips"><Wordmark size={18} glyph mode="light" /></Link>
        <div className="ml-auto"><UserMenu /></div>
      </header>

      <main className="max-w-[1100px] mx-auto px-4 sm:px-8 py-6 sm:py-10">
        <Link href="/trips" className="inline-flex items-center gap-1.5 mb-4 text-[13.5px]" style={{ color: "var(--text-3)" }}>
          <ArrowLeft size={14} /> Back to trips
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
          <Eyebrow>Master inventory</Eyebrow>
          <div className="flex flex-wrap gap-2">
            <Btn kind="ghost" icon={MapPin} onClick={() => setSrcOpen(true)}>
              Sources{sources.length > 0 ? ` (${sources.length})` : ""}
            </Btn>
            <Btn kind="ghost" icon={SlidersHorizontal} onClick={() => setRulesOpen(true)}>
              Pref rules{prefRules.length > 0 ? ` (${prefRules.length})` : ""}
            </Btn>
            <Btn kind="accent" icon={Plus} onClick={() => setEditing({ item: null, draft: emptyItemDraft("", typeFilter === "All" ? "Gear" : typeFilter) })}>
              New item
            </Btn>
          </div>
        </div>
        <div className="mb-6 text-[13.5px]" style={{ color: "var(--text-3)" }}>
          Everything you&apos;ve ever brought, reusable across years — trips pull their packing lists from here.
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
          <div className="flex-1 min-w-0">
            <Field icon={Search} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or category…" />
          </div>
          <label className="inline-flex items-center gap-2 text-[13px] flex-none" style={{ color: "var(--text-2)" }}>
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Show archived
          </label>
        </div>
        <div className="flex flex-wrap gap-1.5 mb-5">
          {(["All", ...INVENTORY_TYPES] as const).map((t) => {
            const active = typeFilter === t;
            return (
              <button key={t} onClick={() => setTypeFilter(t)}
                className="px-3 py-1.5 rounded-full text-[13px] font-semibold"
                style={{
                  background: active ? "var(--primary)" : "var(--surface)",
                  color: active ? "var(--on-primary)" : "var(--text-2)",
                  border: `1px solid ${active ? "transparent" : "var(--border)"}`,
                }}
              >
                {t}
              </button>
            );
          })}
        </div>

        {error && (
          <div className="mb-4 rounded-[10px] px-3 py-2.5 text-[13px]"
            style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{error}</div>
        )}

        {items === null ? (
          <div style={{ color: "var(--text-3)" }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={Boxes} title={q ? "No matches" : "No inventory yet"}
            subtitle={q ? "Try a different search, or create the item." : "Items you add here (or while building a trip's packing list) accumulate year over year."}
            action={<Btn kind="accent" icon={Plus} onClick={() => setEditing({ item: null, draft: emptyItemDraft(query) })}>New item</Btn>} />
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
                {typeOpen && [...cats.entries()].map(([cat, subs]) => {
                  const catKey = `${type}|${cat}`;
                  const catCount = [...subs.values()].reduce((m, g) => m + g.length, 0);
                  const catOpen = foldOpen(catKey, false);
                  const namedSubKeys = [...subs.keys()].filter(Boolean).map((s) => `${catKey}|${s}`);
                  return (
                  <div key={cat}>
                    <GroupHeader level={1} label={cat} count={catCount} open={catOpen}
                      onToggle={() => toggle(catKey, false)}
                      onAdd={() => newItemIn(type, cat === "General" ? null : cat, null)}
                      onSetAll={namedSubKeys.length > 0
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
                            onAdd={() => newItemIn(type, cat === "General" ? null : cat, sub)} />
                        )}
                        {subOpen && group.map((item) => (
                      <div key={item.id} className="flex items-center gap-3 px-4 sm:px-5 py-2.5">
                        <div className="flex-1 min-w-0" style={{ opacity: item.archived ? 0.5 : 1 }}>
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="truncate text-[14px] font-semibold" style={{ color: "var(--text)" }}>{item.name}</span>
                            {item.is_spare && <Badge tone="warning">Spare</Badge>}
                            {item.archived && <Badge tone="warning">archived</Badge>}
                          </div>
                          <div className="truncate text-[12px] mt-0.5" style={{ color: "var(--text-3)" }}>
                            {[hintLabel(item),
                              sourceLabel(item.source),
                              item.notes].filter(Boolean).join(" · ") || "—"}
                          </div>
                        </div>
                        {item.is_personal && <Badge tone="info">Personal</Badge>}
                        {item.collect_prefs && <Badge tone="info">Prefs</Badge>}
                        <div className="flex items-center gap-1">
                          <button onClick={() => setEditing({ item, draft: draftFromItem(item) })} title="Edit"
                            className="grid place-items-center"
                            style={{ width: 28, height: 28, borderRadius: 7, background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => void setArchived(item, !item.archived)}
                            title={item.archived ? "Restore" : "Archive — hides it from pickers, keeps history"}
                            className="grid place-items-center"
                            style={{ width: 28, height: 28, borderRadius: 7, background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
                            {item.archived ? <ArchiveRestore size={13} /> : <Archive size={13} />}
                          </button>
                          <button onClick={() => void remove(item)} title="Delete"
                            className="grid place-items-center"
                            style={{ width: 28, height: 28, borderRadius: 7, background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                        ))}
                      </div>
                      );
                    })}
                  </div>
                  );
                })}
                <div className="pb-2" />
              </Card>
              );
            })}
          </div>
        )}
      </main>

      {editing && (
        <ModalShell
          title={editing.item ? `Edit “${editing.item.name}”` : "New inventory item"}
          subtitle={editing.item ? "Changes apply everywhere this item is used." : undefined}
          maxWidth={620}
          onClose={() => setEditing(null)}
          footer={
            <>
              <Btn kind="ghost" onClick={() => setEditing(null)}>Cancel</Btn>
              <Btn kind="accent" disabled={!editing.draft.name.trim()} onClick={() => void save()}>
                {editing.item ? "Save" : "Create"}
              </Btn>
            </>
          }
        >
          <ItemFields draft={editing.draft} setDraft={(d) => setEditing({ ...editing, draft: d })}
            autoFocusName={!editing.item} categoryHints={categoryHints} sources={sources}
            prefRules={prefRules} onManageSources={() => setSrcOpen(true)} />
        </ModalShell>
      )}

      {rulesOpen && (
        <PrefRulesModal
          rules={prefRules}
          setRules={setPrefRules}
          onChanged={() => {
            // Items embed their rule — refresh so renames show up.
            api.get<InventoryItem[]>("/inventory?include_archived=true").then(setItems).catch(() => {});
          }}
          onClose={() => setRulesOpen(false)}
        />
      )}

      {srcOpen && (
        <SourcesModal
          sources={sources}
          setSources={setSources}
          contacts={contacts}
          onChanged={() => {
            // Items embed their source — refresh so renames show up.
            api.get<InventoryItem[]>("/inventory?include_archived=true").then(setItems).catch(() => {});
          }}
          onClose={() => setSrcOpen(false)}
        />
      )}
    </div>
  );
}

/* ---- Sources: where things come from (storage / buyer / outfitter) ---------- */
const KIND_LABEL: Record<SourceKind, string> = {
  storage: "Storage",
  buyer: "Buyer",
  outfitter: "Outfitter",
};

function SourcesModal({
  sources, setSources, contacts, onChanged, onClose,
}: {
  sources: Source[];
  setSources: (fn: (prev: Source[]) => Source[]) => void;
  contacts: Contact[];
  onChanged: () => void;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<SourceKind>("storage");

  async function addSource() {
    const n = name.trim();
    if (!n) return;
    try {
      const created = await api.post<Source>("/sources", { name: n, kind });
      setSources((prev) => [...prev, created]);
      setName("");
    } catch (e) {
      setError(errMsg(e, "Couldn't add the source"));
    }
  }

  async function patchSource(src: Source, body: Record<string, unknown>) {
    try {
      const updated = await api.patch<Source>(`/sources/${src.id}`, body);
      setSources((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      onChanged();
    } catch (e) {
      setError(errMsg(e, "Save failed"));
    }
  }

  async function deleteSource(src: Source) {
    if (!confirm(`Delete “${src.name}”? This only works while no items come from there.`)) return;
    try {
      await api.del(`/sources/${src.id}`);
      setSources((prev) => prev.filter((s) => s.id !== src.id));
    } catch (e) {
      setError(errMsg(e, "Delete failed — items come from there"));
    }
  }

  return (
    <ModalShell
      title="Sources"
      subtitle="Where inventory comes from: storage between trips, a buyer who shops fresh, or the outfitter's fly-in order. The responsible person becomes the default “packed by”."
      maxWidth={620}
      onClose={onClose}
    >
      {error && (
        <div className="mb-3 rounded-[10px] px-3 py-2 text-[13px]"
          style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{error}</div>
      )}
      <div className="flex flex-col gap-2">
        {sources.map((src) => (
          <div key={src.id} className="flex items-center gap-2">
            <input
              defaultValue={src.name}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== src.name) void patchSource(src, { name: v });
              }}
              className="flex-1 min-w-0 rounded-[9px] px-2.5 py-2 text-[13.5px] font-semibold outline-none"
              style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", color: "var(--text)" }}
            />
            <select
              value={src.kind}
              onChange={(e) => void patchSource(src, { kind: e.target.value })}
              title="Storage = pulled from here; Buyer = bought fresh; Outfitter = flown in"
              className="rounded-[9px] px-2 py-2 text-[13px] w-[110px]"
              style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}
            >
              {(Object.keys(KIND_LABEL) as SourceKind[]).map((k) => (
                <option key={k} value={k}>{KIND_LABEL[k]}</option>
              ))}
            </select>
            <select
              value={src.responsible_contact_id ?? ""}
              onChange={(e) => void patchSource(src, { responsible_contact_id: e.target.value || null })}
              title="Responsible person — the default packer for items from here"
              className="rounded-[9px] px-2 py-2 text-[13px] w-[160px]"
              style={{
                background: "var(--surface)", border: "1px solid var(--border)",
                color: src.responsible_contact_id ? "var(--text)" : "var(--text-3)",
              }}
            >
              <option value="">No one responsible</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button onClick={() => void deleteSource(src)} title="Delete source"
              className="grid place-items-center flex-none"
              style={{ width: 30, height: 30, borderRadius: 8, background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
              <Trash2 size={13} />
            </button>
          </div>
        ))}
        {sources.length === 0 && (
          <div className="py-4 text-center text-[13.5px]" style={{ color: "var(--text-3)" }}>
            No sources yet — “Greg's House” (storage), “Dave” (buyer), “Mattice Lake” (outfitter)…
          </div>
        )}
        <div className="flex items-center gap-2 mt-1">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void addSource(); }}
            placeholder="New source — Greg's House, Dave…"
            className="flex-1 min-w-0 rounded-[9px] px-2.5 py-2 text-[13.5px] outline-none"
            style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", color: "var(--text)" }}
          />
          <select value={kind} onChange={(e) => setKind(e.target.value as SourceKind)}
            className="rounded-[9px] px-2 py-2 text-[13px]"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}>
            {(Object.keys(KIND_LABEL) as SourceKind[]).map((k) => (
              <option key={k} value={k}>{KIND_LABEL[k]}</option>
            ))}
          </select>
          <Btn kind="subtle" icon={Plus} onClick={() => void addSource()}>Add</Btn>
        </div>
      </div>
    </ModalShell>
  );
}

/* ---- Pref rules: shared quantity targets across prefs items ----------------- */
const RULE_KIND_LABEL: Record<PrefRuleKind, string> = {
  per_day: "Per day",
  total: "Total",
  max: "Max",
};

function PrefRulesModal({
  rules, setRules, onChanged, onClose,
}: {
  rules: PrefRule[];
  setRules: (fn: (prev: PrefRule[]) => PrefRule[]) => void;
  onChanged: () => void;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<PrefRuleKind>("per_day");
  const [qty, setQty] = useState("1");

  async function addRule() {
    const n = name.trim();
    if (!n) return;
    try {
      const created = await api.post<PrefRule>("/pref-rules", {
        name: n, kind, qty: qty === "" ? 1 : Number(qty),
      });
      setRules((prev) => [...prev, created]);
      setName("");
    } catch (e) {
      setError(errMsg(e, "Couldn't add the rule"));
    }
  }

  async function patchRule(rule: PrefRule, body: Record<string, unknown>) {
    try {
      const updated = await api.patch<PrefRule>(`/pref-rules/${rule.id}`, body);
      setRules((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      onChanged();
    } catch (e) {
      setError(errMsg(e, "Save failed"));
    }
  }

  async function deleteRule(rule: PrefRule) {
    if (!confirm(`Delete “${rule.name}”? This only works while no items use it.`)) return;
    try {
      await api.del(`/pref-rules/${rule.id}`);
      setRules((prev) => prev.filter((r) => r.id !== rule.id));
    } catch (e) {
      setError(errMsg(e, "Delete failed — items use this rule"));
    }
  }

  return (
    <ModalShell
      title="Pref rules"
      subtitle="Shared targets across prefs items — “2 slices of lunchmeat per day” across Ham and Turkey. Per day multiplies by each person's attended days; Max is a cap. The message shows on everyone's prefs list."
      maxWidth={680}
      onClose={onClose}
    >
      {error && (
        <div className="mb-3 rounded-[10px] px-3 py-2 text-[13px]"
          style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{error}</div>
      )}
      <div className="flex flex-col gap-3">
        {rules.map((rule) => (
          <div key={rule.id} className="flex flex-col gap-1.5 rounded-[11px] p-2.5"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
            <div className="flex items-center gap-2">
              <input
                defaultValue={rule.name}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== rule.name) void patchRule(rule, { name: v });
                }}
                className="flex-1 min-w-0 rounded-[9px] px-2.5 py-2 text-[13.5px] font-semibold outline-none"
                style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", color: "var(--text)" }}
              />
              <select
                value={rule.kind}
                onChange={(e) => void patchRule(rule, { kind: e.target.value })}
                className="rounded-[9px] px-2 py-2 text-[13px] w-[100px]"
                style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}
              >
                {(Object.keys(RULE_KIND_LABEL) as PrefRuleKind[]).map((k) => (
                  <option key={k} value={k}>{RULE_KIND_LABEL[k]}</option>
                ))}
              </select>
              <input
                type="number" inputMode="decimal" min={0} step="any"
                defaultValue={rule.qty}
                onBlur={(e) => {
                  const v = e.target.value === "" ? null : Number(e.target.value);
                  if (v != null && v !== rule.qty) void patchRule(rule, { qty: v });
                }}
                className="w-[64px] flex-none rounded-[9px] px-2 py-2 text-[13px] text-right gf-mono outline-none"
                style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}
              />
              <button onClick={() => void deleteRule(rule)} title="Delete rule"
                className="grid place-items-center flex-none"
                style={{ width: 30, height: 30, borderRadius: 8, background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
                <Trash2 size={13} />
              </button>
            </div>
            <input
              defaultValue={rule.message ?? ""}
              placeholder="Message shown on prefs lists — “Select two slices of lunchmeat per day”"
              onBlur={(e) => {
                const v = e.target.value.trim() || null;
                if (v !== rule.message) void patchRule(rule, { message: v });
              }}
              className="rounded-[9px] px-2.5 py-1.5 text-[13px] outline-none"
              style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}
            />
          </div>
        ))}
        {rules.length === 0 && (
          <div className="py-4 text-center text-[13.5px]" style={{ color: "var(--text-3)" }}>
            No rules yet — “Lunchmeat, 2 per day”, “Tortillas, 1 per day”…
          </div>
        )}
        <div className="flex items-center gap-2 mt-1">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void addRule(); }}
            placeholder="New rule — Lunchmeat…"
            className="flex-1 min-w-0 rounded-[9px] px-2.5 py-2 text-[13.5px] outline-none"
            style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", color: "var(--text)" }}
          />
          <select value={kind} onChange={(e) => setKind(e.target.value as PrefRuleKind)}
            className="rounded-[9px] px-2 py-2 text-[13px]"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}>
            {(Object.keys(RULE_KIND_LABEL) as PrefRuleKind[]).map((k) => (
              <option key={k} value={k}>{RULE_KIND_LABEL[k]}</option>
            ))}
          </select>
          <input
            type="number" inputMode="decimal" min={0} step="any"
            value={qty} onChange={(e) => setQty(e.target.value)}
            className="w-[64px] flex-none rounded-[9px] px-2 py-2 text-[13px] text-right gf-mono outline-none"
            style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", color: "var(--text)" }}
          />
          <Btn kind="subtle" icon={Plus} onClick={() => void addRule()}>Add</Btn>
        </div>
      </div>
    </ModalShell>
  );
}
