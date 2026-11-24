# Acoustic Sense Web App: Builder Prompts for the Missing Pages

These prompts build every page that has not been designed yet, so the web app is complete. **No screenshots are needed:** Prompt 0 describes the design system and the existing pages in words, so any AI builder can match the look.

**Already designed (described in Prompt 0):** Sign in, Fleet overview (Dashboard), Machine detail, Alert centre, Users & roles (+ Add user dialog).

**Built by these prompts:**

| # | Prompt | What it builds |
|---|---|---|
| 0 | Context + design system | Project facts, design described in words, existing pages, roles (paste first) |
| 1 | Machines list | The "View all machines" page |
| 2 | Nodes | Node list, node detail, register node |
| 3 | Reports | Report builder, preview, CSV export, print/PDF |
| 4 | Settings | 7 tabs (General, Sites, Detection, Notifications, Security, Broker, Retention) |
| 5 | Auth flows | Forgot password, reset/set password, account menu, change password |
| 6 | Completions | Edit/Reset/Disable user, notification panel, 403/404, broker-offline state |
| 7 | Data + simulator | Seed data and MQTT simulator for all new pages |
| 8 | QA pass | Checklist to run before you demo |

## How to use

1. If your builder tool has a "project knowledge" or "custom instructions" box, put **Prompt 0** there so it is remembered. Otherwise paste Prompt 0 as your first message.
2. Open your builder AI on the project that already contains your 5 pages.
3. Then paste the other prompts **in order**. Let each one finish and run before pasting the next.
4. After each prompt, run the app and look at the page. If something is off, tell the builder AI exactly what is wrong in words (page, element, what you expected).

## Defaults I assumed (you did not answer these yet, change any of them)

- **Stack:** React + Vite + TypeScript + Tailwind (web), Node.js (Express, TypeScript) backend, PostgreSQL, Mosquitto broker. If your project already uses something else, the prompts tell the builder AI to follow the existing stack.
- **Data:** a Python simulator publishes fake MQTT alerts and telemetry, so everything works without hardware. Real ESP32 nodes can replace it later.
- **Email:** mocked. Emails (password links, notifications) are written to the console and to a dev-mail folder. No real email service.
- **Threshold recalibration:** saved as a "recalibration requested" flag on the node. The web app does not send live commands to the device.
- **Roles:** Admin: everything. Maintenance Engineer: view, acknowledge, assign, resolve, export. Viewer: read-only.
- **Demo runs locally** on your laptop (broker, backend, database).
- **Names in demo data:** admin is "Hamza Ranjha" (change in Prompt 7 if you want the spelling on the proposal form).

---

## PROMPT 0: Context, design system and existing pages (paste first)

