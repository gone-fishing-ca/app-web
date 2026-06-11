"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, ArrowLeft, Boxes, MapPin, Pencil, Plus, Search, Trash2 } from "lucide-react";
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
  type StorageLocation,
} from "@/lib/api";
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
  const [locations, setLocations] = useState<StorageLocation[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [locOpen, setLocOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace("/login"); return; }
    api.get<InventoryItem[]>("/inventory?include_archived=true")
      .then(setItems)
      .catch((e) => setError(errMsg(e, "Failed to load inventory")));
    api.get<StorageLocation[]>("/storage-locations").then(setLocations).catch(() => {});
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
            <Btn kind="ghost" icon={MapPin} onClick={() => setLocOpen(true)}>
              Storage locations{locations.length > 0 ? ` (${locations.length})` : ""}
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
                              item.storage_location ? `at ${item.storage_location.name}` : null,
                              item.notes].filter(Boolean).join(" · ") || "—"}
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
            autoFocusName={!editing.item} categoryHints={categoryHints} locations={locations}
            onManageLocations={() => setLocOpen(true)} />
        </ModalShell>
      )}

      {locOpen && (
        <LocationsModal
          locations={locations}
          setLocations={setLocations}
          contacts={contacts}
          onChanged={() => {
            // Items embed their location — refresh so renames show up.
            api.get<InventoryItem[]>("/inventory?include_archived=true").then(setItems).catch(() => {});
          }}
          onClose={() => setLocOpen(false)}
        />
      )}
    </div>
  );
}

/* ---- Storage locations: where things live between trips --------------------- */
function LocationsModal({
  locations, setLocations, contacts, onChanged, onClose,
}: {
  locations: StorageLocation[];
  setLocations: (fn: (prev: StorageLocation[]) => StorageLocation[]) => void;
  contacts: Contact[];
  onChanged: () => void;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");

  async function addLocation() {
    const n = name.trim();
    if (!n) return;
    try {
      const created = await api.post<StorageLocation>("/storage-locations", { name: n });
      setLocations((prev) => [...prev, created]);
      setName("");
    } catch (e) {
      setError(errMsg(e, "Couldn't add the location"));
    }
  }

  async function patchLocation(loc: StorageLocation, body: Record<string, unknown>) {
    try {
      const updated = await api.patch<StorageLocation>(`/storage-locations/${loc.id}`, body);
      setLocations((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
      onChanged();
    } catch (e) {
      setError(errMsg(e, "Save failed"));
    }
  }

  async function deleteLocation(loc: StorageLocation) {
    if (!confirm(`Delete “${loc.name}”? This only works while no items are stored there.`)) return;
    try {
      await api.del(`/storage-locations/${loc.id}`);
      setLocations((prev) => prev.filter((l) => l.id !== loc.id));
    } catch (e) {
      setError(errMsg(e, "Delete failed — items are stored there"));
    }
  }

  return (
    <ModalShell
      title="Storage locations"
      subtitle="Where inventory lives between trips. The responsible person becomes the default “packed by” when a stored item goes on a trip's list."
      maxWidth={560}
      onClose={onClose}
    >
      {error && (
        <div className="mb-3 rounded-[10px] px-3 py-2 text-[13px]"
          style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{error}</div>
      )}
      <div className="flex flex-col gap-2">
        {locations.map((loc) => (
          <div key={loc.id} className="flex items-center gap-2">
            <input
              defaultValue={loc.name}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== loc.name) void patchLocation(loc, { name: v });
              }}
              className="flex-1 min-w-0 rounded-[9px] px-2.5 py-2 text-[13.5px] font-semibold outline-none"
              style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", color: "var(--text)" }}
            />
            <select
              value={loc.responsible_contact_id ?? ""}
              onChange={(e) => void patchLocation(loc, { responsible_contact_id: e.target.value || null })}
              title="Responsible person — the default packer for items stored here"
              className="rounded-[9px] px-2 py-2 text-[13px] w-[180px]"
              style={{
                background: "var(--surface)", border: "1px solid var(--border)",
                color: loc.responsible_contact_id ? "var(--text)" : "var(--text-3)",
              }}
            >
              <option value="">No one responsible</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button onClick={() => void deleteLocation(loc)} title="Delete location"
              className="grid place-items-center flex-none"
              style={{ width: 30, height: 30, borderRadius: 8, background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
              <Trash2 size={13} />
            </button>
          </div>
        ))}
        {locations.length === 0 && (
          <div className="py-4 text-center text-[13.5px]" style={{ color: "var(--text-3)" }}>
            No locations yet — “Greg's House”, “The storage unit”…
          </div>
        )}
        <div className="flex items-center gap-2 mt-1">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void addLocation(); }}
            placeholder="New location — Greg's House…"
            className="flex-1 min-w-0 rounded-[9px] px-2.5 py-2 text-[13.5px] outline-none"
            style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", color: "var(--text)" }}
          />
          <Btn kind="subtle" icon={Plus} onClick={() => void addLocation()}>Add</Btn>
        </div>
      </div>
    </ModalShell>
  );
}
