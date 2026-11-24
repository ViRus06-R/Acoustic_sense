# MQTT contract: ESP32-S3 node to Acoustic Sense backend

This is the exact format the firmware must publish. The backend (`lib/server/ingest.ts`) validates every message against it and drops anything that does not match. The simulator (`scripts/simulator.py`) follows it too, so you can compare with it.

## Connection

| Item | Value |
|---|---|
| Broker | Mosquitto, port 1883 (dev) or 8883 with TLS |
| Client ID | the node ID, e.g. `AS-N-007` |
| Username / password | node ID + the password shown once when the node is registered (Nodes > Register node, or Rotate credentials) |
| Keep-alive | 30 s recommended |
| Clean session | true |

Each node may publish **only** to its own two topics (enforced by the Mosquitto ACL from `npm run broker:sync-users`).

## Topics

```
acousticsense/{site}/{node}/telemetry     QoS 0, every heartbeat interval (default 10 s)
acousticsense/{site}/{node}/alert         QoS 1, when the anomaly score is above the threshold
```

- `{site}` is the site slug, e.g. `wah-plant` or `taxila-pumping-station` (shown on the Node page).
- `{node}` is the node ID, e.g. `AS-N-007`. It must equal `node_id` in the payload.
- The prefix `acousticsense` can be changed in Settings > MQTT and broker.

## Telemetry JSON

```json
{
  "node_id": "AS-N-007",
  "seq": 1795528012345,
  "event_time": "2026-11-24T10:42:07.120Z",
  "fw": "v1.2.0",
  "model": "AE-MFCC v3 . int8 . 58 KB",
  "rssi": -61,
  "infer_ms": 38.2,
  "pending": 0,
  "status": "ok",
  "score": 0.0213
}
```

| Field | Type | Required | Meaning |
|---|---|---|---|
| `node_id` | string `AS-N-###` | yes | Node ID |
| `seq` | integer >= 0 | yes | Message sequence number, see below |
| `event_time` | ISO-8601 UTC string, or Unix seconds / milliseconds | yes | When the window was measured (not when it was sent) |
| `fw` | string, max 32 | no | Firmware version, e.g. `v1.2.0` |
| `model` | string, max 80 | no | Model label |
| `rssi` | integer dBm, -127..0 | no | Wi-Fi signal |
| `infer_ms` | number | no | Inference time per window in ms |
| `pending` | integer >= 0 | no | Events still waiting in the offline log |
| `status` | string, max 32 | no | Free text, e.g. `ok` |
| `score` | number >= 0 | no, **but needed for charts** | Mean anomaly score (reconstruction MSE) over the reporting interval |

Note: `score` is an addition to the original telemetry list. Without it the score charts, sparklines and the server-side Warning/Anomaly status have no data. Raw audio is never sent.

## Alert JSON

```json
{
  "node_id": "AS-N-007",
  "seq": 1795528012346,
  "event_time": "2026-11-24T10:42:07.120Z",
  "anomaly_score": 0.071,
  "threshold": 0.045,
  "status": "anomaly"
}
```

| Field | Type | Required | Meaning |
|---|---|---|---|
| `node_id` | string `AS-N-###` | yes | Node ID |
| `seq` | integer >= 0 | yes | Sequence number |
| `event_time` | as above | yes | When the window was measured |
| `anomaly_score` | number >= 0 | yes | Score of this window |
| `threshold` | number >= 0 | yes | Threshold the node used |
| `status` | `"normal"`, `"warning"` or `"anomaly"` | yes | `warning` = above threshold for fewer than the persistence windows (default 9); `anomaly` = above threshold for at least that many consecutive windows; `normal` = back below (optional, stored only) |

Publish one alert message per window while the score is above the threshold. The backend groups repeated messages from the same node within the de-duplication window (default 15 min) into a single alert, and upgrades it from Warning to Anomaly if needed.

## Rules the backend applies

1. **De-duplication:** `(node_id, seq)` is unique per topic type. A message with a `seq` already received is ignored, so QoS 1 re-deliveries are safe.
2. **`seq` must keep increasing across reboots.** Store it in NVS, or use `boot_counter * 1_000_000 + counter`, or epoch milliseconds. If `seq` restarts at 0 after a reboot, new messages will be dropped as duplicates.
3. **Offline log:** while Wi-Fi or the broker is down, buffer messages with their original `event_time` and send them after reconnecting (any order is fine). Messages arriving more than 30 s after `event_time` are labelled **"Offline log sync"** and recorded in the node's sync history. Charts use `event_time`; sync history uses the time received.
4. **Heartbeat:** every telemetry message counts as a heartbeat. No heartbeat for the configured timeout (default 120 s) turns the node Offline and raises an Offline alert, which auto-resolves when telemetry resumes.
5. **Clock:** `event_time` must be UTC (sync with SNTP). Times more than 5 s in the future are clamped to the receive time.
6. **Size:** keep payloads under 512 bytes. Unknown fields are ignored.

## Not yet implemented (planned)

`acousticsense/{site}/{node}/config` (node subscribes): a later version will publish recalibration and threshold changes here. In this version "Request recalibration" only sets a flag on the node record.
