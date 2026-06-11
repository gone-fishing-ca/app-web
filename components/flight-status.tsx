"use client";

import type { CSSProperties } from "react";

/** FlightAware idents use ICAO carrier codes (UAL2076, not UA2076). Map the
 *  airlines the crew flies; anything else passes through as typed. */
const ICAO: Record<string, string> = { UA: "UAL", AA: "AAL", AS: "ASA", DL: "DAL", WN: "SWA" };

export function flightAwareUrl(flightNumber: string | null | undefined): string | null {
  if (!flightNumber) return null;
  const m = /^([A-Za-z]{2,3})\s*(\d{1,4}[A-Za-z]?)$/.exec(flightNumber.trim());
  if (!m) return null;
  const carrier = ICAO[m[1].toUpperCase()] ?? m[1].toUpperCase();
  return `https://www.flightaware.com/live/flight/${carrier}${m[2]}`;
}

// AeroDataBox status values, grouped by tone.
const IN_MOTION = ["Departed", "EnRoute", "Approaching", "Boarding", "GateClosed", "CheckIn"];
const BAD = ["Canceled", "CanceledUncertain", "Diverted"];
const LABELS: Record<string, string> = {
  EnRoute: "En route",
  CheckIn: "Check-in",
  GateClosed: "Gate closed",
  CanceledUncertain: "Canceled?",
};

function statusStyle(s: string): CSSProperties {
  if (s === "Arrived") return { background: "var(--success-bg)", color: "var(--success)" };
  if (s === "Delayed") return { background: "var(--warning-bg)", color: "var(--warning)" };
  if (BAD.includes(s)) return { background: "var(--danger-bg)", color: "var(--danger)" };
  if (IN_MOTION.includes(s)) return { background: "var(--info-bg)", color: "var(--info)" };
  return { background: "var(--surface-2)", color: "var(--text-2)" }; // Expected / Unknown / …
}

export function StatusChip({ status }: { status: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11.5px] font-semibold whitespace-nowrap"
      style={statusStyle(status)}
    >
      {LABELS[status] ?? status}
    </span>
  );
}

/** FlightAware plane-and-trail icon linking to the live flight page (new tab).
 *  The icon ships its own light-blue gradient background, so it works as-is in
 *  both modes. */
export function FlightAwareLink({ flightNumber, height = 18 }: { flightNumber: string | null | undefined; height?: number }) {
  const url = flightAwareUrl(flightNumber);
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title="Track on FlightAware"
      onClick={(e) => e.stopPropagation()}
      className="inline-flex flex-none"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/flightaware-icon.png"
        alt="FlightAware"
        style={{ height, width: "auto", display: "block", borderRadius: 5, border: "1px solid var(--border)" }}
      />
    </a>
  );
}