```text
You are helping me finish the web app for my final-year project, "Acoustic Sense": an edge-ML industrial acoustic health monitor. ESP32-S3 nodes listen to machines, run an int8 autoencoder on-device, and publish only small alert/telemetry messages over MQTT. Raw audio never leaves the node. This web app is the engineer-facing dashboard.

STEP 1 - DISCOVER (before writing code):
- Inspect the existing project. Summarise in 10 lines: stack, folder structure, how routing, auth, API calls, real-time updates and styling work, and which pages already exist.
- Follow the existing stack and conventions. Only if the project is empty, use: React + Vite + TypeScript + Tailwind, React Router, TanStack Query, Recharts; Node.js + Express + TypeScript; PostgreSQL; Mosquitto MQTT; Zod for validation.
- Do not rewrite or restyle pages that already exist. Reuse their components, tokens and patterns. Where the code and this description differ, the code wins and you tell me about the difference.

STEP 2 - DESIGN SYSTEM (new pages must look like the existing ones):
- App shell: fixed dark navy sidebar on the left (about 220px). Top of sidebar: logo (small teal sound-wave icon + "Acoustic Sense" in white). Section label "MONITORING" with items Dashboard, Machines, Alerts (with a small red count pill), Nodes, Reports; section label "ADMINISTRATION" with items Users, Settings. Active item has a lighter navy background with a teal icon. At the bottom of the sidebar, a status chip: green dot + "Broker connected" and, below it, "MQTT . 24 nodes online" in muted text.
- Top bar (white, thin bottom border): left = page title (bold, about 20px) with a small muted subtitle under it; right = Site selector dropdown (e.g. "Site: Wah Plant . Line A"), search box with magnifier ("Search machines"), notification bell with a small red count badge, then avatar circle (teal, initials) with name and role beneath it (e.g. "Faaiz Khan / Engineer").
- Page background: very light grey-blue. Content in white cards with 12px radius, 1px light border, very soft shadow, 20px padding, 16-20px gaps.
- Approximate colours (use design tokens defined once, in CSS variables or the Tailwind theme, and never hard-code colours elsewhere; if tokens already exist in the project, reuse them): sidebar navy #0F1B2D, page background #F4F6F9, card white, border #E4E8EE, text dark #111827, muted text #6B7280, primary teal #0FA3A0 (hover slightly darker), danger/Anomaly red #E5484D, warning amber #F59E0B, success/Healthy green #22A06B, offline grey #8A94A6, Admin role chip blue #3B6FE0.
- Status pills: small rounded pills with a coloured dot and text, light tinted background. Anomaly = red, Warning = amber, Normal/Healthy/Online/Resolved/Active = green, Offline/Disabled = grey, Open = red outline-style, Acknowledged = amber/orange outline-style. Never rely on colour alone: always show the text.
- Buttons: primary = solid teal with white text, 8px radius; secondary = white with grey border; destructive = red. Inputs and selects: white, 1px grey border, 8px radius, teal focus ring.
- Tables: white card, light grey header row with small muted column titles, 48px rows, subtle row hover, selected row has a 3px teal left border and light teal tint. Pagination at the bottom ("Showing 7 of 132" on the left, page numbers on the right).
- Charts (Recharts): thin teal line with a pale teal area fill, light grid, small muted axis labels, a dashed red horizontal threshold line with a label like "threshold 0.045"; points above the threshold are small red dots. Range tabs (1 h, 24 h, 7 d, 30 d) are small pill toggles with the active one filled light teal.
- Modals: centred white card, 12px radius, title and close X at the top, form fields in a two-column grid where it makes sense, info boxes with a light blue background, footer with Cancel (secondary) and primary action button on the right; the page behind is dimmed.
- Typography: clean rounded sans-serif (Inter, Plus Jakarta Sans or similar), tabular numbers for scores and counts, scores shown with 3 decimals (e.g. 0.071).
- Every list page: loading skeletons, empty state with helpful text, error state with retry, keyboard-accessible controls with visible focus. Desktop first (1280px+), usable to tablet width (768px) where the sidebar collapses to icons.

STEP 3 - EXISTING PAGES (described so you can stay consistent; they are already built):
- Sign in: split screen. Left (dark navy): logo, headline "Hear machine faults" with the second line "before they happen." in teal, a short supporting sentence ("Edge-AI acoustic monitoring for motors, pumps, fans and gearboxes. Raw audio never leaves the node."), three stats ("< 1 s on-device detection", "0 KB raw audio uploaded", "24/7 offline-safe logging"), and a footer "COMSATS University Islamabad, Wah Campus . FYP 2026". Right (white): title "Sign in", subtext "Use the account your administrator created for you.", Email field, Password field with a "Show" toggle, "Remember me on this device" checkbox, teal "Forgot password?" link, full-width teal "Sign in" button, a red error box "Invalid email or password. 3 attempts left before lock.", and a small footnote "Access is role-based: Administrator, Maintenance Engineer, Viewer."
- Dashboard ("Fleet overview", subtitle "Live machine health . updated 4 s ago"): KPI row of five cards (Monitored 24, Healthy 19 in green, Warning 3 in amber, Anomaly 1 in red, Offline 1 in grey); card "Machine health" with a link "View all machines" and a 3-column grid of machine cards (machine name, status pill, large coloured score, small "thr 0.045", mini sparkline; offline cards show "Last seen 2 h ago . Node AS-N-019"); card "Recent alerts" on the right (status pill, machine, time, short reason such as "Score 0.071 > thr 0.045"); wide card "Fleet anomaly score . last 24 h" with a mean-score area chart and a dashed red threshold line.
- Machine detail (e.g. "Pump P-101" with a red Anomaly pill; subtitle "Line A . Node AS-N-007 . mounted on drive-end bearing housing"): large chart "Anomaly score (reconstruction MSE)" with range tabs 1 h / 24 h / 7 d / 30 d and the dashed red threshold line; right card "Edge node AS-N-007" with key-value rows (Status Online, Last heartbeat 4 s ago, Firmware v1.2.0, Model "AE-MFCC v3 . int8 . 58 KB", Threshold 0.045 (calibrated), Inference time 38 ms / window, Wi-Fi RSSI -61 dBm, Offline log 0 events pending); card "Detection events" with buttons "Export CSV" and teal "Acknowledge" and a table with columns Detected at, Severity, Score, Threshold, Duration, Delivered via ("MQTT live" or "Offline log sync"), Status (Open, Acknowledged, Resolved).
- Alert centre (subtitle "3 open . 1 acknowledged . 128 resolved this month"): filter dropdowns Status, Severity, Machine, "Last 7 days"; table with columns Severity, Machine / node, Score, Detected, Status; the selected row is highlighted; right detail panel "Alert #A-2311" with an Open pill, a red callout "Reconstruction error above threshold. Score 0.071 vs threshold 0.045 (+58%). Sustained for 9 consecutive windows. First detected 10:42:07 . live via MQTT", a small chart, buttons "Acknowledge" (teal) and "Assign to..." (secondary), then a section "Resolve with maintenance record" with Action taken (dropdown, e.g. "Bearing lubricated"), Notes (textarea), Downtime (min), Parts used, a checkbox "Recalibrate threshold after fix", a teal "Mark as resolved" button and the helper text "Every action is logged with user and time."
- Users & roles (subtitle "Manage who can access which sites"): teal "+ Add user" button; table with Name (initials avatar), Email, Role chip (Admin blue, Engineer green, Viewer grey), Sites, Status (Active green, Disabled grey) and "Edit" / "Reset" text links; "Add user" modal with Full name, Email, Role dropdown, "Notify via" dropdown (e.g. "Push + email"), Site access checkboxes (Wah Plant . Line A, Wah Plant . Line B, Taxila Pumping Station), an info box "A one-time password link is emailed; it expires in 24 hours.", and Cancel / "Create user" buttons.

STEP 4 - DOMAIN MODEL (reuse what exists, add what is missing):
- Site (e.g. "Wah Plant", "Taxila Pumping Station") has Lines (e.g. "Line A", "Line B"). Site labels look like "Wah Plant . Line A".
- Machine (e.g. "Pump P-101"; types: Pump, Fan, Motor, Gearbox, Compressor, Conveyor) belongs to a site/line and has exactly one Node (or none).
- Node (e.g. "AS-N-007"): status Online/Offline, last heartbeat, firmware (e.g. v1.2.0), model label (e.g. "AE-MFCC v3 . int8 . 58 KB"), calibrated threshold (e.g. 0.045), inference time ms/window, Wi-Fi RSSI dBm, offline events pending, mounting note.
- Detection event / Alert (e.g. "#A-2311"): machine, node, score (reconstruction MSE), threshold, severity (Warning, Anomaly, Offline), duration, delivered via ("MQTT live" or "Offline log sync"), status (Open, Acknowledged, Resolved), assignee, maintenance record (action taken, notes, downtime minutes, parts used, recalibrate-after-fix flag).
- User: name, email, role (Admin, Maintenance Engineer, Viewer), site access list, notify-via (Push, Email, Push + email), status (Active, Disabled), last login.
- Audit log: every state-changing action (who, what, when, target).
- Severity rule: score above threshold sustained for the configured number of windows = Anomaly; rising trend or briefly above = Warning; no heartbeat for the configured timeout (default 120 s) = Offline. Keep this rule in ONE shared function.

STEP 5 - ROLES (enforce on the server AND hide/disable in the UI):
- Admin: everything, including Users and Settings.
- Maintenance Engineer: view everything for their sites; acknowledge, assign, resolve alerts; export CSV; request threshold recalibration.
- Viewer: read-only; no buttons that change data.
- Users only see sites they have access to.

STEP 6 - CONFIRM: reply with your summary of the project, the pages that already exist, the pages still missing (expected: Machines list, Nodes, Reports, Settings, forgot/reset/set password, profile and change password, notification panel, 403/404, audit log), and any differences between this description and the code. Do not build anything yet.
```

