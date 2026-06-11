"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, ArrowLeft, Boxes, ChevronDown, ChevronRight, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { GroupHeader, useCollapsedSet } from "@/components/collapsible";
import {
  type ItemDraft,
  ItemFields,
  draftFromItem,
  emptyItemDraft,
  itemBodyFromDraft,
} from "@/components/inventory-form";
import { Badge, Btn, Card, EmptyState, Eyebrow, Field, ModalShell, Wordmark } from "@/components/ui";
import { UserMenu } from "@/components/user-menu";
import { api, INVENTORY_TYPES, type InventoryItem, type InventoryType } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { hintLabel } from "@/lib/packing";

const RESP_BADGE: Record<string, string> = {
  shared: "Shared",
  personal: "Personal",
  personal_stored: "Stored @ HQ",
};

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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace("/login"); return; }
    api.get<InventoryItem[]>("/inventory?include_archived=true")
      .then(setItems)
      .catch((e) => setError(errMsg(e, "Failed to load inventory")));
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

  const { isCollapsed, toggle } = useCollapsedSet("gf-inventory-collapsed");

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
          <Btn kind="accent" icon={Plus} onClick={() => setEditing({ item: null, draft: emptyItemDraft("", typeFilter === "All" ? "Gear" : typeFilter) })}>
            New item
          </Btn>
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
              const typeOpen = !isCollapsed(type);
              return (
              <Card key={type}>
                <button
                  onClick={() => toggle(type)}
                  className="flex w-full items-center gap-2.5 px-4 sm:px-5 py-3.5 text-left"
                  style={{ borderBottom: typeOpen ? "1px solid var(--border)" : "none" }}
                  title={typeOpen ? "Collapse" : "Expand"}
                >
                  {typeOpen
                    ? <ChevronDown size={16} style={{ color: "var(--text-3)" }} />
                    : <ChevronRight size={16} style={{ color: "var(--text-3)" }} />}
                  <div style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: "var(--display-weight)" as unknown as number,
                    letterSpacing: "var(--display-tracking)",
                    fontSize: 17, color: "var(--text)",
                  }}>
                    {type}
                  </div>
                  <Badge tone="neutral">{typeCount}</Badge>
                </button>
                {typeOpen && [...cats.entries()].map(([cat, subs]) => {
                  const catKey = `${type}|${cat}`;
                  const catCount = [...subs.values()].reduce((m, g) => m + g.length, 0);
                  const catOpen = !isCollapsed(catKey);
                  return (
                  <div key={cat}>
                    <GroupHeader level={1} label={cat} count={catCount} open={catOpen}
                      onToggle={() => toggle(catKey)}
                      onAdd={() => newItemIn(type, cat === "General" ? null : cat, null)} />
                    {catOpen && [...subs.entries()].map(([sub, group]) => {
                      const subKey = `${catKey}|${sub}`;
                      const subOpen = !sub || !isCollapsed(subKey);
                      return (
                      <div key={sub || "_"}>
                        {sub && (
                          <GroupHeader level={2} label={sub} count={group.length} open={subOpen}
                            onToggle={() => toggle(subKey)}
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
                            {[hintLabel(item), item.notes].filter(Boolean).join(" · ") || "—"}
                          </div>
                        </div>
                        <Badge tone={item.default_responsibility === "shared" ? "neutral" : "info"}>
                          {RESP_BADGE[item.default_responsibility]}
                        </Badge>
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
            autoFocusName={!editing.item} categoryHints={categoryHints} />
        </ModalShell>
      )}
    </div>
  );
}
