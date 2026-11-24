"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/client/api";
import { usePageHeader } from "@/components/app/shell";
import { Button, Card, InfoBox } from "@/components/ui/basic";
import { PasswordInput, StrengthMeter } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { checkPasswordPolicy, DEFAULT_POLICY, type PasswordPolicy } from "@/lib/shared/password";

export default function ChangePasswordPage() {
  usePageHeader("Change password", "Other sessions are signed out after a change");
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const branding = useQuery({ queryKey: ["branding"], queryFn: () => api<{ passwordPolicy: PasswordPolicy }>("/api/public/branding") });
  const policy = branding.data?.passwordPolicy ?? DEFAULT_POLICY;
  const [current, setCurrent] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const ok = checkPasswordPolicy(pw, policy).ok && pw === pw2 && current.length > 0;
  const save = useMutation({
    mutationFn: () => api("/api/auth/change-password", { body: { current, password: pw } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sessions"] });
      toast({ tone: "success", title: "Password changed", body: "Your other sessions were signed out." });
      router.push("/profile");
    },
    onError: (e) => {
      if (e instanceof ApiError) setFields(e.fields);
      else setFields({ _: "Could not change the password." });
    },
  });
  return (
    <Card className="max-w-[520px]" title="Change password">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) save.mutate();
        }}
      >
        <PasswordInput label="Current password" value={current} onChange={setCurrent} autoComplete="current-password" error={fields.current} />
        <PasswordInput label="New password" value={pw} onChange={setPw} autoComplete="new-password" error={fields.password} />
        <StrengthMeter password={pw} policy={policy} />
        <PasswordInput label="Confirm new password" value={pw2} onChange={setPw2} autoComplete="new-password" error={pw2 && pw !== pw2 ? "Passwords do not match" : undefined} />
        {fields._ && (
          <InfoBox tone="danger" icon="alert">
            {fields._}
          </InfoBox>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={!ok} loading={save.isPending}>
            Change password
          </Button>
        </div>
      </form>
    </Card>
  );
}
