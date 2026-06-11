"use client";

import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui";

/** Fold state for one page's grouped list, persisted in localStorage.
 *
 *  Stores per-key *overrides* of each group's default, so defaults can differ
 *  by level (type cards default open, categories/subcategories default
 *  collapsed) and "expand/collapse all" is just a bulk override. */
export function useFoldState(storageKey: string) {
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setOverrides(JSON.parse(raw) as Record<string, boolean>);
    } catch {
      // corrupted state — fall back to defaults
    }
  }, [storageKey]);

  const apply = useCallback((updates: Record<string, boolean>) => {
    setOverrides((prev) => {
      const next = { ...prev, ...updates };
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // storage unavailable — state still works for this session
      }
      return next;
    });
  }, [storageKey]);

  const isOpen = useCallback(
    (key: string, defaultOpen: boolean) => overrides[key] ?? defaultOpen,
    [overrides],
  );
  const toggle = useCallback(
    (key: string, defaultOpen: boolean) => apply({ [key]: !isOpen(key, defaultOpen) }),
    [apply, isOpen],
  );
  const setMany = useCallback(
    (keys: string[], open: boolean) => apply(Object.fromEntries(keys.map((k) => [k, open]))),
    [apply],
  );

  return { isOpen, toggle, setMany };
}

/** Tiny "Expand all · Collapse all" link pair. */
export function FoldAllLinks({ onSetAll, size = 12, color = "var(--accent-600)" }: {
  onSetAll: (open: boolean) => void;
  size?: number;
  color?: string;
}) {
  return (
    <span className="ml-auto inline-flex items-center gap-1.5 flex-none font-semibold"
      style={{ fontSize: size, color: "var(--text-3)" }}>
      <button onClick={() => onSetAll(true)} style={{ color }}>Expand all</button>
      ·
      <button onClick={() => onSetAll(false)} style={{ color }}>Collapse all</button>
    </span>
  );
}

/** The collapsible type-card header: chevron + display-font title + count,
 *  with the bulk fold links on the right. */
export function TypeHeader({ label, count, open, onToggle, onSetAll }: {
  label: string;
  count: ReactNode;
  open: boolean;
  onToggle: () => void;
  onSetAll: (open: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2.5 px-4 sm:px-5 py-3.5"
      style={{ borderBottom: open ? "1px solid var(--border)" : "none" }}>
      <button onClick={onToggle} title={open ? "Collapse" : "Expand"}
        className="flex items-center gap-2.5 min-w-0 text-left">
        {open
          ? <ChevronDown size={16} style={{ color: "var(--text-3)" }} />
          : <ChevronRight size={16} style={{ color: "var(--text-3)" }} />}
        <span style={{
          fontFamily: "var(--font-display)",
          fontWeight: "var(--display-weight)" as unknown as number,
          letterSpacing: "var(--display-tracking)",
          fontSize: 17, color: "var(--text)",
        }}>
          {label}
        </span>
        <Badge tone="neutral">{count}</Badge>
      </button>
      <FoldAllLinks onSetAll={onSetAll} />
    </div>
  );
}

/** A collapsible category (level 1) or subcategory (level 2) header row:
 *  chevron + name + item count, an optional "+" that adds an item pre-scoped
 *  to this group, and optional bulk fold links (categories with subcategories). */
export function GroupHeader({ level, label, count, open, onToggle, onAdd, onSetAll }: {
  level: 1 | 2;
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  onAdd?: () => void;
  onSetAll?: (open: boolean) => void;
}) {
  // Tinted bands set the headers apart from the rows: categories in the
  // brighter teal, subcategories in the soft slate — both flip with dark mode.
  const band = level === 1
    ? { background: "var(--accent-100)", color: "var(--accent-600)" }
    : { background: "var(--primary-100)", color: "var(--primary)" };
  return (
    <div
      className={`flex items-center gap-2 ${level === 1 ? "pl-4 sm:pl-5 py-1.5" : "pl-8 sm:pl-10 py-1"} pr-4 sm:pr-5`}
      style={{ background: band.background }}
    >
      <button
        onClick={onToggle}
        title={open ? "Collapse" : "Expand"}
        className="inline-flex items-center gap-1.5 min-w-0"
        style={{ color: band.color }}
      >
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <span
          className={`truncate font-bold uppercase ${level === 1 ? "text-[11.5px]" : "text-[11px]"}`}
          style={{ letterSpacing: ".05em" }}
        >
          {label}
        </span>
        <span className="gf-mono text-[11px] font-semibold" style={{ opacity: 0.7 }}>
          {count}
        </span>
      </button>
      {onAdd && (
        <button
          onClick={onAdd}
          title={`Add an item to ${label}`}
          className="grid place-items-center flex-none"
          style={{
            width: 20, height: 20, borderRadius: 6,
            background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-3)",
          }}
        >
          <Plus size={11} />
        </button>
      )}
      {onSetAll && <FoldAllLinks onSetAll={onSetAll} size={11} color={band.color} />}
    </div>
  );
}
