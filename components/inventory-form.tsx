"use client";

import { Field } from "@/components/ui";
import {
  INVENTORY_TYPES,
  type InventoryItem,
  type InventoryType,
  type QtyBasis,
  type QtyPeriod,
  type Responsibility,
} from "@/lib/api";

/* Shared editor state + field grid for a master inventory item — used by the
   trip Packing page's inline "new item" form and the global Inventory page. */

export type ItemDraft = {
  name: string;
  item_type: InventoryType;
  category: string;
  subcategory: string;
  unit: string;
  qty: string; // text — "" = no hint
  basis: QtyBasis;
  period: QtyPeriod;
  isSpare: boolean; // a backup item, not part of the working set
  responsibility: Responsibility;
  notes: string;
};

export function emptyItemDraft(name = "", type: InventoryType = "Gear"): ItemDraft {
  return {
    name: name.trim(), item_type: type, category: "", subcategory: "",
    unit: "", qty: "", basis: "per_person", period: "per_trip", isSpare: false,
    responsibility: "shared", notes: "",
  };
}

export function draftFromItem(item: InventoryItem): ItemDraft {
  return {
    name: item.name,
    item_type: item.item_type,
    category: item.category ?? "",
    subcategory: item.subcategory ?? "",
    unit: item.default_unit ?? "",
    qty: item.default_qty == null ? "" : String(item.default_qty),
    basis: item.qty_basis,
    period: item.qty_period,
    isSpare: item.is_spare,
    responsibility: item.default_responsibility,
    notes: item.notes ?? "",
  };
}

/** The draft as an InventoryItemIn body (POST /inventory or new_item). */
export function itemBodyFromDraft(d: ItemDraft) {
  return {
    name: d.name.trim(),
    item_type: d.item_type,
    category: d.category.trim() || null,
    subcategory: d.subcategory.trim() || null,
    default_unit: d.unit.trim() || null,
    default_qty: d.qty === "" ? null : Number(d.qty),
    qty_basis: d.basis,
    qty_period: d.period,
    is_spare: d.isSpare,
    default_responsibility: d.responsibility,
    notes: d.notes.trim() || null,
  };
}

export function SelectField({ label, value, options, onChange }: {
  label: string; value: string; options: [string, string][]; onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5 w-full">
      <span className="text-[12.5px] font-semibold" style={{ color: "var(--text-2)" }}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="rounded-[11px] py-3 px-3 text-[14px] w-full"
        style={{ background: "var(--surface)", border: "1px solid var(--border-strong)", color: "var(--text)" }}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

export function ItemFields({ draft, setDraft, autoFocusName, categoryHints = [] }: {
  draft: ItemDraft;
  setDraft: (d: ItemDraft) => void;
  autoFocusName?: boolean;
  /** Existing category names for the chosen type — lightweight autocomplete. */
  categoryHints?: string[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="Fish locator" autoFocus={autoFocusName} />
        <SelectField label="Type" value={draft.item_type} onChange={(v) => setDraft({ ...draft, item_type: v as InventoryType })}
          options={INVENTORY_TYPES.map((t) => [t, t])} />
        <Field label="Category" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}
          placeholder="Fishing" list="gf-category-hints" />
        <Field label="Subcategory" value={draft.subcategory} onChange={(e) => setDraft({ ...draft, subcategory: e.target.value })}
          placeholder="Boat Supplies" />
        {categoryHints.length > 0 && (
          <datalist id="gf-category-hints">
            {categoryHints.map((c) => <option key={c} value={c} />)}
          </datalist>
        )}
      </div>
      <div className="text-[12px] -mb-1" style={{ color: "var(--text-3)" }}>
        Quantity hint — used to suggest amounts from a trip&apos;s people, cabins, and days.
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Field label="Qty" type="number" value={draft.qty} onChange={(e) => setDraft({ ...draft, qty: e.target.value })} placeholder="1" />
        <Field label="Unit" value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} placeholder="oz / lbs / —" />
        <SelectField label="Per" value={draft.basis} onChange={(v) => setDraft({ ...draft, basis: v as QtyBasis })}
          options={[
            ["per_person", "Person (everyone)"],
            ["per_person_peak", "Person, peak week (handed off)"],
            ["per_cabin", "Cabin"],
            ["per_boat", "Boat (2 people)"],
            ["per_group", "Group"],
          ]} />
        <SelectField label="Over" value={draft.period} onChange={(v) => setDraft({ ...draft, period: v as QtyPeriod })}
          options={[["per_trip", "The trip"], ["per_day", "Each day"]]} />
      </div>
      <label className="inline-flex items-center gap-2 text-[13.5px]" style={{ color: "var(--text)" }}>
        <input type="checkbox" checked={draft.isSpare}
          onChange={(e) => setDraft({ ...draft, isSpare: e.target.checked })} />
        Spare — a backup item, not part of the working set
      </label>
      <SelectField label="Who brings it (default)" value={draft.responsibility}
        onChange={(v) => setDraft({ ...draft, responsibility: v as Responsibility })}
        options={[
          ["shared", "Shared — someone brings it for the group"],
          ["personal", "Personal — everyone brings their own"],
          ["personal_stored", "Personal, stored at HQ between trips"],
        ]} />
      <Field label="Notes" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
        placeholder="Bring 2 — they break" />
    </div>
  );
}
