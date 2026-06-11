"use client";

import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

/** Collapsed-group keys for one page, persisted in localStorage so the
 *  fold state survives reloads as the inventory grows. */
export function useCollapsedSet(storageKey: string) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setCollapsed(new Set(JSON.parse(raw) as string[]));
    } catch {
      // corrupted state — start expanded
    }
  }, [storageKey]);

  const toggle = useCallback((key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        localStorage.setItem(storageKey, JSON.stringify([...next]));
      } catch {
        // storage full/unavailable — state still works for this session
      }
      return next;
    });
  }, [storageKey]);

  return { isCollapsed: (key: string) => collapsed.has(key), toggle };
}

/** A collapsible category (level 1) or subcategory (level 2) header row:
 *  chevron + name + item count, and an optional "+" that adds an item
 *  pre-scoped to this group. */
export function GroupHeader({ level, label, count, open, onToggle, onAdd }: {
  level: 1 | 2;
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  onAdd?: () => void;
}) {
  return (
    <div className={`flex items-center gap-2 ${level === 1 ? "pl-3 sm:pl-4" : "pl-7 sm:pl-9"} pr-4 sm:pr-5 pt-2.5 pb-1`}>
      <button
        onClick={onToggle}
        title={open ? "Collapse" : "Expand"}
        className="inline-flex items-center gap-1.5 min-w-0"
        style={{ color: "var(--text-3)" }}
      >
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <span
          className={`truncate font-bold uppercase ${level === 1 ? "text-[11.5px]" : "text-[11px]"}`}
          style={{ letterSpacing: ".05em" }}
        >
          {label}
        </span>
        <span className="gf-mono text-[11px] font-semibold" style={{ color: "var(--text-3)" }}>
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
    </div>
  );
}
