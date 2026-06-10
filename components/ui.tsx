"use client";

import { clsx } from "clsx";
import { Check, ChevronDown, type LucideIcon, Plus, Search, X } from "lucide-react";
import {
  type ButtonHTMLAttributes,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
  forwardRef,
  useEffect,
  useRef,
  useState,
} from "react";

/* ---- Wordmark (no glyph here — just the type) ---------------------------- */
export function Wordmark({ size = 20, glyph = false, mode = "light" as "light" | "dark" }: {
  size?: number; glyph?: boolean; mode?: "light" | "dark";
}) {
  const gs = Math.round(size * 1.4);
  return (
    <div className="inline-flex items-center gap-2">
      {glyph && (
        <img
          src={mode === "dark" ? "/walleye/walleye-glyph-white.png" : "/walleye/walleye-glyph-navy.png"}
          alt=""
          style={{ height: gs, width: "auto" }}
        />
      )}
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: "var(--display-weight)" as unknown as number,
          letterSpacing: "var(--display-tracking)",
          fontSize: size,
          color: "var(--text)",
          whiteSpace: "nowrap",
        }}
      >
        Gone Fishing
      </span>
    </div>
  );
}

/* ---- Button -------------------------------------------------------------- */
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  kind?: "primary" | "accent" | "ghost" | "subtle" | "danger";
  size?: "sm" | "md" | "lg";
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  full?: boolean;
};

export const Btn = forwardRef<HTMLButtonElement, BtnProps>(function Btn(
  { kind = "primary", size = "md", icon: Icon, iconRight: IconRight, full, className, children, ...rest },
  ref,
) {
  const pads = size === "sm" ? "px-3 py-2" : size === "lg" ? "px-5 py-3" : "px-4 py-2.5";
  const fs = size === "sm" ? "text-[13px]" : size === "lg" ? "text-[15px]" : "text-sm";
  const iconSize = size === "sm" ? 15 : 17;
  const kinds: Record<string, CSSProperties> = {
    primary: { background: "var(--primary)", color: "var(--on-primary)", border: "1px solid transparent" },
    accent: { background: "var(--accent)", color: "var(--on-accent)", border: "1px solid transparent" },
    ghost: { background: "transparent", color: "var(--text)", border: "1px solid var(--border-strong)" },
    subtle: { background: "var(--surface-2)", color: "var(--text)", border: "1px solid var(--border)" },
    danger: { background: "var(--danger)", color: "#fff", border: "1px solid transparent" },
  };
  return (
    <button
      ref={ref}
      className={clsx(
        "inline-flex items-center justify-center gap-2 font-semibold whitespace-nowrap rounded-[11px] transition hover:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed",
        pads, fs, full && "w-full",
        className,
      )}
      style={kinds[kind]}
      {...rest}
    >
      {Icon && <Icon size={iconSize} strokeWidth={2} />}
      {children}
      {IconRight && <IconRight size={iconSize} strokeWidth={2} />}
    </button>
  );
});

/* ---- Badge --------------------------------------------------------------- */
export function Badge({
  children, tone = "neutral", dot,
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "info" | "accent";
  dot?: boolean;
}) {
  const map: Record<string, { bg: string; fg: string; bd: string }> = {
    neutral: { bg: "var(--surface-2)", fg: "var(--text-2)", bd: "var(--border)" },
    success: { bg: "var(--success-bg)", fg: "var(--success)", bd: "transparent" },
    warning: { bg: "var(--warning-bg)", fg: "var(--warning)", bd: "transparent" },
    danger: { bg: "var(--danger-bg)", fg: "var(--danger)", bd: "transparent" },
    info: { bg: "var(--info-bg)", fg: "var(--info)", bd: "transparent" },
    accent: { bg: "var(--accent-100)", fg: "var(--accent-600)", bd: "transparent" },
  };
  const s = map[tone];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full text-[11.5px] font-bold tracking-wide whitespace-nowrap"
      style={{ background: s.bg, color: s.fg, border: `1px solid ${s.bd}`, padding: "3px 10px" }}
    >
      {dot && <span style={{ width: 6, height: 6, borderRadius: 999, background: s.fg }} />}
      {children}
    </span>
  );
}

/* ---- Eyebrow ------------------------------------------------------------- */
export function Eyebrow({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      className="text-[11.5px] font-bold uppercase"
      style={{ letterSpacing: "0.14em", color: "var(--text-3)", ...style }}
    >
      {children}
    </div>
  );
}

