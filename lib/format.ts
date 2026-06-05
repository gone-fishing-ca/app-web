export function fmtDate(d: string | null | undefined, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }): string {
  if (!d) return "";
  // ISO date "YYYY-MM-DD" — interpret as local-noon to avoid TZ flicker.
  const dt = /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T12:00:00`) : new Date(d);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString(undefined, opts);
}

export function fmtRange(a: string | null | undefined, b: string | null | undefined): string {
  if (!a && !b) return "";
  if (a && b) {
    const sameYear = a.slice(0, 4) === b.slice(0, 4);
    const left = fmtDate(a, { month: "short", day: "numeric" });
    const right = fmtDate(b, sameYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
    const yr = a.slice(0, 4);
    return `${left} – ${right}, ${yr}`;
  }
  return fmtDate(a || b!);
}

export function daysUntil(d: string | null | undefined): number | null {
  if (!d) return null;
  const target = new Date(`${d}T12:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date();
  const ms = target.getTime() - now.getTime();
  return Math.ceil(ms / 86_400_000);
}
