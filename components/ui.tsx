"use client";

import { clsx } from "clsx";
import type { LucideIcon } from "lucide-react";
import {
  type ButtonHTMLAttributes,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
  forwardRef,
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
export function Avatar({ initials, size = 34, tone = "surface" }: {
  initials: string; size?: number; tone?: "surface" | "primary" | "accent";
}) {
  const map: Record<string, CSSProperties> = {
    surface: { background: "var(--surface-2)", color: "var(--text-2)", border: "1px solid var(--border)" },
    primary: { background: "var(--primary)", color: "var(--on-primary)", border: "1px solid transparent" },
    accent: { background: "var(--accent)", color: "var(--on-accent)", border: "1px solid transparent" },
  };
  return (
    <span
      className="inline-grid place-items-center rounded-full font-bold"
      style={{ width: size, height: size, fontSize: size * 0.38, ...map[tone] }}
    >
      {initials}
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

/* ---- Section title ------------------------------------------------------- */
export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3.5">
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
