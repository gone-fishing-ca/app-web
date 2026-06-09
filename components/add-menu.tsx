"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { Btn } from "@/components/ui";
import { ADD_MENU_KINDS, KIND_META } from "@/components/itinerary-kit";
import type { ItineraryKind } from "@/lib/api";

/** "Add" button + dropdown of itinerary kinds. Selecting one opens the editor
 *  in create mode. Built on the open/click-outside pattern from ComboBox. */
export function AddMenu({ onPick }: { onPick: (kind: ItineraryKind) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <Btn kind="accent" icon={Plus} iconRight={ChevronDown} onClick={() => setOpen((v) => !v)}>
        Add
      </Btn>
      {open && (
        <div
          className="absolute right-0 z-30 mt-1.5 w-[184px] overflow-hidden rounded-[12px] shadow-lg"
          style={{ background: "var(--surface)", border: "1px solid var(--border-strong)" }}
        >
          {ADD_MENU_KINDS.map((k) => {
            const m = KIND_META[k];
            return (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setOpen(false);
                  onPick(k);
                }}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[14px]"
                style={{ color: "var(--text)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <span
                  className="grid place-items-center rounded-[7px]"
                  style={{ width: 24, height: 24, background: m.bg, color: m.fg }}
                >
                  <m.Icon size={14} strokeWidth={2.2} />
                </span>
                {m.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
