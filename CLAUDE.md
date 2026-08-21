@AGENTS.md

# CLAUDE.md — LTC Fall Prevention Tracking Dashboard (`/dashboard`)

## WORKFLOW: BRANCH + PR ONLY

No direct commits to `main`. Every change goes: `git checkout -b <branch>` → commit → `gh pr create`. A pre-commit hook (`.git/hooks/pre-commit`) enforces this locally by rejecting commits made while on `main`.

## CURRENT STATUS

╔══════════════════════════════════════════════════════════╗
║  DASHBOARD BUILD PROGRESS                       4/4 DONE ║
║  ██████████████████████████ CODE COMPLETE                ║
║  Phase 0: Next.js Setup & Supabase Data Layer   [x]      ║
║  Phase 1: API & State Architecture              [x]      ║
║  Phase 2: Clinical Dashboard UI                 [x]      ║
║  Phase 3: Event-Driven Alerting Engine          [x]      ║
╚══════════════════════════════════════════════════════════╝

Phase: Live against Supabase, verified end-to-end locally. Not yet deployed.
Status: Supabase project `igymnbvuxndibsenjikb` (org `FallPrevention`, us-east-1) is live and
`supabase/schema.sql` is applied. Verified against it: GET/POST `/api/devices` round-trip, cron
401s without the bearer token, a real Resend alert delivered, the 7-day throttle suppressing the
immediate re-run, a failed send *not* writing an `alert_logs` row, and the status guard blocking
`replaced → expired`. Supabase security advisors are clean. Local `.env.local` is fully
populated; the tables are empty.

Remaining before clinical use:
1. **Run the migration.** `supabase/schema.sql` has a MIGRATION block at the bottom
   (2026-08-21): serial becomes nullable, categories narrow to three. It has **not** been
   applied — there is no Supabase access token on this machine. Paste it into the SQL editor.
   Until it runs, registering a device with a blank serial fails on the NOT NULL constraint.
2. **Resend domain.** `ALERT_FROM_EMAIL` is Resend's shared `onboarding@resend.dev` sender,
   which only delivers to the Resend account owner (`fallpreventionst@gmail.com`). Any other
   recipient stays undeliverable until a domain is verified with DKIM/SPF at resend.com/domains.
   Accepted for now.
3. **Rotate the pasted secrets.** The Supabase PAT and both Resend keys were pasted into
   chat. `.env.local` holds the good Resend key and Vercel was re-synced from it on
   2026-08-21, but the old key is still live on that other account until revoked.

Done 2026-08-21: all six Vercel env vars are set for Production and Preview.
`RESEND_API_KEY` and `CRON_SECRET` were rewritten from `.env.local`. Note that Vercel marks
both **Sensitive**, so `vercel env pull` returns the literal `[SENSITIVE]` rather than the
value — they cannot be diffed against local, only overwritten.

Update this as you finish each step.

### Beyond the source map

| File | Role |
| --- | --- |
| `supabase/schema.sql` | DDL, status-transition trigger, RLS (no delete policy = append-only) |
| `src/lib/devices.ts` | Categories, shelf lives, date math, Zod schemas, traffic-light logic |
| `src/lib/export.ts` | CSV export (Room, Type, Installed, Expires) — no dependency, Excel-safe |
| `src/lib/devices.test.ts` | `node --test` cover for the date/status logic |
| `src/components/Dashboard.tsx` | Client state shell: counts, failure modal, replace flow |
| `src/app/error.tsx` | Loud failure page — never a blank screen on a med cart |
| `vercel.json` | Daily cron at 12:00 UTC (08:00 Eastern, daylight time) |

**Dashboard checks:** `npm test && npm run typecheck && npm run lint && npm run build`

### Dashboard source map

