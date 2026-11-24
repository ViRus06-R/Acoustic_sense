/**
 * Development MQTT broker (Aedes) on :1883, for laptops without Mosquitto.
 * Behaves like a default Mosquitto listener for the demo. For TLS and per-node ACLs use
 * Mosquitto with the files produced by `npm run broker:sync-users` (see docs/broker.md).
 *
 * Set BROKER_ACL=1 to enforce the same rule as the Mosquitto ACL: a client whose username is a
 * node ID (AS-N-###) may publish only to its own .../{node}/alert and .../{node}/telemetry topics.
 */
import net from "node:net";
import { Aedes } from "aedes";

const port = Number(process.env.MQTT_PORT ?? 1883);
const enforceAcl = process.env.BROKER_ACL === "1";

async function main() {
  const broker = await Aedes.createBroker({
    authorizePublish: (client, packet, cb) => {
      if (!enforceAcl) return cb(null);
      const user = (client as unknown as { __user?: string })?.__user;
      if (user && /^AS-N-\d{3}$/.test(user)) {
        const parts = packet.topic.split("/");
        if (parts.length !== 4 || parts[2] !== user || !["alert", "telemetry"].includes(parts[3])) {
          return cb(new Error(`ACL: ${user} may not publish to ${packet.topic}`));
        }
      }
      cb(null);
    },
    authenticate: (client, username, _password, cb) => {
      (client as unknown as { __user?: string }).__user = username;
      cb(null, true);
    },
  });
  let clients = 0;
  broker.on("client", () => clients++);
  broker.on("clientDisconnect", () => clients--);
  const server = net.createServer(broker.handle);
  server.listen(port, () => console.log(`[broker] Aedes MQTT broker listening on :${port}${enforceAcl ? " (ACL enforced)" : ""}`));
  setInterval(() => console.log(`[broker] ${clients} client(s) connected`), 60_000).unref();
  const stop = () => {
    console.log("\n[broker] stopping...");
    server.close();
    broker.close(() => process.exit(0));
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((e) => {
  console.error("[broker] failed:", e);
  process.exit(1);
});
