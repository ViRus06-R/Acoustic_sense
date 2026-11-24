# Acoustic Sense: web dashboard

Engineer-facing web app for **Acoustic Sense**, an edge-ML industrial acoustic health monitor. ESP32-S3 nodes run an int8 autoencoder on-device and publish only small alert and telemetry messages over MQTT. Raw audio never leaves the node.

Final-year project, COMSATS University Islamabad, Wah Campus, 2026.

## Stack

| Part | Technology |
|---|---|
| Web app + API | Next.js 16 (App Router, Route Handlers), React 19, TypeScript, Tailwind CSS 4 |
| Data fetching / charts | TanStack Query, Recharts |
| Validation | Zod (every API body and every Settings section) |
| Database | PostgreSQL via `pg`. For the demo, `npm run db` serves **PGlite** (real Postgres compiled to WASM) on port 5432, so nothing needs installing. Point `DATABASE_URL` at a real Postgres to switch. |
| MQTT | `mqtt` client in the backend. For the demo, `npm run broker` runs a built-in broker on 1883. Mosquitto with per-node credentials, ACLs and TLS: see [docs/broker.md](docs/broker.md). |
| Real-time | Server-Sent Events (`/api/stream`) with automatic reconnect and backoff |
| Email | Mocked: written to the console and `dev-mail/*.eml`, behind a `Mailer` interface (`lib/server/mailer.ts`) |
| Simulator | Python + paho-mqtt (`scripts/simulator.py`) |
| Tests | Vitest: unit tests plus integration tests on a private in-memory Postgres |

## Quick start (fresh clone)

Requires Node.js 20+ and Python 3.10+.

```bash
npm install
python -m pip install paho-mqtt
cp .env.example .env.local          # optional: defaults work as-is
```

Then use four terminals:

```bash
# 1. Database (PGlite Postgres on 127.0.0.1:5432, data in .data/pg)
npm run db

# 2. MQTT broker (port 1883)
npm run broker

# 3. Seed demo data (about 20 s). Safe to re-run; --reset regenerates the 30-day history.
npm run seed -- --reset

# 4. Web app (http://localhost:3000)
npm run dev
```

and finally the node simulator:

```bash
npm run simulate                    # = python scripts/simulator.py (mixed scenario)
```

`npm run demo` starts db + broker + web together in one terminal, if you prefer.

> **Start the simulator soon after seeding.** Without it, nodes stop sending heartbeats and every machine turns Offline after 120 s. That is the correct behaviour, but not what you want on screen. If it happens, run `npm run seed -- --reset` again and start the simulator.

### Demo accounts (DEMO ONLY)

All accounts use the password **`AcousticDemo#2026`**.

| Name | Email | Role | Sites |
|---|---|---|---|
| Hamza Ranjha | hamza.ranjha@acousticsense.local | Admin | all |
| Faaiz Khan | faaiz.khan@acousticsense.local | Maintenance Engineer | Wah Plant |
| Ayesha Tariq | ayesha.tariq@acousticsense.local | Maintenance Engineer | Wah Plant, Taxila |
| Usman Ali | usman.ali@acousticsense.local | Viewer | Wah Plant |
| Bilal Ahmed | bilal.ahmed@acousticsense.local | Engineer, **disabled** | Taxila |

To change the admin's name, edit `USERS` in `scripts/seed.ts`. The fleet (24 machines and nodes AS-N-001 to AS-N-024) is defined in `scripts/fleet.json`, shared by the seed and the simulator.

## Simulator

```bash
python scripts/simulator.py [options]
  --scenario normal|anomaly|offline|mixed   default mixed: P-101 anomaly, F-201 and G-402 warning,
                                            TX-M1 rising trend, TX-P4 (AS-N-019) offline
  --speed 5                                 time compression (5x faster ramps and reports)
  --nodes 6                                 simulate only the first N nodes
  --drop-node AS-N-019                      stop publishing for a node (turns Offline after the timeout)
  --offline-burst AS-N-007                  go silent ~150 s, buffer, then replay out of order
                                            (appears as "Offline log sync" + node sync history)
  --burst-seconds 60                        length of the burst
  --duplicates                              re-send ~10% of messages with the same seq (must be ignored)
```

