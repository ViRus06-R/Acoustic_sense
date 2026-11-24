"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/client/api";
import { Button, InfoBox, Spinner } from "@/components/ui/basic";
import { PasswordInput, StrengthMeter } from "@/components/ui/form";
import { checkPasswordPolicy, DEFAULT_POLICY, type PasswordPolicy } from "@/lib/shared/password";

/** Shared by /reset-password and /set-password (welcome variant). */
export function TokenPasswordForm({ purpose }: { purpose: "reset" | "set" }) {
  const sp = useSearchParams();
  const router = useRouter();
  const token = sp.get("token") ?? "";
  const check = useQuery({
    queryKey: ["token", purpose, token],
    queryFn: () => api<{ valid: boolean; reason?: string; name?: string }>(`/api/auth/token?purpose=${purpose}&token=${encodeURIComponent(token)}`),
    retry: false,
  });
  const branding = useQuery({ queryKey: ["branding"], queryFn: () => api<{ passwordPolicy: PasswordPolicy }>("/api/public/branding") });
  const policy = branding.data?.passwordPolicy ?? DEFAULT_POLICY;
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [tokenDead, setTokenDead] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const ok = checkPasswordPolicy(pw, policy).ok;
  const mismatch = pw2.length > 0 && pw !== pw2;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ok || pw !== pw2) return;
    setLoading(true);
    setError(null);
    try {
      await api("/api/auth/reset", { body: { token, purpose, password: pw } });
      router.replace("/login?reset=1");
    } catch (err) {
      if (err instanceof ApiError && err.status === 410) setTokenDead((err.data.reason as string) ?? "invalid");
      else setError(err instanceof ApiError ? (err.fields.password ?? err.message) : "Could not update the password.");
    } finally {
      setLoading(false);
    }
  }

  if (check.isPending)
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <Spinner /> Checking your link...
      </div>
    );

  const reason = tokenDead ?? (check.data && !check.data.valid ? check.data.reason : check.error ? "invalid" : null);
  if (reason) {
    return (
      <div>
        <h2 className="text-[28px] font-bold tracking-tight text-ink">{reason === "expired" ? "Link expired" : "Link not valid"}</h2>
        <div className="mt-6">
          <InfoBox tone="danger" icon="alert">
            {reason === "expired"
              ? "This password link has expired. Links are valid for a limited time for your security."
              : reason === "used"
                ? "This password link has already been used or was replaced by a newer one."
                : "This password link is invalid. Make sure you copied the full link."}
          </InfoBox>
        </div>
        <div className="mt-6 flex flex-col gap-3">
          <Link href="/forgot-password" className="inline-flex h-11 items-center justify-center rounded-[8px] bg-teal text-sm font-semibold text-white hover:bg-teal-dark">
            Request a new link
          </Link>
          <Link href="/login" className="text-center text-[13px] font-semibold text-teal hover:underline">
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-[28px] font-bold tracking-tight text-ink">{purpose === "set" ? `Welcome to Acoustic Sense, ${check.data?.name}` : "Reset password"}</h2>
      <p className="mt-1.5 text-sm text-muted">{purpose === "set" ? "Choose a password to activate your account." : "Choose a new password for your account. You will be signed out everywhere else."}</p>
      <form onSubmit={submit} className="mt-7 space-y-4">
        <PasswordInput label="New password" value={pw} onChange={setPw} autoComplete="new-password" />
        <StrengthMeter password={pw} policy={policy} />
        <PasswordInput label="Confirm new password" value={pw2} onChange={setPw2} autoComplete="new-password" error={mismatch ? "Passwords do not match" : undefined} />
        {error && (
          <InfoBox tone="danger" icon="alert">
            {error}
          </InfoBox>
        )}
        <Button type="submit" className="h-11 w-full" loading={loading} disabled={!ok || pw !== pw2}>
          {purpose === "set" ? "Set password" : "Update password"}
        </Button>
      </form>
    </div>
  );
}