| File | Role |
| --- | --- |
| `src/app/layout.tsx` | App shell, navigation, and clinical theme provider |
| `src/app/page.tsx` | Main control room dashboard (inventory & registration) |
| `src/components/DeviceForm.tsx` | Registration form with auto-calculating expiry dates |
| `src/components/InventoryTable.tsx` | Data table with status pills and category filters |
| `src/app/api/devices/route.ts` | GET/POST handler for device inventory |
| `src/app/api/cron/check-expirations/route.ts` | Vercel Cron target for dispatching Resend emails |
| `src/lib/supabaseClient.ts` | Typed database connection instance |

### Device categories

Three, all on a one-year shelf life: `bed_sensor`, `chair_alarm`, `floor_mat`. Grab bars and
hip protectors were withdrawn 2026-08-21 and removed from both `CATEGORIES` and the DB check
constraint. The migration **errors** rather than deleting if a withdrawn row still exists —
the ledger is append-only, so re-categorise by hand instead.

**Serial numbers are optional.** Labels rub off, and refusing the registration would leave the
device untracked, which is the failure this system exists to prevent. A blank serial is stored
`NULL`, never `""`: the live-unique index ignores NULLs, so unlabelled units coexist, whereas a
second `""` would collide and block the save.

### Deferred

* **Barcode/QR Scanning:** Staff currently type serial numbers manually. Future iterations should allow tablet camera integration to scan hardware barcodes directly into the `serial_number` field.
* **HL7 / ADT Integration:** Resident room changes are currently updated manually. True synchronization requires tying into the facility's EHR (PointClickCare, MatrixCare) ADT (Admission, Discharge, Transfer) feed.
* **Staff SSO / Active Directory:** Authentication is currently assumed via facility network IP or basic shared credentials. True HIPAA/PHIPA compliance will require Azure AD or Okta integration.
* **Soft Deletes UI:** The DB supports a `replaced` status, but the UI currently only shows `active` inventory. A historical audit log view needs to be built.

## WHAT THIS FILE IS

This document is the authoritative guide for developing the TypeScript/Next.js dashboard for the LTC Fall Prevention Tracking System. Your job is to build a high-performance clinical control plane that communicates with a PostgreSQL database and dispatches automated alerts via Resend to ensure zero safety devices lapse into expiration.

---

## TECH STACK & REQUIREMENTS

* **Framework:** Next.js (App Router, Server & Client Components)
* **Language:** TypeScript (Strict mode enabled)
* **Styling:** Tailwind CSS (High contrast for older clinical monitors)
* **Database:** Supabase (PostgreSQL) with `pgcrypto` for UUIDs
* **Email Provider:** Resend
* **Icons / Components:** Lucide React

---

## SYSTEM API SPECIFICATION (The Backend You Are Interfacing With)

The application exposes the following internal endpoints for the dashboard and automated runners to consume:

1. **`GET /api/devices`**
* *Returns JSON:*
```json
{
  "data": [
    {
      "id": "a1b2c3d4-...",
      "device_name": "Bed Sensor Pad",
      "serial_number": "SN-98234-X",
      "category": "bed_sensor",
      "room_number": "204-B",
      "install_date": "2026-08-01",
      "expiry_date": "2026-10-30",
      "status": "active"
    }
  ]
}

```




2. **`POST /api/devices`**
* *Accepts JSON body to register a new unit:*
```json
{
  "device_name": "Floor Pressure Mat",
  "serial_number": "FM-00123",
  "category": "floor_mat",
  "room_number": "101-A",
  "install_date": "2026-08-13",
  "expiry_date": "2027-08-13"
}

```




3. **`GET /api/cron/check-expirations`**
* *Triggered by Vercel Cron. Returns JSON summary of actions taken:*
```json
{
  "success": true,
  "alertedCount": 3,
  "message": "Alerts dispatched to team lead."
}

```





### Trust boundary

`/api/cron/check-expirations` touches production communication channels. Therefore:

* It MUST require an `Authorization: Bearer <CRON_SECRET>` header. Public access is forbidden.
* Status state machine: Devices must strictly move from `active` → `replaced` or `expired`.
* E-PHI (Protected Health Information) restriction: Email payloads must NEVER contain full resident names or diagnoses, only `room_number` and `device_category` to comply with HIPAA/PHIPA.

---

## DASHBOARD UI ARCHITECTURE

```text
dashboard/
├── src/
│   ├── app/
│   │   ├── layout.tsx                 # Root layout with clinical UI wrapper
│   │   ├── page.tsx                   # Main inventory dashboard
│   │   └── api/
│   │       ├── devices/
│   │       │   └── route.ts           # CRUD for devices
│   │       └── cron/
│   │           └── check-expirations/
│   │               └── route.ts       # Alerting job
│   ├── components/
│   │   ├── DeviceForm.tsx             # New device registration sidebar
│   │   └── InventoryTable.tsx         # Filterable, sortable asset ledger
│   └── lib/
│       └── supabaseClient.ts          # Postgres client wrapper
├── package.json
└── tsconfig.json

```

---

## IMPLEMENTATION PHASES

### PHASE 0: NEXT.JS SETUP & SUPABASE DATA LAYER

**Exit Criterion:** Next.js project is initialized with Tailwind, Supabase project is active, tables are migrated, and RLS policies are enforced.

* **Specific Parts:** Execute the DDL for `devices` and `alert_logs`.
* **Things to Watch Out For:** The Room Shuffle. Residents change rooms frequently. Never use `room_number` as a Primary Key; always rely on the generated UUID `id`. Always use `TIMESTAMP WITH TIME ZONE` to handle 24/7 nursing shift schedules seamlessly.

### PHASE 1: API & STATE ARCHITECTURE

**Exit Criterion:** `/api/devices` successfully handles GET and POST requests, parsing payloads securely with Zod validation.

* **Specific Parts:** Ensure Idempotency. When updating a device from `active` to `replaced`, it must execute atomically.
* **Things to Watch Out For:** Shift-change concurrency. Between 2:30 PM and 3:30 PM, multiple nurses might log data. Implement optimistic concurrency (ensure the device is still `active` before marking it `replaced`) to prevent race conditions. Silent failures are fatal in clinical environments—ensure API errors trigger high-visibility toast notifications.

### PHASE 2: CLINICAL DASHBOARD UI

**Exit Criterion:** The dashboard renders the `DeviceForm` and `InventoryTable`. Searching, filtering, and submitting new devices works without full page reloads.

* **Specific Parts:** Traffic Light UX. Use `emerald-100` (safe), `amber-100` (≤30 days), and `red-100` (expired) status pills. Build auto-calculating date logic so selecting "Bed Sensor Pad" automatically pushes the `expiry_date` out by 90 days from the `install_date`.
* **Things to Watch Out For:** Med cart hardware. LTC environments often have low-res, high-glare monitors. Do not use subtle gray text. Ensure high contrast (e.g., `text-slate-900`) and large tap targets. Avoid infinite scrolling; use pagination to ensure accurate clinical counts.

### PHASE 3: EVENT-DRIVEN ALERTING ENGINE

**Exit Criterion:** A scheduled cron job reliably checks the database at 08:00 AM daily, aggregates expiring devices, and sends a single summary email via Resend without spamming duplicates.

* **Alert tiers:** The email fires on the urgent tier only — expired, or expiring within `URGENT_DAYS` (7). Devices 8-14 days out (`NOTICE_DAYS`) are appended as a second "Also within 14 days" table so replacements can be ordered in one trip, but they never trigger a send and are never written to `alert_logs` — logging them would mute the alert that matters a week later. The dashboard traffic light keeps its own 30-day amber (`WARN_DAYS`).
* **Specific Parts:** The 7-Day Throttle. The system must query `alert_logs` to ensure that if a device triggered an email on Monday, it does not trigger another email until the following Monday.
* **Things to Watch Out For:** Aggregation. Never send 12 emails for 12 expiring devices; send 1 email with a 12-row HTML table. Ensure the Resend sending domain has verified DKIM/SPF, or strict healthcare IT spam filters will quarantine the alerts.