---

## PROMPT 1: Machines list page

```text
Build the "Machines" page (sidebar > Monitoring > Machines, also reached from the Dashboard link "View all machines"). Match the design system and existing pages described in Prompt 0. Follow existing conventions. Reuse components from the dashboard and machine detail pages (status pill, sparkline, score/threshold display).

PAGE: Machines
- Header: title "Machines", subtitle "{N} machines . {M} need attention". Primary button "+ Add machine" (Admin only).
- Filter bar: Site/Line (respects the top Site selector), Type (Pump, Fan, Motor, Gearbox, Compressor, Conveyor), Status (All, Normal, Warning, Anomaly, Offline), search by machine name or node ID, Sort (Status severity, Score high to low, Name, Last event).
- View toggle: Cards (default; same machine health cards as the dashboard: name, status pill, score, threshold, sparkline) and Table.
- Table columns: Machine, Type, Line, Node (link), Status, Score, Threshold, Last event (relative time), 24h sparkline. Rows are clickable and open the existing Machine detail page. Offline machines show "Last seen X ago . Node AS-N-0xx" in grey.
- Pagination or "load more" (page size 24). Keep filters in the URL query string so the view is shareable and survives refresh.
- Live updates: score, status and sparkline update from the real-time channel without a page reload (flash the changed value briefly).

ADD / EDIT MACHINE (modal, Admin only; Edit also available on the machine detail page header menu):
- Fields: Name, Type, Site, Line, Assigned node (dropdown of unassigned nodes, optional), Notes.
- Validation: name unique per site; node can belong to one machine only. Show inline errors.
- Delete/Archive machine (Admin): confirm dialog; archived machines disappear from lists but keep history.

API (add what is missing, validate with Zod, enforce roles):
- GET /api/machines?site=&line=&type=&status=&q=&sort=&page=
- POST /api/machines, PATCH /api/machines/:id, DELETE /api/machines/:id (archive)
- Each machine row includes: id, name, type, site, line, node {id, status}, status, score, threshold, lastEventAt, sparkline (last 24 points).
- Log create/update/archive to the audit log.

ACCEPTANCE: filters and URL state work; toggling Cards/Table keeps filters; Viewer sees no Add/Edit/Delete; live score changes appear; empty state ("No machines match your filters" + Clear filters button); unit test for the status filter and the severity-sort function.
```

