"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut } from "lucide-react";
import { Avatar, initialsOf } from "@/components/ui";
import { useAuth } from "@/lib/auth";

/** The upper-right account menu: avatar + first name + a dropdown. Sign Out
 *  lives in the dropdown; more account items will join it later. */
export function UserMenu() {
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (!user) return null;
  const firstName = user.name?.split(" ")[0] || user.email.split("@")[0];

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 pl-1 pr-2.5 py-1 rounded-full"
        style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
        title="Account"
      >
        <Avatar initials={initialsOf(user.name, user.email)} src={user.avatar_url} size={30} tone="primary" />
        <span className="hidden sm:inline text-[13px] font-semibold" style={{ color: "var(--text-2)" }}>
          {firstName}
        </span>
        <ChevronDown
          size={14}
          style={{ color: "var(--text-3)", transform: open ? "rotate(180deg)" : undefined, transition: "transform .15s" }}
        />
      </button>

      {open && (
        <div
          className="absolute right-0 z-30 mt-1.5 w-[230px] rounded-[12px] overflow-hidden shadow-lg"
          style={{ background: "var(--surface)", border: "1px solid var(--border-strong)" }}
        >
          <div className="px-3.5 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
            <div className="text-[13.5px] font-semibold truncate" style={{ color: "var(--text)" }}>
              {user.name || firstName}
            </div>
            <div className="text-[12px] truncate" style={{ color: "var(--text-3)" }}>{user.email}</div>
          </div>
          <div className="py-1">
            <button
              onClick={signOut}
              className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13.5px] font-medium"
              style={{ color: "var(--text)" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <LogOut size={15} style={{ color: "var(--text-3)" }} /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
