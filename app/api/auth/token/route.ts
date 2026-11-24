import { NextResponse } from "next/server";
import { publicRoute } from "@/lib/server/http";
import { checkAuthToken } from "@/lib/server/auth";

// Validates a one-time link before showing the form. Never reveals anything beyond the first name.
export const GET = publicRoute(async (req) => {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const purpose = req.nextUrl.searchParams.get("purpose") === "set" ? "set" : "reset";
  const r = await checkAuthToken(token, purpose);
  if (!r.ok) return NextResponse.json({ valid: false, reason: r.reason });
  return NextResponse.json({ valid: true, name: r.name.split(" ")[0] });
});