---

## PROMPT 2: Nodes (list, detail, register)

```text
Build the "Nodes" section (sidebar > Monitoring > Nodes). A node is one ESP32-S3 edge device. Match the design system from Prompt 0 and reuse existing components. Follow existing conventions.

PAGE A: Nodes list
- Header: "Nodes", subtitle "{N} nodes . {X} online". Button "+ Register node" (Admin only).
- KPI row (same style as the dashboard KPI cards): Total nodes, Online, Offline, Offline logs pending (sum of pending events), Firmware outdated (versions older than the latest known).
- Filters: Site/Line, Status (Online, Offline, Degraded), Firmware version, search by node ID or machine name.
- Table columns: Node ID, Machine (link), Site / Line, Status pill, Last heartbeat (relative), Firmware, Model, Wi-Fi signal (RSSI dBm with a 4-bar icon: excellent > -55, good -55 to -67, fair -67 to -80, weak < -80), Inference (ms/window), Pending offline events.
- Status rule: Online if heartbeat within the configured timeout (default 120 s); Offline otherwise; Degraded if Online but RSSI is weak or pending offline events > 0.
- Row click opens Node detail. Live updates via the real-time channel.

PAGE B: Node detail (route /nodes/:id)
- Header: Node ID + status pill, subtitle "Mounted on {note} . {machine name}" with link to the machine.
- Left, two charts with 1h / 24h / 7d range tabs: (1) Wi-Fi RSSI over time, (2) Heartbeat/uptime timeline (green = online, grey = offline bands).
- Right card "Edge node": Status, Last heartbeat, Firmware, Model, Threshold (calibrated), Inference time, Wi-Fi RSSI, Offline log pending, MQTT topic (read-only, copy button), Registered on.
- Card "Configuration" (Admin and Maintenance Engineer can edit; Viewer read-only): Anomaly threshold (number), Persistence (consecutive windows before alert, default 9), Heartbeat interval (s). Save writes to the node record and to the audit log. Button "Request recalibration" sets a recalibration_requested flag with timestamp and shows a "Recalibration requested" chip (no live device command; add a code comment that a later version would publish a config message to the node's MQTT topic).
- Card "Offline log sync history": table of sync events (time, events synced, duration of outage). Empty state if none.
- Card "Recent detection events": last 10 events for this node with link to the Alert centre filtered by node.
- Admin actions (menu): Reassign to machine, Rotate credentials, Decommission node (confirm dialog; keeps history).

REGISTER NODE (modal, Admin only):
- Fields: Node ID (pattern AS-N-###, auto-suggest next), Site, Line, Machine (optional), Mounting note.
- On create, generate MQTT credentials for this node (username = node ID, random password). Show the password ONCE in a "Copy credentials" dialog with a warning, store only a hash. Also show the topics: acousticsense/{site}/{node}/alert and acousticsense/{site}/{node}/telemetry.
- For the demo, write a small script (scripts/sync-broker-users) that regenerates the Mosquitto password file from node credentials, and document how to enable TLS + per-node ACLs (each node may publish only to its own topics). Do not break the existing simulator; give it a default dev credential.

API:
- GET /api/nodes?site=&status=&q=&firmware= , GET /api/nodes/:id, POST /api/nodes, PATCH /api/nodes/:id (config), POST /api/nodes/:id/recalibrate, POST /api/nodes/:id/rotate-credentials, DELETE /api/nodes/:id (decommission)
- GET /api/nodes/:id/rssi?range= , GET /api/nodes/:id/heartbeats?range= , GET /api/nodes/:id/sync-history
- Telemetry ingestion: the backend subscribes to acousticsense/+/+/telemetry and stores heartbeat, firmware, model, rssi, inferenceMs, pendingEvents. Define and document the telemetry JSON: {node_id, seq, event_time, fw, model, rssi, infer_ms, pending, status}. This is the format my teammate's firmware must send; put it in docs/mqtt-contract.md together with the alert JSON {node_id, seq, event_time, anomaly_score, threshold, status}.
- Ignore duplicate messages using node_id + seq (unique constraint). Use event_time for charts, received_time for sync history.

ACCEPTANCE: stopping the simulator for one node turns it Offline after the timeout and the dashboard counts update; offline-sync messages show "Offline log sync" in the events table; credentials are shown only once; Viewer cannot edit; tests cover status derivation and RSSI bucketing.
```

