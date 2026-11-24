#!/usr/bin/env python3
"""
Acoustic Sense MQTT simulator - stands in for the ESP32-S3 nodes so the demo runs without hardware.

Publishes, per node, telemetry every 10 s and alert messages according to a scenario, using the
topics and JSON documented in docs/mqtt-contract.md. The fleet (node IDs, sites, thresholds) is read
from scripts/fleet.json, the same file the seed uses.

Examples
  python scripts/simulator.py                                  # mixed scenario (default)
  python scripts/simulator.py --scenario normal
  python scripts/simulator.py --scenario anomaly --speed 5      # anomaly ramps 5x faster
  python scripts/simulator.py --drop-node AS-N-019              # that node goes Offline after the timeout
  python scripts/simulator.py --offline-burst AS-N-007          # buffer, then replay as "Offline log sync"
  python scripts/simulator.py --duplicates                      # re-send ~10% of messages (de-dup test)

Requires: pip install paho-mqtt
"""
from __future__ import annotations

import argparse
import json
import os
import random
import signal
import sys
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

try:
    import paho.mqtt.client as mqtt
except ImportError:  # pragma: no cover
    sys.exit("paho-mqtt is not installed. Run:  python -m pip install paho-mqtt")

FLEET = Path(__file__).with_name("fleet.json")
PERSISTENCE = 9  # consecutive windows above threshold before the node reports "anomaly"


def iso(ts: float) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


@dataclass
class Node:
    id: str
    site: str
    machine: str
    threshold: float
    baseline: float
    rssi: int
    fw: str
    role: str  # behaviour in this run: normal | warning | anomaly | rising | offline
    seq: int = 0
    above: int = 0
    window: int = 0
    rising_level: float = 0.62
    pending: int = 0
    buffer: list = field(default_factory=list)
    burst_until: float = 0.0
    burst_done: bool = False

    def next_seq(self) -> int:
        self.seq += 1
        return self.seq

    def score(self, speed: float) -> float:
        """Reconstruction-error score for one reporting window."""
        self.window += 1
        thr, base = self.threshold, self.baseline
        noise = random.uniform(0.85, 1.12)
        if self.role == "anomaly":
            ramp_windows = max(2, int(6 / speed))
            k = min(1.0, self.window / ramp_windows)
            target = thr * random.uniform(1.48, 1.62)  # e.g. ~0.071 for P-101 (thr 0.045)
            return round(base + (target - base) * k * random.uniform(0.97, 1.03), 5)
        if self.role == "warning":
            # Hovers just under the threshold and pokes above it now and then.
            return round(thr * random.choice([0.88, 0.9, 0.93, 0.95, 0.97, 1.03, 1.06]) * random.uniform(0.98, 1.02), 5)
        if self.role == "rising":
            # Slow steady climb from 62% to 84% of the threshold, then restart (a "rising trend" Warning).
            self.rising_level = self.rising_level + 0.006 * speed if self.rising_level < 0.84 else 0.62
            return round(thr * self.rising_level, 5)
        return round(base * noise, 5)