/* ---- Card ---------------------------------------------------------------- */
export function Card({ children, className, style, pad }: {
  children: ReactNode; className?: string; style?: CSSProperties; pad?: number | string;
}) {
  return (
    <div
      className={clsx("rounded-2xl", className)}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-sm)",
        padding: pad,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* ---- Avatar -------------------------------------------------------------- */
/** Up to two initials for an avatar: first letters of the first two words of the
 *  name, falling back to the email's local part. */
export function initialsOf(name?: string | null, email?: string | null): string {
  const base = name?.trim() || email?.split("@")[0]?.trim() || "";
  return (
    base.split(/\s+/).slice(0, 2).map((w) => w[0] ?? "").join("").toUpperCase() || "?"
  );
}

/** Circle avatar: the SSO profile photo when `src` is set (and loads), the
 *  initials otherwise. */
export function Avatar({ initials, src, size = 34, tone = "surface" }: {
  initials: string; src?: string | null; size?: number; tone?: "surface" | "primary" | "accent";
}) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);
  const map: Record<string, CSSProperties> = {
    surface: { background: "var(--surface-2)", color: "var(--text-2)", border: "1px solid var(--border)" },
    primary: { background: "var(--primary)", color: "var(--on-primary)", border: "1px solid transparent" },
    accent: { background: "var(--accent)", color: "var(--on-accent)", border: "1px solid transparent" },
  };
  return (
    <span
      className="inline-grid place-items-center rounded-full font-bold overflow-hidden flex-none"
      style={{ width: size, height: size, fontSize: size * 0.38, ...map[tone] }}
    >
      {src && !broken ? (
        <img
          src={src}
          alt=""
          // Google CDN avatar URLs 403 when a referrer is sent.
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        initials
      )}
    </span>
  );
}

/* ---- Field --------------------------------------------------------------- */
type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  icon?: LucideIcon;
  hint?: string;
  trailing?: ReactNode;
};

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, icon: Icon, hint, trailing, className, ...rest }, ref,
) {
  return (
    <label className="flex flex-col gap-1.5 w-full">
      {label && (
        <span className="text-[12.5px] font-semibold" style={{ color: "var(--text-2)" }}>
          {label}
        </span>
      )}
      <span
        className="flex items-center rounded-[11px] focus-within:ring-[3px]"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border-strong)",
          // @ts-expect-error css var passes through
          "--tw-ring-color": "var(--accent-100)",
        }}
      >
        {Icon && (
          <span className="pl-3 flex" style={{ color: "var(--text-3)" }}>
            <Icon size={17} strokeWidth={1.9} />
          </span>
        )}
        <input
          ref={ref}
          className={clsx("flex-1 min-w-0 bg-transparent outline-none text-[14.5px] py-3", Icon ? "px-2.5" : "px-3.5", className)}
          style={{ color: "var(--text)" }}
          {...rest}
        />
        {trailing && <span className="pr-3">{trailing}</span>}
      </span>
      {hint && <span className="text-xs" style={{ color: "var(--text-3)" }}>{hint}</span>}
    </label>
  );
});

/* ---- ComboBox (pick existing, or create new) ----------------------------- */
export type ComboOption = { value: string; label: string; hint?: string };

/** Searchable single-select dropdown with an optional "+ Create" affordance —
 *  the standard "pick from the catalog, or add a new one" pattern. Pass `onCreate`
 *  to surface a create row for whatever the user has typed. */