---

## PROMPT 3: Reports

```text
Build the "Reports" page (sidebar > Monitoring > Reports). Match the design system from Prompt 0, reuse components. Follow existing conventions.

PAGE LAYOUT
- Header: "Reports", subtitle "Generate summaries for maintenance reviews and audits".
- Left panel "Report builder": 
  1. Report type (radio cards):
     a. Alert summary: counts by severity/status, top machines by alerts, mean time to acknowledge, mean time to resolve.
     b. Machine health: per machine, average and maximum anomaly score, time above threshold, number of events.
     c. Downtime and maintenance: resolved alerts with action taken, downtime minutes, parts used, who resolved.
     d. Node availability: per node uptime %, offline periods, pending/synced offline events, firmware versions.
  2. Date range: Last 7 days, Last 30 days, This month, Custom range (date pickers; max 12 months).
  3. Scope: Site (respects site access), Line, Machines (multi-select), Severity (multi-select, only for alert/downtime reports).
  4. Button "Generate report".
- Right panel "Preview": summary stat cards, one or two charts (Recharts; same style as dashboard, dashed threshold line where relevant), and a data table with pagination. Show the filters used, generated-at time and generated-by.
- Buttons above the preview: "Export CSV" (all rows, not only the current page) and "Print / Save as PDF" (opens a print-optimised view with the logo, title, filters, charts and table; use a print stylesheet with page breaks, no sidebar).
- Below: "Recent reports" list (last 20 generated by this user: type, range, generated at, row count, Re-open button). Re-open regenerates from saved parameters.

RULES
- Viewer: can generate and export reports for sites they can access. Admin sees all sites. Maintenance Engineer: their sites.
- Large ranges: query on the server with indexes and aggregate in SQL; never load everything in the browser.
- CSV: UTF-8 with BOM, ISO timestamps in the site's timezone (Asia/Karachi by default), header row, escaped values.
- Log report generation and export to the audit log.

API
- POST /api/reports/preview {type, from, to, siteIds, lines, machineIds, severities} returns {summary, charts, rows, page, total}
- GET /api/reports/export.csv?... (same params) streams CSV
- GET /api/reports/recent, POST /api/reports/recent (save params)

ACCEPTANCE: each of the 4 report types previews correctly against seed data; CSV opens in Excel with correct columns; print view fits A4 portrait; invalid ranges show clear errors; empty result shows "No data for this selection"; unit tests for mean-time-to-acknowledge/resolve calculations and for CSV escaping.
```

