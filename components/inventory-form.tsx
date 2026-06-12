"use client";

import { useState } from "react";
import { Btn, Field, ModalShell } from "@/components/ui";
import { sourceLabel } from "@/lib/packing";
import {
  api,
  INVENTORY_TYPES,
  type InventoryItem,
  type InventoryType,
  type PrefRule,
  type PrefType,
  type QtyBasis,
  type QtyPeriod,
  type Source,
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
  collectPrefs: boolean; // quantity from member prefs instead of the hint
  prefRuleId: string; // "" = no shared rule
  prefType: PrefType; // int | float | bool (Yes/No)
  prefIncrement: string; // text — the +/- step
  prefDefault: string; // text — "" = no default
  isPersonal: boolean; // everyone brings their own; off = shared/managed
  isMenuItem: boolean; // planned per-day on the Menu page; hint = qty/unit per meal
  sourceId: string; // "" = no designated source (brought from home)
  notes: string;
};

export function emptyItemDraft(name = "", type: InventoryType = "Gear"): ItemDraft {
  // 1 / group / trip is the most common hint — most items are one-offs the
  // group brings once.
  return {
    name: name.trim(), item_type: type, category: "", subcategory: "",
    unit: "", qty: "1", basis: "per_group", period: "per_trip", isSpare: false,
    collectPrefs: false, prefRuleId: "", prefType: "int", prefIncrement: "1",
    prefDefault: "", isPersonal: false, isMenuItem: false, sourceId: "", notes: "",
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
    collectPrefs: item.collect_prefs,
    prefRuleId: item.pref_rule_id ?? "",
    prefType: item.pref_type,
    prefIncrement: String(item.pref_increment),
    prefDefault: item.pref_default == null ? "" : String(item.pref_default),
    isPersonal: item.is_personal,
    isMenuItem: item.is_menu_item,
    sourceId: item.source_id ?? "",
    notes: item.notes ?? "",
  };
}

/** The draft as an InventoryItemIn body (POST /inventory or new_item).
 *  Personal items are pinned to per-person / per-trip with no source — each
 *  person brings their own from home. */
export function itemBodyFromDraft(d: ItemDraft) {
  return {
    name: d.name.trim(),
    item_type: d.item_type,
    category: d.category.trim() || null,
    subcategory: d.subcategory.trim() || null,
    default_unit: d.unit.trim() || null,
    default_qty: d.qty === "" ? null : Number(d.qty),
    qty_basis: d.isPersonal ? "per_person" : d.isMenuItem ? "per_group" : d.basis,
    qty_period: d.isPersonal || d.isMenuItem ? "per_trip" : d.period,
    is_spare: d.isSpare,
    collect_prefs: d.collectPrefs,
    pref_rule_id: d.collectPrefs ? d.prefRuleId || null : null,
    pref_type: d.prefType,
    pref_increment: d.prefIncrement === "" ? 1 : Number(d.prefIncrement),
    pref_default: d.prefDefault === "" ? null : Number(d.prefDefault),
    is_personal: d.isPersonal,
    is_menu_item: d.isMenuItem,
    source_id: d.isPersonal ? null : d.sourceId || null,
    notes: d.notes.trim() || null,
  };
}