class Sim:
    def __init__(self, args: argparse.Namespace):
        self.args = args
        fleet = json.loads(FLEET.read_text(encoding="utf-8"))
        self.prefix = args.prefix
        nodes = fleet["nodes"][: args.nodes] if args.nodes else fleet["nodes"]
        boot = int(time.time() * 1000)  # seq base: monotonic across simulator restarts
        self.nodes: list[Node] = []
        for i, n in enumerate(nodes):
            role = self.role_for(n["id"], n["role"])
            self.nodes.append(Node(n["id"], n["site"], n["machine"], n["threshold"], n["baseline"], n["rssi"], n["fw"], role, seq=boot + i * 10_000_000))
        self.interval = 10.0 / max(args.speed, 0.1)
        self.stop = threading.Event()
        self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"acoustic-sim-{os.getpid()}", clean_session=True)
        if args.username:
            self.client.username_pw_set(args.username, args.password or None)
        self.client.on_connect = lambda c, u, f, rc, p=None: print(f"[sim] connected to {args.host}:{args.port} (rc={rc})")
        self.client.on_disconnect = lambda c, u, f, rc, p=None: print(f"[sim] disconnected (rc={rc}); reconnecting...")
        self.client.reconnect_delay_set(min_delay=1, max_delay=15)
        self.sent = 0
        self.dupes = 0

    def role_for(self, node_id: str, fleet_role: str) -> str:
        a = self.args
        if node_id in a.drop_node:
            return "offline"
        if a.scenario == "normal":
            return "normal"
        if a.scenario == "anomaly":
            return "anomaly" if node_id == a.anomaly_node else "normal"
        if a.scenario == "offline":
            return "offline" if fleet_role == "offline" else "normal"
        return fleet_role  # mixed: as designed in fleet.json

    def topic(self, n: Node, kind: str) -> str:
        return f"{self.prefix}/{n.site}/{n.id}/{kind}"

    def publish(self, n: Node, kind: str, payload: dict, qos: int):
        data = json.dumps(payload, separators=(",", ":"))
        self.client.publish(self.topic(n, kind), data, qos=qos)
        self.sent += 1
        if self.args.duplicates and random.random() < 0.1:
            self.client.publish(self.topic(n, kind), data, qos=qos)  # same seq -> must be ignored
            self.dupes += 1

    def tick(self, n: Node):
        now = time.time()
        if n.role == "offline":
            return
        # Offline burst: go silent, keep buffering with original event_time, then replay out of order.
        if n.id in self.args.offline_burst and not n.burst_done:
            if n.burst_until == 0.0 and n.window >= 3:
                n.burst_until = now + self.args.burst_seconds
                print(f"[sim] {n.id}: connection lost (buffering for {self.args.burst_seconds:.0f} s)")
            if n.burst_until and now < n.burst_until:
                score = round(n.threshold * random.uniform(1.25, 1.5), 5)  # the fault happens while offline
                n.window += 1
                n.above += 1
                n.pending += 1
                n.buffer.append(("telemetry", self.telemetry(n, now, score), 0))
                n.buffer.append(("alert", self.alert(n, now, score), 1))
                return
            if n.burst_until and now >= n.burst_until:
                n.burst_done = True
                items = n.buffer[:]
                random.shuffle(items)  # arrive out of order
                print(f"[sim] {n.id}: reconnected, syncing {len(items)} buffered messages (offline log)")
                for kind, payload, qos in items:
                    payload["pending"] = 0 if kind == "telemetry" else payload.get("pending")
                    payload = {k: v for k, v in payload.items() if v is not None}
                    self.publish(n, kind, payload, qos)
                n.buffer.clear()
                n.pending = 0
                n.above = 0

        score = n.score(self.args.speed)
        n.above = n.above + 1 if score > n.threshold else 0
        self.publish(n, "telemetry", self.telemetry(n, now, score), 0)
        if score > n.threshold:
            self.publish(n, "alert", self.alert(n, now, score), 1)

    def telemetry(self, n: Node, now: float, score: float) -> dict:
        return {
            "node_id": n.id,
            "seq": n.next_seq(),
            "event_time": iso(now),
            "fw": n.fw,
            "model": "AE-MFCC v3 . int8 . 58 KB",
            "rssi": int(n.rssi + random.randint(-3, 3)),
            "infer_ms": round(random.uniform(36, 41), 1),
            "pending": n.pending,
            "status": "ok",
            "score": score,
        }

    def alert(self, n: Node, now: float, score: float) -> dict:
        return {
            "node_id": n.id,
            "seq": n.next_seq(),
            "event_time": iso(now),
            "anomaly_score": score,
            "threshold": n.threshold,
            "status": "anomaly" if n.above >= PERSISTENCE else "warning",
        }

    def run(self):
        print(f"[sim] scenario={self.args.scenario} nodes={len(self.nodes)} interval={self.interval:.1f}s speed={self.args.speed}x")
        for n in self.nodes:
            if n.role != "normal":
                print(f"[sim]   {n.id} {n.machine:<18} -> {n.role}")
        for b in self.args.offline_burst:
            print(f"[sim]   {b} -> offline burst after ~3 windows")
        try:
            self.client.connect(self.args.host, self.args.port, keepalive=30)
        except OSError as e:
            sys.exit(f"[sim] cannot connect to {self.args.host}:{self.args.port}: {e}. Is the broker running (npm run broker)?")
        self.client.loop_start()
        # Spread nodes over the interval like real devices.
        offsets = {n.id: random.uniform(0, self.interval) for n in self.nodes}
        due = {n.id: time.time() + offsets[n.id] for n in self.nodes}
        last_report = time.time()
        while not self.stop.is_set():
            now = time.time()
            for n in self.nodes:
                if now >= due[n.id]:
                    try:
                        self.tick(n)
                    except Exception as e:  # never die on one bad tick
                        print(f"[sim] {n.id} tick error: {e}")
                    due[n.id] += self.interval
            if now - last_report > 30:
                print(f"[sim] {self.sent} messages sent" + (f", {self.dupes} duplicates" if self.args.duplicates else ""))
                last_report = now
            self.stop.wait(0.2)
        self.client.loop_stop()
        self.client.disconnect()
        print("[sim] stopped")


def main():
    p = argparse.ArgumentParser(description="Acoustic Sense MQTT node simulator")
    p.add_argument("--host", default=os.environ.get("MQTT_HOST", "127.0.0.1"))
    p.add_argument("--port", type=int, default=int(os.environ.get("MQTT_PORT", "1883")))
    p.add_argument("--username", default=os.environ.get("SIM_MQTT_USERNAME", "simulator"), help="dev credential (see npm run broker:sync-users)")
    p.add_argument("--password", default=os.environ.get("SIM_MQTT_PASSWORD", "dev-simulator-password"))
    p.add_argument("--prefix", default="acousticsense")
    p.add_argument("--nodes", type=int, default=0, help="only simulate the first N nodes (default: all 24)")
    p.add_argument("--scenario", choices=["normal", "anomaly", "offline", "mixed"], default="mixed")
    p.add_argument("--anomaly-node", default="AS-N-007", help="node that ramps up in the anomaly scenario")
    p.add_argument("--speed", type=float, default=1.0, help="time compression (2 = twice as fast)")
    p.add_argument("--drop-node", action="append", default=[], metavar="NODE", help="stop publishing for this node (repeatable)")
    p.add_argument("--offline-burst", action="append", default=[], metavar="NODE", help="buffer then replay this node's messages (repeatable)")
    p.add_argument("--burst-seconds", type=float, default=150.0, help="length of the offline burst (default 150 s, longer than the 120 s timeout)")
    p.add_argument("--duplicates", action="store_true", help="re-send ~10%% of messages with the same seq")
    args = p.parse_args()

    sim = Sim(args)
    signal.signal(signal.SIGINT, lambda *_: sim.stop.set())
    signal.signal(signal.SIGTERM, lambda *_: sim.stop.set())
    sim.run()


if __name__ == "__main__":
    main()