---

## PROMPT 4: Settings

```text
Build the "Settings" page (sidebar > Administration > Settings). Admin only (others get the 403 page). Match the design system from Prompt 0, reuse components and the existing form styles. Follow existing conventions.

PAGE LAYOUT: left vertical tab list, right content card. Each tab has its own "Save changes" button with an unsaved-changes warning if you navigate away. Every save is validated (Zod), applied immediately, and written to the audit log (who, what changed, old and new value).

TABS
1. General: Organisation name, Default timezone (default Asia/Karachi), Date/time format, Language (English only for now), Logo upload (PNG/SVG, max 1 MB, shown on the login page and print reports).
2. Sites and lines: table of Sites with their Lines. Add / rename / archive a site or line. Cannot archive a site that still has active machines (show which). Each site has an address note and timezone override.
3. Detection defaults: Default threshold method (Mean + k x std, or Percentile), k (default 3), percentile (default 99), Persistence windows before alert (default 9), Warning rule (score above X times threshold or rising for N windows), Heartbeat timeout seconds (default 120), Alert de-duplication window (minutes). Note text: "Per-node values on the Node page override these defaults." Changing defaults does not rewrite existing node values; show a count of nodes using defaults.
4. Notifications: matrix of severity (Warning, Anomaly, Offline) by channel (In-app, Push, Email) with toggles, Quiet hours (optional), Escalation: if an Anomaly stays Open for N minutes, notify the Admin. "Send test notification" button. Email goes to the mocked mailer (console + dev-mail folder) and shows a "Test email written to dev-mail/" toast.
5. Security: Password policy (min length, require number/symbol), Lockout (failed attempts before lock, default 5 and lock duration), Session timeout (minutes), One-time link expiry (default 24 h), "Force sign-out of all users" button (confirm).
6. MQTT and broker: read-only live status (connected, uptime, connected nodes, messages/min), Broker host/port (display), TLS on/off indicator, Topic prefix (acousticsense), QoS used (alerts 1, telemetry 0), "Test connection" button that actually connects and reports success/failure. Admin can change host/port with a confirm dialog; backend reconnects without restart.
7. Data retention: Telemetry retention days (default 90), Alert retention (default keep), "Purge now" for telemetry older than the retention (confirm with typed word "PURGE"), storage used (rows and approximate MB), Export all alerts as CSV backup.

STORAGE
- A single settings table (key, value JSON, updated_by, updated_at) with typed accessors on the server and defaults in code. The detection defaults and severity rule must be read from here by the ingestion pipeline, not hard-coded.

ACCEPTANCE: every tab saves and reloads correctly; invalid values show inline errors; changing the heartbeat timeout changes when nodes turn Offline (verify with the simulator); non-admins cannot reach the page or the API (server returns 403); audit log entries appear for each change; tests for settings validation and for the role guard.
```

---

## PROMPT 5: Authentication flows

