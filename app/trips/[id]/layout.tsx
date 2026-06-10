"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Beer,
  CalendarRange,
  ClipboardList,
  ContactRound,
  LayoutDashboard,
  Menu,
  Moon,
  PlaneTakeoff,
  Sun,
  Users,
  Utensils,
  Wallet,
  Wrench,
  X,
} from "lucide-react";
import { Wordmark } from "@/components/ui";
import { UserMenu } from "@/components/user-menu";
import { api, type Trip } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { daysUntil, fmtRange } from "@/lib/format";

const NAV: { id: string; label: string; icon: typeof Users; href: string }[] = [
  { id: "",            label: "Overview",      icon: LayoutDashboard, href: "" },
  { id: "participants",label: "Group",         icon: Users,           href: "/participants" },
  { id: "contacts",    label: "Contacts",      icon: ContactRound,    href: "/contacts" },
  { id: "segments",    label: "Schedule",      icon: CalendarRange,   href: "/segments" },
  { id: "flights",     label: "Flights",       icon: PlaneTakeoff,    href: "/flights" },
  { id: "pack-list",   label: "Pack list",     icon: ClipboardList,   href: "/pack-list" },
  { id: "shared-gear", label: "Shared gear",   icon: Wrench,          href: "/shared-gear" },
  { id: "food",        label: "Food",          icon: Utensils,        href: "/food" },
  { id: "beverages",   label: "Beverages",     icon: Beer,            href: "/beverages" },
  { id: "budget",      label: "Budget",        icon: Wallet,          href: "/budget" },
];

function SidebarContent({ base, pathname, mode }: { base: string; pathname: string; mode: "light" | "dark" }) {
  return (
    <>
      <Link href="/trips" className="px-2 pb-5 inline-flex items-center gap-2 mb-1">
        <Wordmark size={18} glyph mode={mode} />
      </Link>

      <Link href="/trips"
        className="flex items-center gap-2 rounded-[11px] mb-4 px-3 py-2.5 font-semibold text-[13.5px]"
        style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-2)" }}
      >
        <ArrowLeft size={16} strokeWidth={2} /> Back to all trips
      </Link>

      <nav className="flex flex-col gap-0.5">
        {NAV.map((n) => {
          const href = base + n.href;
          const active = (pathname === href) || (n.href !== "" && pathname.startsWith(href));
          return (
            <Link key={n.id || "_"} href={href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[13.5px]"
              style={{
                background: active ? "var(--primary)" : "transparent",
                color: active ? "var(--on-primary)" : "var(--text-2)",
                fontWeight: active ? 600 : 500,
              }}
            >
              <n.icon size={17} strokeWidth={1.9} /> {n.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

export default function TripLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id: tripId } = use(params);
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading: authLoading } = useAuth();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [mode, setMode] = useState<"light" | "dark">("light");
  const [notFound, setNotFound] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute("data-mode", mode);
  }, [mode]);

  // Navigating (tapping a drawer link) closes the drawer.
  useEffect(() => { setNavOpen(false); }, [pathname]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace("/login"); return; }
    api.get<Trip>(`/trips/${tripId}`)
      .then(setTrip)
      .catch(() => setNotFound(true));
  }, [authLoading, user, router, tripId]);

  // The Overview page's edit modal broadcasts trip changes — keep the header in sync.
  useEffect(() => {
    function onTripUpdated(e: Event) {
      const updated = (e as CustomEvent<Trip>).detail;
      if (updated?.id === tripId) setTrip(updated);
    }
    window.addEventListener("gf:trip-updated", onTripUpdated);
    return () => window.removeEventListener("gf:trip-updated", onTripUpdated);
  }, [tripId]);

  if (authLoading || !user) return null;
  if (notFound) {
    return (
      <div className="min-h-screen grid place-items-center" style={{ background: "var(--bg)" }}>
        <div className="text-center">
          <div style={{ fontFamily: "var(--font-display)", fontWeight: "var(--display-weight)" as unknown as number, fontSize: 24, color: "var(--text-2)" }}>
            Trip not found.
          </div>
          <Link href="/trips" className="inline-flex items-center gap-1.5 mt-3 text-[14px]" style={{ color: "var(--accent-600)" }}>
            <ArrowLeft size={14} /> Back to trips
          </Link>
        </div>
      </div>
    );
  }

  const base = `/trips/${tripId}`;
  const days = trip ? daysUntil(trip.start_date) : null;

  return (
    <div className="flex h-dvh" style={{ background: "var(--bg)", color: "var(--text)" }}>
      {/* Sidebar — static on desktop */}
      <aside
        className="hidden lg:flex flex-col flex-none overflow-y-auto"
        style={{
          width: 248,
          background: "var(--surface)",
          borderRight: "1px solid var(--border)",
          padding: "20px 14px",
        }}
      >
        <SidebarContent base={base} pathname={pathname} mode={mode} />
      </aside>

      {/* Sidebar — slide-over drawer on mobile */}
      {navOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0" style={{ background: "rgba(0,0,0,.45)" }} onClick={() => setNavOpen(false)} />
          <aside
            className="gf-drawer absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col overflow-y-auto"
            style={{
              background: "var(--surface)",
              borderRight: "1px solid var(--border)",
              padding: "20px 14px",
              boxShadow: "var(--shadow-lg)",
            }}
          >
            <button
              onClick={() => setNavOpen(false)}
              title="Close menu"
              className="absolute right-3 top-4 grid place-items-center"
              style={{ width: 34, height: 34, borderRadius: 10, background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-2)" }}
            >
              <X size={17} />
            </button>
            <SidebarContent base={base} pathname={pathname} mode={mode} />
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header
          className="flex items-center gap-2.5 sm:gap-4 px-4 sm:px-6 py-3.5 flex-none"
          style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}
        >
          <button
            onClick={() => setNavOpen(true)}
            title="Open menu"
            className="grid place-items-center flex-none lg:hidden"
            style={{
              width: 38, height: 38, borderRadius: 11,
              background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-2)",
            }}
          >
            <Menu size={18} />
          </button>
          <div className="flex-1 min-w-0">
            <div
              className="truncate text-[18px] sm:text-[21px]"
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: "var(--display-weight)" as unknown as number,
                letterSpacing: "var(--display-tracking)",
                color: "var(--text)",
              }}
            >
              {trip ? trip.name : "…"}
            </div>
            {trip && (
              <div className="truncate text-[12.5px] mt-0.5" style={{ color: "var(--text-3)" }}>
                {[trip.destination, fmtRange(trip.start_date, trip.end_date) || "Dates TBD"].filter(Boolean).join(" · ")}
                {days !== null && days >= 0 && <> · <span className="gf-mono" style={{ color: "var(--accent-600)" }}>{days} days to fly-in</span></>}
              </div>
            )}
          </div>
          <button
            onClick={() => setMode(mode === "light" ? "dark" : "light")}
            title="Toggle light/dark"
            className="grid place-items-center flex-none"
            style={{
              width: 38, height: 38, borderRadius: 11,
              background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text-2)",
            }}
          >
            {mode === "light" ? <Moon size={17} /> : <Sun size={17} />}
          </button>
          <UserMenu />
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="gf-fade" key={pathname}>{children}</div>
        </main>
      </div>
    </div>
  );
}
