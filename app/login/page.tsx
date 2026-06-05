"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Lock, Mail, Moon, Sun } from "lucide-react";
import { Btn, Field, Wordmark } from "@/components/ui";
import { SsoButtons, SsoDivider } from "@/components/sso";
import { useAuth } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const { user, signIn, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"light" | "dark">("light");

  useEffect(() => {
    document.documentElement.setAttribute("data-mode", mode);
  }, [mode]);

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
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message?: string }).message)
          : "Sign in failed";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="relative min-h-screen grid place-items-center overflow-hidden"
      style={{ background: "var(--bg)", padding: 24 }}
    >
      {/* Quiet ripple backdrop — the system's single texture gesture */}
      <ContourBg />

      {/* Centered stack: brand lockup above the card */}
      <div className="relative w-full max-w-[392px] flex flex-col items-center gap-5">
        <div className="flex flex-col items-center gap-3.5">
          <img
            src="/walleye/walleye-icon.png"
            alt=""
            style={{ width: 72, height: 72, borderRadius: 18, boxShadow: "var(--shadow-md)" }}
          />
          <Wordmark size={24} />
        </div>

        {/* Sign-in card */}
        <div
          className="w-full p-6 flex flex-col gap-5"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-xl)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          <SsoButtons />

          <SsoDivider>or with email</SsoDivider>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <Field
              label="Email"
              type="email"
              icon={Mail}
              value={email}
              required
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
            <Field
              label="Password"
              type="password"
              icon={Lock}
              value={password}
              required
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
              autoComplete="current-password"
            />

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
              Create an account
            </Link>
          </div>
        </div>
      </div>

      {/* light / dark — unobtrusive, top-right */}
      <button
        onClick={() => setMode(mode === "light" ? "dark" : "light")}
        title="Toggle light/dark"
        className="fixed top-4 right-4 z-30 grid place-items-center"
        style={{
          width: 36,
          height: 36,
          borderRadius: 999,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          color: "var(--text-2)",
          boxShadow: "var(--shadow-sm)",
        }}
      >
        {mode === "light" ? <Moon size={16} /> : <Sun size={16} />}
      </button>
    </div>
  );
}

function ContourBg() {
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
        stroke="var(--secondary)"
        strokeWidth="1.5"
      />,
    );
  }
  return (
    <svg
      viewBox="0 0 600 460"
      preserveAspectRatio="xMidYMid slice"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        opacity: 0.07,
        maskImage: "radial-gradient(120% 90% at 50% 38%, #000 30%, transparent 72%)",
        WebkitMaskImage: "radial-gradient(120% 90% at 50% 38%, #000 30%, transparent 72%)",
      }}
    >
      {rings}
    </svg>
  );
}