```text
The Sign in page already exists (described in Prompt 0). Build the rest of the account flows around it. Match the same split-screen style (dark brand panel left, white form right) and reuse its components. Follow existing conventions. Never reveal whether an email exists.

PAGES
1. Forgot password (link on the Sign in page): email field, button "Send reset link". Always show the same message after submit: "If an account exists for that email, a reset link has been sent." Rate limit (5 requests per hour per IP and per email).
2. Reset password (/reset-password?token=...): new password + confirm, show/hide toggle, live strength meter and the policy rules from Settings (Security tab). Token is single-use, expires after the configured time (default 24 h), is stored hashed, and is invalidated after use or when a newer one is issued. Invalid/expired token shows a clear error with a "Request a new link" button. After success: all existing sessions of that user are revoked, redirect to Sign in with a success banner.
3. Set password for new users (/set-password?token=...): same screen as reset with welcome text "Welcome to Acoustic Sense, {name}". This is the link sent when an Admin creates a user (the Add user dialog says "A one-time password link is emailed; it expires in 24 hours"). Make that Add user dialog actually create the user and send this link.
4. Account locked: after the configured failed attempts show "Account locked, try again in {mm:ss}" on Sign in and keep the existing "N attempts left before lock" message before that. Admin can unlock a user from the Users page.

ACCOUNT MENU (avatar in the top bar): shows name, email, role chip; items: My profile, Change password, Sign out.
- My profile page: edit name, phone (optional), notification channel preference (Push / Email / Push + email), see site access (read only), last login time and a list of active sessions with "Sign out other sessions".
- Change password: current password, new password, confirm; strength meter; success toast; other sessions revoked.
- Sign out: clears session, returns to Sign in. "Remember me" on the Sign in page uses a longer-lived refresh token; otherwise session lasts until the browser closes or the session timeout from Settings.

SECURITY
- Hash passwords with argon2 or bcrypt. HttpOnly, Secure, SameSite cookies (or the existing token approach if the project already has one). CSRF protection if cookies are used. Generic error text on Sign in ("Invalid email or password"). Log sign-ins, failed attempts, lockouts, password changes and resets to the audit log.
- Email sending is mocked: write the email (subject, link) to the console and to dev-mail/*.eml; put the mailer behind an interface so a real SMTP provider can be plugged in later.

ACCEPTANCE: full flow works end to end locally (create user > open link from dev-mail > set password > sign in); expired and reused tokens are rejected; lockout and unlock work; account menu works for all three roles; tests for token expiry/reuse, rate limiting and password policy.
```

---

## PROMPT 6: Completions (Users actions, notifications panel, system states)

```text
Finish the remaining interactive pieces that the existing pages hint at but do not fully define. Match existing styles, reuse components, follow existing conventions.

1. USERS PAGE ACTIONS (table already has Edit and Reset links, and a Disabled status):
- Edit user (modal like Add user): name, role, site access, notify-via. Admin cannot remove their own Admin role or disable themselves; the last remaining Admin cannot be demoted or disabled.
- Reset (confirm dialog): sends a new one-time password link (same flow as Prompt 5), revokes the user's sessions.
- Disable / Enable: Disabled users cannot sign in and their sessions are revoked. Row shows grey "Disabled" pill.
- Unlock (shown only when locked).
- Table: search, filter by role and status, sort by name/last login, pagination; "Last login" column.
- All actions are written to the audit log. Add a read-only "Audit log" tab or page for Admins: time, user, action, target, details, with filters and CSV export.

2. NOTIFICATIONS PANEL (bell icon with red count badge):
- Click opens a dropdown (max 10 recent) with severity icon, title ("Pump P-101: Anomaly"), subtitle (score vs threshold), relative time and an unread dot. Click an item opens the alert in the Alert centre. Buttons: "Mark all as read", "View all alerts".
- The badge shows the number of unread notifications for this user. New alerts appear live (real-time channel) with a subtle toast and a brief badge animation. Respect the user's notification preference from their profile and the severity rules in Settings.
- Persist read state per user in the database.

3. SYSTEM STATES:
- 403 page ("You do not have access to this page") and 404 page, both inside the app shell with a "Back to dashboard" button.
- Broker status chip (bottom of sidebar): green "Broker connected . N nodes online"; amber "Reconnecting..."; red "Broker disconnected" with a top banner "Live updates paused. Showing last known data" and automatic reconnection with backoff. The UI must never crash when the real-time channel drops.
- Global error boundary with a friendly message and a "Reload" button; toast system for success/error feedback.
- Session expired: redirect to Sign in with the message "Your session expired. Please sign in again." and return to the page the user was on after login.

4. ALERT CENTRE GAPS: make "Assign to..." open a dropdown of users with access to that site (Maintenance Engineers and Admins), update the row and notify the assignee; "Mark as resolved" requires the Action taken field; ensure every action is logged with user and time, as the screen's footer text says.

ACCEPTANCE: the last-admin protection works; disabled user cannot sign in; notification badge matches unread count and updates live; unplugging the broker shows the banner, then recovers on its own; tests for the last-admin rule and the notification read/unread logic.
```

---

## PROMPT 7: Seed data and simulator