---

## RUNNING BOTH HALVES

```bash
# Terminal 1 — Database / Local Env (Optional, if using Supabase CLI)
supabase start

# Terminal 2 — The Dashboard
npm install
npm run dev     # http://localhost:3000

# To manually test the Cron Job locally:
curl -H "Authorization: Bearer YOUR_CRON_SECRET" http://localhost:3000/api/cron/check-expirations

```

Ensure `.env.local` is populated with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `RESEND_API_KEY`, and `CRON_SECRET` before starting.


## 🚨 CRITICAL RISKS & WHAT TO WATCH OUT FOR

### 1. Environmental & Hardware Constraints (The "Med Cart" Reality)

* **Network Dead Zones:** Nursing homes are often older buildings with thick concrete walls, leading to spotty Wi-Fi in certain wings. If staff submit a replacement form while moving a med cart down a hallway, the connection might drop.
* *Mitigation:* The UI must handle network timeouts gracefully. If a POST request fails, do not silently swallow the error. Throw a highly visible modal requiring the user to acknowledge the failure and try again.


* **Low-Fidelity Displays:** Clinical hardware is rarely cutting-edge. Dashboards will be viewed on low-resolution monitors with terrible glare and washed-out colors.
* *Mitigation:* Avoid subtle UI trends (like light gray text on white backgrounds). Rely on heavy contrast, bold typography, and distinct iconography alongside colors (e.g., pairing a triangle warning icon with the color red) so colorblind users can still read statuses.



### 2. State & Concurrency (The "Shift Change" Problem)

* **Simultaneous Writes:** Between 2:30 PM and 3:30 PM, the day shift and evening shift overlap. Two nurses might notice the same expiring sensor pad and attempt to log a replacement in the system simultaneously.
* *Mitigation:* Implement optimistic concurrency checks at the database level. When the API attempts to update a device status to `replaced`, the query must assert `WHERE id = X AND status = 'active'`. If the row was already updated by someone else seconds prior, the database rejects the transaction, preventing duplicate inventory logging.


* **The Room Shuffle:** Residents are frequently moved between rooms for operational or medical reasons.
* *Mitigation:* Never tie a device's primary lifecycle strictly to a room number. The UUID is the source of truth. If a pad moves with a resident, the system must allow a simple `room_number` update without resetting the `install_date` or `expiry_date`.



### 3. Compliance & Security (HIPAA / PHIPA)

* **E-PHI in Transit:** Email is inherently insecure. The cron job that dispatches Resend alerts is crossing a public network.
* *Mitigation:* The alerting payload must absolutely never contain Resident Names, Health Card Numbers, or Diagnoses. Limit the payload strictly to structural identifiers: `Room Number`, `Device Category`, and `Serial Number`.


* **Audit Immutability:** In the event of a critical fall, the Ministry of Health or internal compliance teams will audit the system.
* *Mitigation:* Never use hard `DELETE` commands. Devices must only transition states (to `replaced` or `expired`). Your database must act as an append-only ledger for historical records to prove that a device was active on the specific date of an incident.



### 4. Infrastructure & Deliverability

* **Strict Corporate Firewalls:** Healthcare IT networks employ highly aggressive spam filters to prevent phishing.
* *Mitigation:* If you do not configure and verify your Resend domain with proper DKIM and SPF records, the facility's email server will silently quarantine the expiration alerts.


* **Alert Fatigue:** Clinical staff are bombarded with alarms all day. If the system sends an individual email for every single expiring floor mat, the emails will be ignored.
* *Mitigation:* Stick strictly to the daily aggregation pattern. One summary email at 08:00 AM containing a table of all expiring devices. Use the `alert_logs` table to throttle reminders to a 7-day cooldown per device.