export function ComboBox({
  label, value, options, placeholder = "Select…", onSelect, onCreate, createLabel, disabled,
}: {
  label?: string;
  value: string | null;
  options: ComboOption[];
  placeholder?: string;
  onSelect: (value: string) => void;
  onCreate?: (query: string) => void;
  createLabel?: (query: string) => string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const selected = options.find((o) => o.value === value) ?? null;
  const q = query.trim().toLowerCase();
  const filtered = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  const exact = options.some((o) => o.label.toLowerCase() === q);
  const showCreate = onCreate && q.length > 0 && !exact;

  function close() { setOpen(false); setQuery(""); }

  return (
    <label className="flex flex-col gap-1.5 w-full">
      {label && (
        <span className="text-[12.5px] font-semibold" style={{ color: "var(--text-2)" }}>{label}</span>
      )}
      <div ref={wrapRef} className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
          className="flex items-center w-full rounded-[11px] text-left disabled:opacity-50"
          style={{ background: "var(--surface)", border: "1px solid var(--border-strong)" }}
        >
          <span
            className="flex-1 min-w-0 truncate px-3.5 py-3 text-[14.5px]"
            style={{ color: selected ? "var(--text)" : "var(--text-3)" }}
          >
            {selected ? selected.label : placeholder}
          </span>
          <span className="pr-3 flex" style={{ color: "var(--text-3)" }}>
            <ChevronDown size={17} strokeWidth={1.9} />
          </span>
        </button>

        {open && (
          <div
            className="absolute z-20 mt-1.5 w-full rounded-[12px] overflow-hidden shadow-lg"
            style={{ background: "var(--surface)", border: "1px solid var(--border-strong)" }}
          >
            <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: "1px solid var(--border)" }}>
              <Search size={15} style={{ color: "var(--text-3)" }} />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                className="flex-1 min-w-0 bg-transparent outline-none text-[14px]"
                style={{ color: "var(--text)" }}
              />
            </div>
            <div className="max-h-[240px] overflow-y-auto py-1">
              {filtered.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => { onSelect(o.value); close(); }}
                  className="flex items-center gap-2 w-full text-left px-3 py-2 text-[14px]"
                  style={{ color: "var(--text)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <span className="flex-none w-4">
                    {o.value === value && <Check size={15} style={{ color: "var(--accent-600)" }} />}
                  </span>
                  <span className="flex-1 min-w-0 truncate">{o.label}</span>
                  {o.hint && <span className="text-[12px] flex-none" style={{ color: "var(--text-3)" }}>{o.hint}</span>}
                </button>
              ))}
              {filtered.length === 0 && !showCreate && (
                <div className="px-3 py-2.5 text-[13px]" style={{ color: "var(--text-3)" }}>No matches.</div>
              )}
              {showCreate && (
                <button
                  type="button"
                  onClick={() => { onCreate!(query.trim()); close(); }}
                  className="flex items-center gap-2 w-full text-left px-3 py-2 text-[14px] font-semibold"
                  style={{ color: "var(--accent-600)", borderTop: filtered.length > 0 ? "1px solid var(--border)" : undefined }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <Plus size={15} />
                  {createLabel ? createLabel(query.trim()) : `Create “${query.trim()}”`}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </label>
  );
}

/* ---- Modal shell ----------------------------------------------------------
   The one true modal wrapper: a bottom sheet on phones (full width, slides up,
   body scrolls), a centred dialog from `sm` up. `header` replaces the default
   title/subtitle block when a modal needs richer chrome (icons, etc.); the
   footer row is justify-end — push a button left with `mr-auto`. */
export function ModalShell({
  title, subtitle, header, footer, onClose, children, maxWidth = 520, zIndex = 50,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: number;
  zIndex?: number;
}) {
  return (
    <div
      className="fixed inset-0 flex items-end justify-center sm:items-center sm:p-4"
      style={{ background: "rgba(0,0,0,.45)", zIndex }}
      onClick={onClose}
    >
      <div
        className="gf-sheet flex w-full max-h-[92dvh] flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl"
        style={{ maxWidth, background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-md)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-none items-center justify-between gap-3 px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
          {header ?? (
            <div className="min-w-0">
              <div className="truncate text-[15px] font-semibold" style={{ color: "var(--text)" }}>{title}</div>
              {subtitle && <div className="truncate text-[12.5px]" style={{ color: "var(--text-3)" }}>{subtitle}</div>}
            </div>
          )}
          <button
            onClick={onClose}
            title="Close"
            className="grid flex-none place-items-center"
            style={{ width: 30, height: 30, borderRadius: 8, background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-2)" }}
          >
            <X size={15} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div className="flex flex-none flex-wrap items-center justify-end gap-2 px-5 py-4" style={{ borderTop: "1px solid var(--border)" }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---- Section title ------------------------------------------------------- */
export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mb-3.5">
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: "var(--display-weight)" as unknown as number,
          letterSpacing: "var(--display-tracking)",
          fontSize: 19,
          color: "var(--text)",
        }}
      >
        {children}
      </div>
      {right}
    </div>
  );
}

/* ---- Stat card ----------------------------------------------------------- */
export function StatCard({
  icon: Icon, label, value, foot, tone = "accent",
}: {
  icon: LucideIcon; label: string; value: ReactNode; foot?: ReactNode; tone?: "accent" | "primary";
}) {
  const chip: CSSProperties = tone === "accent"
    ? { background: "var(--accent-100)", color: "var(--accent-600)" }
    : { background: "var(--primary-100)", color: "var(--primary)" };
  return (
    <Card pad={18}>
      <div className="flex items-center gap-3">
        <div className="grid place-items-center rounded-[10px]" style={{ width: 38, height: 38, ...chip }}>
          <Icon size={19} strokeWidth={2} />
        </div>
        <div
          className="text-[11.5px] font-bold uppercase whitespace-nowrap"
          style={{ letterSpacing: "0.05em", color: "var(--text-3)" }}
        >
          {label}
        </div>
      </div>
      <div
        className="gf-mono mt-3.5 font-semibold"
        style={{ fontSize: 30, color: "var(--text)" }}
      >
        {value}
      </div>
      {foot && <div className="mt-1 text-[12.5px]" style={{ color: "var(--text-3)" }}>{foot}</div>}
    </Card>
  );
}

/* ---- Empty state -------------------------------------------------------- */
export function EmptyState({
  icon: Icon, title, subtitle, action,
}: {
  icon: LucideIcon; title: string; subtitle?: string; action?: ReactNode;
}) {
  return (
    <div className="grid place-items-center" style={{ minHeight: 360 }}>
      <div className="text-center max-w-[360px]">
        <div
          className="mx-auto mb-4 grid place-items-center"
          style={{
            width: 60, height: 60, borderRadius: 16,
            background: "var(--surface)", border: "1px solid var(--border)",
            color: "var(--text-3)", boxShadow: "var(--shadow-sm)",
          }}
        >
          <Icon size={27} strokeWidth={1.7} />
        </div>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: "var(--display-weight)" as unknown as number,
            letterSpacing: "var(--display-tracking)",
            fontSize: 21,
            color: "var(--text-2)",
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div className="mt-2 text-sm leading-snug" style={{ color: "var(--text-3)" }}>{subtitle}</div>
        )}
        {action && <div className="mt-5">{action}</div>}
      </div>
    </div>
  );
}