```text
Make the whole app demo-ready without hardware.

1. SEED DATA (npm run seed; idempotent and safe to re-run):
- Sites: "Wah Plant" (Line A, Line B) and "Taxila Pumping Station".
- 24 machines across types (Pump, Fan, Motor, Gearbox, Compressor, Conveyor), 24 nodes named AS-N-001 to AS-N-024, each with firmware (mostly v1.2.0, a few v1.1.x so the "Firmware outdated" KPI is non-zero), model label "AE-MFCC v3 . int8 . 58 KB", realistic thresholds (about 0.03 to 0.06), RSSI from -45 to -85, a few nodes with offline events pending.
- Make the dashboard show roughly: 19 healthy, 3 warning, 1 anomaly, 1 offline, matching the dashboard described in Prompt 0. Pump P-101 on Line A should be the anomaly (score about 0.071, threshold 0.045).
- 30 days of history: telemetry every 5 minutes, about 130 alerts (resolved/acknowledged/open), maintenance records with realistic actions ("Bearing lubricated", "Fan blade rebalanced", "Belt replaced"), parts and downtime minutes.
- Users: Admin "Hamza Ranjha", Engineer "Faaiz Khan", Engineer "Ayesha Tariq", Viewer "Usman Ali", a Disabled user "Bilal Ahmed". Demo password for all: printed in the README (clearly marked demo only).

2. SIMULATOR (python scripts/simulator.py): 
- Connects to Mosquitto and publishes, per node, telemetry every 10 s (heartbeat, fw, model, rssi, infer_ms, pending, seq) and alerts according to a scenario.
- Flags: --nodes N, --scenario normal|anomaly|offline|mixed, --speed (time compression), --drop-node AS-N-019 (stop publishing so it turns Offline), --offline-burst AS-N-007 (stop, buffer events, then publish them later with the original event_time so they appear as "Offline log sync" and out of order), --duplicates (re-send some messages to test de-duplication).
- Use the documented topics and JSON from docs/mqtt-contract.md. Score values follow a noisy baseline below the node threshold, with a ramp above it for anomaly scenarios.

3. README: how to start Mosquitto, database, backend, frontend, seed and simulator with copy-paste commands; the demo accounts; and a 5-minute demo script (what to click and what to say in the defense).

ACCEPTANCE: a fresh clone can go from zero to a populated dashboard with the README steps; each simulator scenario produces the expected UI change within a minute.
```

---

## PROMPT 8: QA pass (run before the demo)

```text
Do a full QA pass of the web app and fix what you find. Report a table of issues found/fixed.

1. Walk every page as each role (Admin, Maintenance Engineer, Viewer) and confirm menus, buttons and API access match the permission rules. Try calling restricted APIs directly as the wrong role (expect 403).
2. Compare every new page with the existing pages for consistency (spacing, colours, labels, status pills, button styles, table style). List differences and fix them.
3. Check every list page for loading, empty and error states; check keyboard navigation, focus rings, colour contrast of status pills, and that colour is never the only way to tell status apart (also show text).
4. Test real-time behaviour with the simulator: anomaly appears on Dashboard, Machines, Machine detail, Alert centre and the notification bell without refreshing; offline node turns Offline; offline-sync alerts are labelled correctly; duplicates are ignored; broker stop/start recovers.
5. Security review: password hashing, token expiry, rate limits, input validation on every endpoint, SQL injection and XSS checks, no secrets committed, CORS locked to the frontend origin, audit log complete.
6. Run lint, type-check and the full test suite; add missing tests for the severity rule, status derivation, RBAC guards and report calculations.
7. Performance: dashboard loads in under 2 s with the seeded 30 days of data; add indexes where queries are slow.
8. Update the README and docs/mqtt-contract.md so my teammate can match the firmware JSON exactly.
```

---

## Notes for your defense

- The login page says "< 1 s on-device detection". Your target model latency is about 38 ms per window, so this is plausible, but measure it on the real ESP32 before you claim it.
- The screens show an "AE-MFCC v3 . int8 . 58 KB" model label. Keep it consistent with your real model size once training is finished.
- Recalibration is a request flag in this version, not a live device command. If a teacher asks, say a later version would publish a configuration message to the node over MQTT.
- Email is mocked for the demo. Say that a real SMTP provider can be plugged in behind the mailer interface.
