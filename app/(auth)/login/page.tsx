"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/client/api";
import { Button, InfoBox } from "@/components/ui/basic";
import { Checkbox, Input, PasswordInput } from "@/components/ui/form";

function useCountdown(until: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [until]);
  if (!until) return null;
  const left = Math.max(0, Math.ceil((Date.parse(until) - now) / 1000));
  return left;
}

export default function SignInPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const left = useCountdown(lockedUntil);
  const locked = left !== null && left > 0;

  const banner = sp.get("expired")
    ? { tone: "warning" as const, text: "Your session expired. Please sign in again." }
    : sp.get("reset")
      ? { tone: "success" as const, text: "Your password was updated. Sign in with your new password." }
      : sp.get("signedout")
        ? { tone: "info" as const, text: "You have been signed out." }
        : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (locked) return;
    setLoading(true);
    setError(null);
    try {
      await api("/api/auth/login", { body: { email, password, remember } });
      const next = sp.get("next");
      router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
    } catch (err) {
      if (err instanceof ApiError && err.status === 423) {
        setLockedUntil(err.data.lockedUntil as string);
        setError(null);
      } else if (err instanceof ApiError && err.status === 401) {
        const n = err.data.attemptsLeft as number | undefined;
        setError(`Invalid email or password.${n != null ? ` ${n} attempt${n === 1 ? "" : "s"} left before lock.` : ""}`);
      } else {
        setError(err instanceof Error ? err.message : "Sign in failed.");
      }
      setPassword("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h2 className="text-[28px] font-bold tracking-tight text-ink">Sign in</h2>
      <p className="mt-1.5 text-sm text-muted">Use the account your administrator created for you.</p>
      {banner && (
        <div className="mt-6">
          <InfoBox tone={banner.tone === "warning" ? "warning" : banner.tone === "success" ? "success" : "info"} icon={banner.tone === "success" ? "check" : "info"}>
            {banner.text}
          </InfoBox>
        </div>
      )}
      <form onSubmit={submit} className="mt-7 space-y-4" noValidate>
        <Input label="Email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required className="h-11" />
        <PasswordInput label="Password" value={password} onChange={setPassword} autoComplete="current-password" />
        <div className="flex items-center justify-between">
          <Checkbox label="Remember me on this device" checked={remember} onChange={setRemember} />
          <Link href="/forgot-password" className="text-[13px] font-semibold text-teal hover:underline">
            Forgot password?
          </Link>
        </div>
        {locked ? (
          <InfoBox tone="danger" icon="lock">
            Account locked, try again in{" "}
            <span className="font-bold tabular">
              {String(Math.floor(left! / 60)).padStart(2, "0")}:{String(left! % 60).padStart(2, "0")}
            </span>
          </InfoBox>
        ) : (
          error && (
            <InfoBox tone="danger" icon="alert">
              {error}
            </InfoBox>
          )
        )}
        <Button type="submit" className="h-11 w-full" loading={loading} disabled={locked || !email || !password}>
          Sign in
        </Button>
      </form>
      <p className="mt-8 text-center text-xs text-muted">Access is role-based: Administrator, Maintenance Engineer, Viewer.</p>
    </div>
  );
}
