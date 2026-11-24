import { q1 } from "@/lib/server/db";
import { publicRoute } from "@/lib/server/http";

export const GET = publicRoute(async () => {
  const row = await q1<{ value: { mime: string; data: string } }>("SELECT value FROM settings WHERE key = 'logo'");
  if (!row) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(row.value.data, "base64"), {
    headers: {
      "Content-Type": row.value.mime,
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
      // SVG logos are served sandboxed so embedded scripts cannot run.
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
});
