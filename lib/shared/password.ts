export interface PasswordPolicy {
  minLength: number;
  requireNumber: boolean;
  requireSymbol: boolean;
}

export const DEFAULT_POLICY: PasswordPolicy = { minLength: 10, requireNumber: true, requireSymbol: true };

export interface PolicyRule {
  id: string;
  label: string;
  ok: boolean;
}

export function checkPasswordPolicy(pw: string, policy: PasswordPolicy): { ok: boolean; rules: PolicyRule[] } {
  const rules: PolicyRule[] = [{ id: "len", label: `At least ${policy.minLength} characters`, ok: pw.length >= policy.minLength }];
  if (policy.requireNumber) rules.push({ id: "num", label: "Contains a number", ok: /\d/.test(pw) });
  if (policy.requireSymbol) rules.push({ id: "sym", label: "Contains a symbol", ok: /[^A-Za-z0-9]/.test(pw) });
  rules.push({ id: "max", label: "At most 128 characters", ok: pw.length <= 128 });
  return { ok: rules.every((r) => r.ok), rules };
}

/** 0 (very weak) .. 4 (strong) */
export function passwordStrength(pw: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  if (/^(.)\1+$/.test(pw) || /password|12345|qwerty/i.test(pw)) s = Math.min(s, 1);
  const score = Math.min(4, Math.max(0, s - 1)) as 0 | 1 | 2 | 3 | 4;
  return { score, label: ["Very weak", "Weak", "Fair", "Good", "Strong"][score] };
}