Each scenario shows up in the UI within about a minute. The message format is in [docs/mqtt-contract.md](docs/mqtt-contract.md); the firmware must match it.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Web app + API + MQTT ingestion + offline/escalation monitor |
| `npm run db` | Local Postgres (PGlite) on 5432 |
| `npm run broker` | Development MQTT broker on 1883 (`BROKER_ACL=1` enforces per-node topics) |
| `npm run broker:sync-users` | Writes `mosquitto/passwd` and `mosquitto/acl` from node credentials |
| `npm run seed` / `npm run seed -- --reset` | Demo data (idempotent) / regenerate history |
| `npm run simulate` | Node simulator |
| `npm test` | Unit + integration tests |
| `npm run lint` / `npm run typecheck` | ESLint / TypeScript |

**Windows note:** run `npm test` from a terminal whose current folder is `D:\acoustic_sense` with a capital drive letter. Vitest loads twice and fails with `Cannot read properties of undefined (reading 'config')` when the folder is spelled `d:\...`.

## 5-minute demo script (defence)

1. **Sign in** as Hamza (Admin). *"Accounts are created by an admin. Access is role-based, and the server enforces it on every API call, not only in the UI."*
2. **Dashboard.** Point at the KPI row (19 healthy, 3 warning, 1 anomaly, 1 offline) and Pump P-101 in red. *"Nodes send only a score and a heartbeat, never audio. Each card updates live over MQTT and the browser's event stream; watch the score flash."*
3. **Machine detail for Pump P-101.** Show the score chart crossing the dashed threshold 0.045, and the edge-node card (firmware, model AE-MFCC v3 int8 58 KB, 38 ms inference, RSSI). *"An anomaly is the score above the node's calibrated threshold for 9 consecutive windows. That rule lives in one shared function used by both the pipeline and the UI."*
4. **Alert centre.** Open #A-2311. Click **Assign to... Faaiz Khan** (he is notified), then **Acknowledge**. Fill **Resolve with maintenance record** (Bearing lubricated, 25 min) and tick *Recalibrate threshold after fix*. *"Every action is logged with user and time."* Show the activity list.
5. **Offline resilience.** In a terminal run `python scripts/simulator.py --offline-burst AS-N-007 --burst-seconds 60` (stop the running simulator first). The node goes silent, then syncs: the event appears as **Offline log sync** and on the Node page under *Offline log sync history*. Stop `npm run broker` for a moment: the red *Live updates paused* banner appears, and it recovers by itself when the broker restarts.
6. **Nodes.** KPI row (firmware outdated 3), RSSI bars, node detail with uptime timeline. As Admin, **Register node** shows MQTT credentials once (only a hash is stored).
7. **Reports.** Alert summary for the last 7 days: mean time to acknowledge and to resolve, charts, **Export CSV** (opens in Excel), **Print / Save as PDF**.
8. **Settings, Users, Audit log.** Change the heartbeat timeout and show the audit entry with old and new values. Sign in as Usman (Viewer) in a private window: no action buttons, and Settings shows 403.

## Project layout

```
app/(auth)/            sign in, forgot / reset / set password (split-screen)
app/(app)/             dashboard, machines, alerts, nodes, reports, users, audit, settings, profile, 403/404
app/(print)/           print-optimised report (A4)
app/api/               route handlers (Zod validation, role guard, audit)
components/ui/         design-system components (tokens in app/globals.css)
components/app/        app shell, notifications, account menu, shared page parts
lib/shared/            pure rules shared by server and browser (severity rule, CSV, stats, password policy)
lib/server/            db, auth/sessions, settings, ingestion, MQTT, notifications, reports
scripts/               db server, broker, seed, simulator, sync-broker-users
docs/                  mqtt-contract.md (firmware JSON), broker.md (Mosquitto, ACL, TLS)
tests/                 unit + integration tests
```

## Notes for the defence

- "< 1 s on-device detection" on the sign-in page is plausible with about 38 ms per window, but measure it on the real ESP32 before claiming it.
- Keep the model label "AE-MFCC v3 . int8 . 58 KB" consistent with the final trained model.
- **Recalibration** is a request flag in this version. A later version would publish a config message to the node's MQTT topic (`.../config`).
- **Email** is mocked. A real SMTP provider plugs in behind the `Mailer` interface.
- **Push** notifications appear as live in-app toasts; there is no mobile push service.
