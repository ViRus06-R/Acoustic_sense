import { route } from "@/lib/server/http";
import { brokerState, bus, type RealtimeEvent } from "@/lib/server/realtime";

// Server-Sent Events: relays the in-process bus to the browser, filtered by the user's site access.
export const GET = route({}, async (req, { user }) => {
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          cleanup();
        }
      };
      send("hello", { broker: brokerState().status });
      const onEvent = (ev: RealtimeEvent) => {
        if ("siteId" in ev && !user.siteIds.includes(ev.siteId)) return;
        if ((ev.type === "notification" || ev.type === "session-revoked") && ev.userId !== user.id) return;
        send(ev.type, ev);
      };
      bus().on("event", onEvent);
      const ping = setInterval(() => send("ping", { t: Date.now(), broker: brokerState().status }), 15_000);
      cleanup = () => {
        clearInterval(ping);
        bus().off("event", onEvent);
      };
      req.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {}
      });
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
});
