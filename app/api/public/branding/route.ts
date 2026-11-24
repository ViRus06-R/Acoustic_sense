import { NextResponse } from "next/server";
import { publicRoute } from "@/lib/server/http";
import { getSettings } from "@/lib/server/settings";

export const GET = publicRoute(async () => {
  const s = await getSettings();
  return NextResponse.json({
    orgName: s.general.orgName,
    hasLogo: s.general.hasLogo,
    passwordPolicy: { minLength: s.security.minLength, requireNumber: s.security.requireNumber, requireSymbol: s.security.requireSymbol },
  });
});
