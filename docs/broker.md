# Broker setup: Mosquitto with per-node credentials, ACLs and TLS

For a quick local demo `npm run broker` starts a built-in development broker (Aedes) on port 1883 that accepts any client. For anything closer to production use Mosquitto as below.

## 1. Generate users and ACLs from the database

```bash
npm run broker:sync-users
```

This writes:

- `mosquitto/passwd`: one line per active node (`AS-N-007:$7$...`), plus two service accounts:
  - `acoustic-backend` (password from `MQTT_PASSWORD`, default `dev-backend-password`): read-only on `acousticsense/#`
  - `simulator` (password from `SIM_MQTT_PASSWORD`, default `dev-simulator-password`): may publish for all nodes (development only)
- `mosquitto/acl`: each node may write **only** `acousticsense/{site}/{node}/alert` and `.../telemetry`.

Node passwords are stored in the database only as Mosquitto-compatible hashes (`$7$`, PBKDF2-SHA512), so the script copies them without ever seeing the plain password. Re-run the script after registering a node, rotating credentials or decommissioning a node, then reload Mosquitto (`kill -HUP <pid>` on Linux, or restart the service on Windows).

Seeded demo nodes have no credentials. Use **Rotate credentials** on a Node page to issue them.

## 2. mosquitto.conf

```conf
per_listener_settings true

# Plain listener for local development only
listener 1883 127.0.0.1
allow_anonymous false
password_file /path/to/acoustic_sense/mosquitto/passwd
acl_file /path/to/acoustic_sense/mosquitto/acl

# TLS listener for nodes on the plant network
listener 8883
allow_anonymous false
password_file /path/to/acoustic_sense/mosquitto/passwd
acl_file /path/to/acoustic_sense/mosquitto/acl
cafile   /path/to/certs/ca.crt
certfile /path/to/certs/server.crt
keyfile  /path/to/certs/server.key
tls_version tlsv1.2
```

## 3. Self-signed certificates for the demo

```bash
openssl req -x509 -newkey rsa:2048 -days 365 -nodes -keyout ca.key -out ca.crt -subj "/CN=Acoustic Sense CA"
openssl req -newkey rsa:2048 -nodes -keyout server.key -out server.csr -subj "/CN=broker.local"
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out server.crt -days 365
```

Flash `ca.crt` onto the ESP32-S3 and connect to port 8883 with the node's username and password.

## 4. Point the backend at it

In `.env.local`:

```
MQTT_USERNAME=acoustic-backend
MQTT_PASSWORD=dev-backend-password
```

Then in **Settings > MQTT and broker** set host and port (8883) and tick **Use TLS**. The backend reconnects without a restart. Use **Test connection** first.

Run the simulator with its dev credential: `python scripts/simulator.py --username simulator --password dev-simulator-password`.
