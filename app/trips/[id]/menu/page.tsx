"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import { UtensilsCrossed, X } from "lucide-react";
import { Badge, Card, EmptyState, SectionTitle } from "@/components/ui";
import {
  api,
  type InventoryItem,
  type Meal,
  type MenuEntry,
  type Segment,
  type Stay,
} from "@/lib/api";
import { fmtQty } from "@/lib/packing";

function errMsg(e: unknown, fallback: string): string {
  return e && typeof e === "object" && "message" in e
    ? String((e as { message?: string }).message)
    : fallback;
}

const MEALS: { meal: Meal; label: string }[] = [
  { meal: "breakfast", label: "Breakfast" },
  { meal: "dinner", label: "Dinner" },
];

// Course order within a meal: the canonical courses first, then any other
// subcategory alphabetically. No subcategory sorts before everything and
// renders without a header.
const COURSE_ORDER = ["appetizers", "main", "sides", "dessert"];

function courseKey(sub: string | null | undefined): { rank: number; name: string } {
  const s = (sub ?? "").trim();
  if (!s) return { rank: -1, name: "" };
  const i = COURSE_ORDER.indexOf(s.toLowerCase());
  return i >= 0 ? { rank: i, name: s } : { rank: COURSE_ORDER.length, name: s.toLowerCase() };
}

function compareCourse(a: string | null | undefined, b: string | null | undefined): number {
  const ka = courseKey(a), kb = courseKey(b);
  return ka.rank - kb.rank || ka.name.localeCompare(kb.name);
}

/* All date math in UTC slices of YYYY-MM-DD — no timezone drift. */
function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function fmtDay(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", timeZone: "UTC",
  });
}

/** A week's menu days. The shared boundary day (swap day) belongs to the week
 *  that starts on it; the final week keeps its fly-out day. */
function daysOf(seg: Segment, isLast: boolean): string[] {
  if (!seg.start_date || !seg.end_date) return [];
  const days: string[] = [];
  for (let d = seg.start_date; d <= seg.end_date; d = addDays(d, 1)) {
    if (d === seg.end_date && !isLast) break;
    days.push(d);
  }
  return days;
}

