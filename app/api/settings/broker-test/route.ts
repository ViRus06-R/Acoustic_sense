import { NextResponse } from "next/server";
import { z } from "zod";
import { route, body } from "@/lib/server/http";
import { testBrokerConnection } from "@/lib/server/mqtt";
import { brokerSchema } from "@/lib/shared/settings-schema";
import { audit } from "@/lib/server/audit";

const schema = brokerSchema.pick({ host: true, port: true, tls: true });

export const POST = route({ roles: ["admin"] }, async (req, { user }) => {
  const b = await body(req, schema as unknown as z.ZodType<{ host: string; port: number; tls: boolean }>);
  const r = await testBrokerConnection(b.host, b.port, b.tls);
  await audit(user, "settings.broker_tested", `${b.host}:${b.port}`, { ok: r.ok, error: r.error });
  return NextResponse.json(r);
});