/** "Lunchmeat — 2/day" — how a rule reads in the pickers. */
export function prefRuleOption(r: PrefRule): string {
  const qty = Number.isInteger(r.qty) ? String(r.qty) : r.qty.toFixed(1);
  const suffix = r.kind === "per_day" ? `${qty}/day` : r.kind === "max" ? `max ${qty}` : `${qty} total`;
  return `${r.name} — ${suffix}`;
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

export function ItemFields({ draft, setDraft, autoFocusName, categoryHints = [], sources = [], prefRules = [], onManageSources }: {
  draft: ItemDraft;
  setDraft: (d: ItemDraft) => void;
  autoFocusName?: boolean;
  /** Existing category names for the chosen type — lightweight autocomplete. */
  categoryHints?: string[];
  /** Sources (storage / buyer / outfitter) for the "Source" select. */
  sources?: Source[];
  /** Shared quantity rules offered to prefs items. */
  prefRules?: PrefRule[];
  /** Opens the sources manager (shown as a link under the select). */
  onManageSources?: () => void;
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
      {!draft.collectPrefs && (
        <>
          <div className="text-[12px] -mb-1" style={{ color: "var(--text-3)" }}>
            {draft.isPersonal
              ? "Quantity hint — how many each person brings for the trip."
              : draft.isMenuItem
                ? "Quantity hint — how much of this feeds the group for one meal."
                : "Quantity hint — used to suggest amounts from a trip's people, cabins, and days."}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Field label="Qty" type="number" value={draft.qty} onChange={(e) => setDraft({ ...draft, qty: e.target.value })} placeholder="1" />
            <Field label="Unit" value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} placeholder="oz / lbs / —" />
            {/* Personal/Menu pin the basis & period — only qty/unit are editable. */}
            {!draft.isPersonal && !draft.isMenuItem && (
              <>
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
              </>
            )}
          </div>
        </>
      )}
      {draft.collectPrefs && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SelectField label="Answer type" value={draft.prefType}
              onChange={(v) => setDraft({ ...draft, prefType: v as PrefType })}
              options={[["int", "Number"], ["float", "Decimal"], ["bool", "Yes / No"]]} />
            {draft.prefType !== "bool" && (
              <Field label="Step (+/−)" type="number" value={draft.prefIncrement}
                onChange={(e) => setDraft({ ...draft, prefIncrement: e.target.value })}
                placeholder="1" />
            )}
            <Field label={draft.prefType === "bool" ? "Default (1 = yes)" : "Default answer"}
              type="number" value={draft.prefDefault}
              onChange={(e) => setDraft({ ...draft, prefDefault: e.target.value })}
              placeholder="—" />
            <Field label="Unit" value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} placeholder="cases / —" />
          </div>
          <SelectField label="Pref rule (shared target)" value={draft.prefRuleId}
            onChange={(v) => setDraft({ ...draft, prefRuleId: v })}
            options={[["", "No rule"],
              ...prefRules.map((r): [string, string] => [r.id, prefRuleOption(r)])]} />
        </>
      )}
      {/* Personal / Prefs / Menu are mutually exclusive ways an item's
          quantity gets decided: each person's whim, the group's answers, or
          the day-by-day menu. */}
      <label className="inline-flex items-center gap-2 text-[13.5px]" style={{ color: "var(--text)" }}>
        <input type="checkbox" checked={draft.isPersonal}
          onChange={(e) => setDraft(e.target.checked
            // Personal implies per-person over the trip, brought from home — pin
            // the hint and clear the source (the controls hide while checked).
            ? { ...draft, isPersonal: true, collectPrefs: false, isMenuItem: false, basis: "per_person", period: "per_trip", sourceId: "" }
            : { ...draft, isPersonal: false })} />
        Personal — everyone brings their own (if they want)
      </label>
      <label className="inline-flex items-center gap-2 text-[13.5px]" style={{ color: "var(--text)" }}>
        <input type="checkbox" checked={draft.collectPrefs}
          onChange={(e) => setDraft({ ...draft, collectPrefs: e.target.checked, isPersonal: e.target.checked ? false : draft.isPersonal, isMenuItem: e.target.checked ? false : draft.isMenuItem })} />
        Prefs — group members choose how many they want
      </label>
      <label className="inline-flex items-center gap-2 text-[13.5px]" style={{ color: "var(--text)" }}>
        <input type="checkbox" checked={draft.isMenuItem}
          onChange={(e) => setDraft(e.target.checked
            // Menu items are planned per-day; basis/period don't apply.
            ? { ...draft, isMenuItem: true, isPersonal: false, collectPrefs: false, basis: "per_group", period: "per_trip", qty: draft.qty || "1" }
            : { ...draft, isMenuItem: false })} />
        Menu item — planned day-by-day on the trip Menu page
      </label>
      <label className="inline-flex items-center gap-2 text-[13.5px]" style={{ color: "var(--text)" }}>
        <input type="checkbox" checked={draft.isSpare}
          onChange={(e) => setDraft({ ...draft, isSpare: e.target.checked })} />
        Spare — a backup item, not part of the working set
      </label>
      {/* Personal items come from home by definition — no source to pick. */}
      {!draft.isPersonal && (
        <div className="flex flex-col gap-1">
          <SelectField label="Source — where it comes from" value={draft.sourceId}
            onChange={(v) => setDraft({ ...draft, sourceId: v })}
            options={[
              ["", sources.length > 0 ? "No source — brought from home" : "No sources yet"],
              ...sources.map((s): [string, string] => [s.id, sourceLabel(s) ?? s.name]),
            ]} />
          <span className="text-[12px]" style={{ color: "var(--text-3)" }}>
            {onManageSources ? (
              <button type="button" onClick={onManageSources} style={{ color: "var(--accent-600)", fontWeight: 600 }}>
                Manage sources…
              </button>
            ) : (
              <>Sources (and who packs from them) are managed on the Inventory page.</>
            )}
          </span>
        </div>
      )}
      <Field label="Notes" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
        placeholder="Bring 2 — they break" />
    </div>
  );
}

/** THE master-item edit modal — one component so every entry point (Inventory
 *  page, the packing modal's "Edit master inventory item" link) stays in sync.
 *  Owns its draft and the PATCH; callers get the updated item via onSaved to
 *  re-resolve anything that inherits from it. */
export function ItemEditModal({ item, sources = [], prefRules = [], categoryHints = [], onManageSources, onSaved, onClose }: {
  item: InventoryItem;
  sources?: Source[];
  prefRules?: PrefRule[];
  categoryHints?: string[];
  onManageSources?: () => void;
  onSaved: (item: InventoryItem) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<ItemDraft>(draftFromItem(item));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const updated = await api.patch<InventoryItem>(`/inventory/${item.id}`, itemBodyFromDraft(draft));
      onSaved(updated);
      onClose();
    } catch (e) {
      setError(e && typeof e === "object" && "message" in e
        ? String((e as { message?: string }).message)
        : "Save failed (only the item's owner can edit it)");
    }
    setBusy(false);
  }

  return (
    <ModalShell
      title={`Edit “${item.name}”`}
      subtitle="Changes apply everywhere this item is used."
      maxWidth={620}
      onClose={onClose}
      footer={
        <>
          <Btn kind="ghost" onClick={onClose}>Cancel</Btn>
          <Btn kind="accent" disabled={busy || !draft.name.trim()} onClick={() => void save()}>
            {busy ? "Saving…" : "Save"}
          </Btn>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {error && (
          <div className="rounded-[10px] px-3 py-2 text-[13px]"
            style={{ background: "var(--danger-bg)", color: "var(--danger)" }}>{error}</div>
        )}
        <ItemFields draft={draft} setDraft={setDraft} categoryHints={categoryHints}
          sources={sources} prefRules={prefRules} onManageSources={onManageSources} />
      </div>
    </ModalShell>
  );
}
