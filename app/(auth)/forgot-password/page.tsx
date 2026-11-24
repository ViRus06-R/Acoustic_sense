"use client";

import Link from "next/link";
import { useState } from "react";
import { api, ApiError } from "@/lib/client/api";
import { Button, InfoBox } from "@/components/ui/basic";
import { Input } from "@/components/ui/form";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const r = await api<{ message: string }>("/api/auth/forgot", { body: { email } });
      setSent(r.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send the link.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h2 className="text-[28px] font-bold tracking-tight text-ink">Forgot password</h2>
      <p className="mt-1.5 text-sm text-muted">Enter your work email and we will send you a one-time reset link.</p>
      {sent ? (
        <div className="mt-7 space-y-5">
          <InfoBox tone="success" icon="check">
            {sent}
          </InfoBox>
          <p className="text-[13px] text-muted">The link can be used once. Check your inbox (in this demo: the dev-mail folder) and follow the link.</p>
          <Link href="/login" className="inline-block text-sm font-semibold text-teal hover:underline">
            Back to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-7 space-y-4">
          <Input label="Email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required className="h-11" />
          {error && (
            <InfoBox tone="danger" icon="alert">
              {error}
            </InfoBox>
          )}
          <Button type="submit" className="h-11 w-full" loading={loading} disabled={!email}>
            Send reset link
          </Button>
          <div className="text-center">
            <Link href="/login" className="text-[13px] font-semibold text-teal hover:underline">
              Back to sign in
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}
