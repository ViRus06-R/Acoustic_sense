// Idempotent schema. Applied automatically on first DB use (see db.ts) and by `npm run seed`.
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS sites (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  address TEXT NOT NULL DEFAULT '',
  timezone TEXT,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS lines (
  id SERIAL PRIMARY KEY,
  site_id INT NOT NULL REFERENCES sites(id),
  name TEXT NOT NULL,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS lines_site_name ON lines(site_id, lower(name)) WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  password_hash TEXT,
  role TEXT NOT NULL CHECK (role IN ('admin','engineer','viewer')),
  notify_via TEXT NOT NULL DEFAULT 'Push + email',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  failed_attempts INT NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email ON users(lower(email));
CREATE TABLE IF NOT EXISTS user_sites (
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  site_id INT NOT NULL REFERENCES sites(id),
  PRIMARY KEY (user_id, site_id)
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,                -- sha256 of the cookie token
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  remember BOOLEAN NOT NULL DEFAULT false,
  user_agent TEXT,
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS auth_tokens (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL CHECK (purpose IN ('reset','set')),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS machines (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  site_id INT NOT NULL REFERENCES sites(id),
  line_id INT REFERENCES lines(id),
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Offline',
  score DOUBLE PRECISION,
  last_event_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS machines_site_name ON machines(site_id, lower(name)) WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY,
  site_id INT NOT NULL REFERENCES sites(id),
  line_id INT REFERENCES lines(id),
  machine_id INT REFERENCES machines(id),
  mounting_note TEXT NOT NULL DEFAULT '',
  firmware TEXT,
  model TEXT,
  threshold DOUBLE PRECISION NOT NULL DEFAULT 0.045,
  threshold_calibrated BOOLEAN NOT NULL DEFAULT true,
  persistence INT,                    -- null = use Settings default
  heartbeat_interval INT NOT NULL DEFAULT 10,
  inference_ms DOUBLE PRECISION,
  rssi INT,
  pending INT NOT NULL DEFAULT 0,
  last_heartbeat_at TIMESTAMPTZ,
  recalibration_requested_at TIMESTAMPTZ,
  mqtt_password_hash TEXT,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decommissioned_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS nodes_machine ON nodes(machine_id) WHERE machine_id IS NOT NULL AND decommissioned_at IS NULL;

CREATE TABLE IF NOT EXISTS telemetry (
  id BIGSERIAL PRIMARY KEY,
  node_id TEXT NOT NULL REFERENCES nodes(id),
  seq BIGINT,
  event_time TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rssi INT,
  infer_ms DOUBLE PRECISION,
  pending INT,
  score DOUBLE PRECISION,
  fw TEXT,
  status TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS telemetry_dedup ON telemetry(node_id, seq);
CREATE INDEX IF NOT EXISTS telemetry_node_time ON telemetry(node_id, event_time DESC);
CREATE INDEX IF NOT EXISTS telemetry_time ON telemetry(event_time);

CREATE TABLE IF NOT EXISTS alerts (
  id SERIAL PRIMARY KEY,
  node_id TEXT NOT NULL REFERENCES nodes(id),
  machine_id INT REFERENCES machines(id),
  site_id INT NOT NULL REFERENCES sites(id),
  severity TEXT NOT NULL CHECK (severity IN ('Warning','Anomaly','Offline')),
  score DOUBLE PRECISION,
  threshold DOUBLE PRECISION,
  windows INT NOT NULL DEFAULT 1,
  detected_at TIMESTAMPTZ NOT NULL,
  last_event_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_via TEXT NOT NULL DEFAULT 'MQTT live',
  status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open','Acknowledged','Resolved')),
  assignee_id INT REFERENCES users(id),
  acknowledged_by INT REFERENCES users(id),
  acknowledged_at TIMESTAMPTZ,
  resolved_by INT REFERENCES users(id),
  resolved_at TIMESTAMPTZ,
  action_taken TEXT,
  notes TEXT,
  downtime_min INT,
  parts_used TEXT,
  recalibrate_after_fix BOOLEAN NOT NULL DEFAULT false,
  escalated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS alerts_detected ON alerts(detected_at DESC);
CREATE INDEX IF NOT EXISTS alerts_machine ON alerts(machine_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS alerts_node ON alerts(node_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS alerts_status ON alerts(status);

CREATE TABLE IF NOT EXISTS alert_messages (
  id BIGSERIAL PRIMARY KEY,
  node_id TEXT NOT NULL REFERENCES nodes(id),
  seq BIGINT NOT NULL,
  event_time TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  score DOUBLE PRECISION,
  threshold DOUBLE PRECISION,
  status TEXT,
  alert_id INT REFERENCES alerts(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS alert_messages_dedup ON alert_messages(node_id, seq);

CREATE TABLE IF NOT EXISTS sync_history (
  id SERIAL PRIMARY KEY,
  node_id TEXT NOT NULL REFERENCES nodes(id),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  events_synced INT NOT NULL DEFAULT 0,
  outage_start TIMESTAMPTZ NOT NULL,
  outage_end TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS sync_history_node ON sync_history(node_id, received_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  alert_id INT REFERENCES alerts(id),
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS notifications_user ON notifications(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id INT,
  user_name TEXT,
  action TEXT NOT NULL,
  target TEXT,
  details JSONB
);
CREATE INDEX IF NOT EXISTS audit_at ON audit_log(at DESC);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_by INT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS report_runs (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  params JSONB NOT NULL,
  row_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS report_runs_user ON report_runs(user_id, created_at DESC);
`;