export default function MenuPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: tripId } = use(params);
  const [entries, setEntries] = useState<MenuEntry[] | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [stays, setStays] = useState<Stay[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<MenuEntry[]>(`/trips/${tripId}/menu`).then(setEntries).catch((e) => setError(errMsg(e, "Load failed")));
    api.get<InventoryItem[]>(`/inventory`).then(setInventory).catch(() => {});
    api.get<Segment[]>(`/trips/${tripId}/segments`).then(setSegments).catch(() => {});
    api.get<Stay[]>(`/trips/${tripId}/stays`).then(setStays).catch(() => {});
  }, [tripId]);

  // The pickable items per meal: menu-flagged Food whose category matches the
  // meal name ("Breakfast" / "Dinner" categories under Food).
  const itemsFor = useMemo(() => {
    const byMeal = new Map<Meal, InventoryItem[]>();
    for (const { meal } of MEALS) {
      byMeal.set(meal, inventory.filter((i) =>
        i.is_menu_item && !i.archived && i.item_type === "Food"
        && (i.category ?? "").trim().toLowerCase() === meal,
      ));
    }
    return byMeal;
  }, [inventory]);
  const menuItemCount = [...itemsFor.values()].reduce((n, list) => n + list.length, 0);

  const attendance = useMemo(() => {
    const bySeg = new Map<string, number>();
    for (const s of stays) bySeg.set(s.segment_id, (bySeg.get(s.segment_id) ?? 0) + 1);
    return bySeg;
  }, [stays]);

  const entryFor = (date: string, meal: Meal, itemId: string): MenuEntry | null =>
    (entries ?? []).find((e) => e.date === date && e.meal === meal && e.inventory_item_id === itemId) ?? null;

  /** Saves serialized per (date, meal, item): one PUT in flight, only the
   *  newest value queued behind it (the prefs-stepper pattern — out-of-order
   *  responses would snap the count back). */
  const saves = useRef(new Map<string, { busy: boolean; next?: number }>());
  async function push(date: string, meal: Meal, itemId: string, qty: number) {
    const key = `${date}:${meal}:${itemId}`;
    const q = saves.current.get(key) ?? { busy: false };
    saves.current.set(key, q);
    if (q.busy) { q.next = qty; return; }
    q.busy = true;
    delete q.next;
    try {
      const saved = await api.put<MenuEntry>(`/trips/${tripId}/menu`, {
        date, meal, inventory_item_id: itemId, quantity: qty,
      });
      if (q.next === undefined) {
        setEntries((prev) => {
          const rest = (prev ?? []).filter((e) => !(e.date === date && e.meal === meal && e.inventory_item_id === itemId));
          return saved.quantity > 0 ? [...rest, saved] : rest;
        });
      }
    } catch (e) {
      setError(errMsg(e, "Save failed"));
    }
    q.busy = false;
    if (q.next !== undefined) {
      const nv = q.next;
      delete q.next;
      void push(date, meal, itemId, nv);
    }
  }

  function setQty(date: string, meal: Meal, item: InventoryItem, qty: number) {
    setEntries((prev) => {
      const rest = (prev ?? []).filter((e) => !(e.date === date && e.meal === meal && e.inventory_item_id === item.id));
      if (qty <= 0) return rest;
      const existing = entryFor(date, meal, item.id);
      return [...rest, existing
        ? { ...existing, quantity: qty }
        : { id: `tmp-${date}:${meal}:${item.id}`, trip_id: tripId, date, meal, inventory_item_id: item.id, quantity: qty, item }];
    });
    void push(date, meal, item.id, qty);
  }

  function MealBlock({ date, meal, label }: { date: string; meal: Meal; label: string }) {
    const pickable = itemsFor.get(meal) ?? [];
    const picked = (entries ?? [])
      .filter((e) => e.date === date && e.meal === meal)
      .sort((a, b) =>
        compareCourse(a.item.subcategory, b.item.subcategory)
        || a.item.name.localeCompare(b.item.name));
    const remaining = pickable
      .filter((i) => !picked.some((e) => e.inventory_item_id === i.id))
      .sort((a, b) => compareCourse(a.subcategory, b.subcategory) || a.name.localeCompare(b.name));
    // Course headers only when some pick has a subcategory; consecutive
    // grouping holds because `picked` is sorted by course.
    const courses: { sub: string; entries: typeof picked }[] = [];
    for (const e of picked) {
      const sub = (e.item.subcategory ?? "").trim();
      const last = courses[courses.length - 1];
      if (last && last.sub === sub) last.entries.push(e);
      else courses.push({ sub, entries: [e] });
    }
    const showHeaders = courses.some((c) => c.sub);
    return (
      <div className="min-w-0">
        <div className="text-[11px] font-bold uppercase mb-1.5"
          style={{ letterSpacing: ".05em", color: "var(--text-3)" }}>
          {label}
        </div>
        <div className="flex flex-col gap-1">
          {courses.map((course) => (
            <div key={course.sub || "_"} className="flex flex-col gap-1">
              {/* compact course band — the prefs/pack-list header style */}
              {showHeaders && course.sub && (
                <div className="rounded-[6px] px-2 py-0.5" style={{ background: "var(--primary-100)" }}>
                  <span className="block truncate text-[10.5px] font-bold uppercase"
                    style={{ letterSpacing: ".05em", color: "var(--primary)" }}>
                    {course.sub}
                  </span>
                </div>
              )}
              {course.entries.map((e) => (
                <div key={e.inventory_item_id} className="flex items-center gap-2">
                  <span className="flex-1 min-w-0 truncate text-[13.5px] font-semibold" style={{ color: "var(--text)" }}>
                    {e.item.name}
                  </span>
                  {/* plain quantity box (float); clearing or 0 removes the pick */}
                  <input
                    key={`${e.inventory_item_id}-${e.quantity}`}
                    type="number" inputMode="decimal" min={0} step="any"
                    defaultValue={fmtQty(e.quantity)}
                    onBlur={(ev) => {
                      const v = ev.target.value === "" ? 0 : Number(ev.target.value);
                      if (v !== e.quantity) setQty(date, meal, e.item, Math.max(0, v));
                    }}
                    className="w-[56px] flex-none rounded-[9px] px-2 py-1 text-[13px] text-right gf-mono outline-none"
                    style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", color: "var(--text)" }}
                  />
                  {/* fixed-width unit slot so the inputs align down the column */}
                  <span className="w-[58px] flex-none truncate text-[12px]"
                    title={e.item.default_unit ?? undefined} style={{ color: "var(--text-3)" }}>
                    {e.item.default_unit ?? ""}
                  </span>
                  <button onClick={() => setQty(date, meal, e.item, 0)} title="Remove from this meal"
                    className="grid place-items-center flex-none"
                    style={{ width: 22, height: 22, borderRadius: 6, color: "var(--text-3)" }}>
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          ))}
          {remaining.length > 0 && (
            <select
              value=""
              onChange={(ev) => {
                const item = remaining.find((i) => i.id === ev.target.value);
                if (item) setQty(date, meal, item, item.default_qty ?? 1);
              }}
              className="self-start rounded-[9px] px-2 py-1 text-[12.5px] font-semibold"
              style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-3)", maxWidth: "100%" }}
            >
              <option value="">+ Add…</option>
              {remaining.map((i) => (
                <option key={i.id} value={i.id}>
                  {(i.subcategory ? `${i.subcategory} · ` : "")}{i.name}
                  {i.default_unit ? ` (${fmtQty(i.default_qty ?? 1)} ${i.default_unit})` : ""}
                </option>
              ))}
            </select>
          )}
          {picked.length === 0 && remaining.length === 0 && (
            <span className="text-[12.5px]" style={{ color: "var(--text-3)" }}>
              No {label.toLowerCase()} menu items in your inventory yet.
            </span>
          )}
        </div>
      </div>
    );
  }

  // The packing-list totals: synced menu items with their summed quantity,
  // plus the ingredients of any dish on the menu (a dish itself never syncs a
  // line — its ingredients are what gets packed). An item can be both.
  const totals = useMemo(() => {
    const byItem = new Map<string, { item: InventoryItem; qty: number | null; uses: string[] }>();
    const dishTotals = new Map<string, number>();
    for (const e of entries ?? []) {
      if (e.item.menu_no_pack) {
        dishTotals.set(e.inventory_item_id, (dishTotals.get(e.inventory_item_id) ?? 0) + e.quantity);
        continue;
      }
      const t = byItem.get(e.inventory_item_id) ?? { item: e.item, qty: 0, uses: [] };
      t.qty = (t.qty ?? 0) + e.quantity;
      byItem.set(e.inventory_item_id, t);
    }
    for (const dish of inventory) {
      const total = dishTotals.get(dish.id);
      if (!total || !dish.ingredient_ids?.length) continue;
      for (const ingId of dish.ingredient_ids) {
        const ing = inventory.find((i) => i.id === ingId);
        if (!ing) continue;
        const t = byItem.get(ingId) ?? { item: ing, qty: null, uses: [] };
        t.uses.push(`${dish.name} (${fmtQty(total)})`);
        byItem.set(ingId, t);
      }
    }
    return [...byItem.values()].sort((a, b) => a.item.name.localeCompare(b.item.name));
  }, [entries, inventory]);

  const weeks = segments.filter((s) => s.start_date && s.end_date);

  return (
    <div className="p-4 sm:p-7 max-w-[860px] mx-auto">
      <SectionTitle>Menu</SectionTitle>

      {error && (
        <div className="mb-4 rounded-[10px] px-3 py-2.5 text-[13px]"
          style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{error}</div>
      )}

      {entries === null ? (
        <div style={{ color: "var(--text-3)" }}>Loading…</div>
      ) : weeks.length === 0 ? (
        <EmptyState icon={UtensilsCrossed} title="No dated weeks yet"
          subtitle="Give the trip's weeks dates on the Schedule page, then plan breakfast and dinner for each day here." />
      ) : (
        <div className="flex flex-col gap-5">
          {menuItemCount === 0 && (
            <div className="rounded-[10px] px-3 py-2.5 text-[13px]"
              style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
              No menu items yet — mark Food items in &ldquo;Breakfast&rdquo; or &ldquo;Dinner&rdquo;
              categories as <strong>Menu item</strong> on the Inventory page and they become pickable here.
            </div>
          )}
          {weeks.map((seg, idx) => {
            const days = daysOf(seg, idx === weeks.length - 1);
            const people = attendance.get(seg.id) ?? 0;
            return (
              <Card key={seg.id}>
                <div className="flex items-center gap-2.5 px-4 sm:px-5 py-3.5">
                  <UtensilsCrossed size={18} strokeWidth={1.9} style={{ color: "var(--accent-600)" }} />
                  <div className="flex-1 min-w-0">
                    <div style={{
                      fontFamily: "var(--font-display)",
                      fontWeight: "var(--display-weight)" as unknown as number,
                      letterSpacing: "var(--display-tracking)",
                      fontSize: 16.5, color: "var(--text)",
                    }}>
                      {seg.name}
                    </div>
                    <div className="text-[12px]" style={{ color: "var(--text-3)" }}>
                      {fmtDay(seg.start_date!)} – {fmtDay(seg.end_date!)}
                    </div>
                  </div>
                  <Badge tone="neutral">{people} {people === 1 ? "person" : "people"}</Badge>
                </div>
                {days.map((day) => (
                  <div key={day} className="px-4 sm:px-5 py-3" style={{ borderTop: "1px solid var(--border)" }}>
                    <div className="text-[13px] font-bold mb-2" style={{ color: "var(--text)" }}>
                      {fmtDay(day)}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                      {MEALS.map(({ meal, label }) => (
                        <MealBlock key={meal} date={day} meal={meal} label={label} />
                      ))}
                    </div>
                  </div>
                ))}
              </Card>
            );
          })}

          {totals.length > 0 && (
            <Card>
              <div className="px-4 sm:px-5 py-3.5">
                <div style={{
                  fontFamily: "var(--font-display)",
                  fontWeight: "var(--display-weight)" as unknown as number,
                  letterSpacing: "var(--display-tracking)",
                  fontSize: 16.5, color: "var(--text)",
                }}>
                  On the packing list
                </div>
                <div className="text-[12px]" style={{ color: "var(--text-3)" }}>
                  Menu totals — kept in sync automatically as the trip&apos;s packing quantities.
                  Dish ingredients are listed too; size them on the Packing page.
                </div>
              </div>
              {totals.map(({ item, qty, uses }) => (
                <div key={item.id} className="flex items-center gap-3 px-4 sm:px-5 py-2"
                  style={{ borderTop: "1px solid var(--border)" }}>
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-[13.5px] font-semibold" style={{ color: "var(--text)" }}>
                      {item.name}
                    </div>
                    {uses.length > 0 && (
                      <div className="truncate text-[12px]" style={{ color: "var(--text-3)" }}>
                        Used for: {uses.join(", ")}
                      </div>
                    )}
                  </div>
                  <span className="text-[13px] gf-mono flex-none" style={{ color: "var(--text-2)" }}>
                    {qty != null
                      ? `${fmtQty(qty)}${item.default_unit ? ` ${item.default_unit}` : ""}`
                      : ""}
                  </span>
                </div>
              ))}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
