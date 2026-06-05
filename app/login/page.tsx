"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Calendar, Lock, Mail, MapPin, ShieldCheck, Users } from "lucide-react";
import { Btn, Card, Eyebrow, Field, Wordmark } from "@/components/ui";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const { user, signIn, loading } = useAuth();
  const [email, setEmail] = useState("organizer@gonefishing.app");
  const [password, setPassword] = useState("Northern2026!");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) router.replace("/trips");
  }, [user, loading, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email, password);
      router.replace("/trips");
    } catch (err) {
      const msg = err && typeof err === "object" && "message" in err ? String((err as { message?: string }).message) : "Sign in failed";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid h-screen w-screen" style={{ gridTemplateColumns: "1.05fr 1fr" }}>
      {/* Brand hero */}
      <div
        className="relative overflow-hidden flex flex-col justify-between"
        style={{
          background: "var(--primary)",
          color: "var(--on-primary)",
          padding: "46px 52px",
        }}
      >
        <ContourBg stroke="#fff" opacity={0.12} />
        <div className="relative">
          <Wordmark size={22} glyph mode="dark" />
        </div>
        <div className="relative max-w-[460px]">
          <Eyebrow style={{ color: "rgba(255,255,255,.65)" }}>Ogoki 2026 · Year 11</Eyebrow>
          <h1
            className="mt-3 mb-3"
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: "var(--display-weight)" as unknown as number,
              letterSpacing: "var(--display-tracking)",
              fontSize: 46,
              lineHeight: 1.04,
            }}
          >
            Plan the trip.<br />Then forget your phone.
          </h1>
          <p style={{ fontSize: 16, lineHeight: 1.55, color: "rgba(255,255,255,.8)", maxWidth: 400 }}>
            One place for the crew, the gear, the cabins and the money — so the only thing left to sort
            out on the water is who buys the first round.
          </p>
        </div>
        <div className="relative flex items-center gap-4 text-[13px]" style={{ color: "rgba(255,255,255,.72)" }}>
          <span className="inline-flex items-center gap-1.5"><Users size={15} /> 10 anglers</span>
          <span className="inline-flex items-center gap-1.5"><Calendar size={15} /> May 28 – Jun 12</span>
          <span className="inline-flex items-center gap-1.5"><MapPin size={15} /> Ogoki Reservoir</span>
        </div>
      </div>

      {/* Sign-in card */}
      <div className="grid place-items-center p-8" style={{ background: "var(--bg)" }}>
        <div className="w-full max-w-[384px] flex flex-col gap-5">
          <div>
            <h2
              className="mb-1.5"
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: "var(--display-weight)" as unknown as number,
                letterSpacing: "var(--display-tracking)",
                fontSize: 28,
                color: "var(--text)",
              }}
            >
              Welcome back
            </h2>
            <div className="text-[14.5px]" style={{ color: "var(--text-2)" }}>
              Sign in to keep the trip on track.
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <Field label="Email" type="email" icon={Mail} value={email} required
              onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
            <Field label="Password" type="password" icon={Lock} value={password} required
              onChange={(e) => setPassword(e.target.value)} placeholder="Your password" autoComplete="current-password" />

            {error && (
              <div
                className="rounded-[10px] text-[13px] px-3 py-2.5"
                style={{ background: "var(--danger-bg)", color: "var(--danger)" }}
              >
                {error}
              </div>
            )}

            <Btn type="submit" size="lg" iconRight={ArrowRight} full disabled={submitting}>
              {submitting ? "Signing in…" : "Sign in"}
            </Btn>
          </form>

          <div className="text-[13px] text-center" style={{ color: "var(--text-2)" }}>
            New here?{" "}
            <Link href="/signup" style={{ color: "var(--accent-600)", fontWeight: 600 }}>
              Create an organizer account
            </Link>
          </div>

          <div className="flex items-center justify-center gap-1.5 text-xs" style={{ color: "var(--text-3)" }}>
            <ShieldCheck size={14} strokeWidth={2} />
            Private to the crew · invite-only
          </div>
        </div>
      </div>
    </div>
  );
}

function ContourBg({ stroke = "var(--secondary)", opacity = 0.16 }: { stroke?: string; opacity?: number }) {
  const rings = [];
  for (let i = 0; i < 9; i++) {
    const k = 1 - i * 0.1;
    rings.push(
      <ellipse
        key={i}
        cx={300}
        cy={230}
        rx={300 * k}
        ry={150 * k}
        transform={`rotate(${-16 + i * 1.4} 300 230)`}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
      />,
    );
  }
  return (
    <svg
      viewBox="0 0 600 460"
      preserveAspectRatio="xMidYMid slice"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity }}
    >
      {rings}
    </svg>
  );
}
