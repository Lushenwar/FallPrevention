# Fall Prevention Device Ledger

Tracks the expiry dates of LTC fall prevention equipment (bed sensor pads, floor mats, chair
alarms, grab bars, hip protectors) and emails the team lead one aggregated summary before
anything lapses. Devices are never deleted — they transition `active → replaced | expired` so
the table stands up as an audit record after an incident.

## Setup

```bash
npm install
cp .env.example .env.local     # fill in Supabase, Resend, CRON_SECRET
npm run dev                    # http://localhost:3000
```

Run `supabase/schema.sql` in the Supabase SQL editor once. It creates both tables, the
`active → replaced | expired` trigger, and RLS policies that deliberately grant no `delete`.

## Testing

Three layers, cheapest first.

**1. Unit — no database, runs in under a second.** `node --test` over the pure logic: date
math, the traffic light, Zod boundaries, cron auth, the 7-day throttle, and the email
template (aggregation, escaping, and that no PHI can reach the payload).

```bash
npm test
npm run typecheck && npm run lint && npm run build   # the other three checks
```

**2. Smoke — needs a live Supabase and a running server.** Covers what unit tests cannot:
unique serials, the shift-change race, and cron auth against the real routes.

```bash
npm run dev      # terminal 1
npm run smoke    # terminal 2
```

It registers a device, re-posts the same serial (expects 409), moves its room, fires two
simultaneous "mark replaced" requests and asserts exactly one 200 and one 409, then checks the
cron route refuses an unauthenticated call. The authorized cron run is skipped by default
because it emails the team lead for real — opt in with `SMOKE_SEND_EMAIL=1`. The test device is
left behind as `replaced`; the ledger has no delete.

**3. By hand, at `localhost:3000`.** The parts a script can't judge:

- Pick a category → the expiry date moves by that shelf life (bed sensor = install + 90 days), and stays editable.
- Register a device dated within 30 days → amber `EXPIRING` pill; date in the past → red `EXPIRED`. Icon and word change too, not just colour.
- Search by room, serial, or device name; filter by category; page through at 10 rows.
- Stop the dev server, then submit the form → a red modal you must acknowledge, not a silent failure. (Same for DevTools → Network → Offline.)
- Open two browser tabs, mark the same device replaced in both → the second one raises the modal instead of double-logging.
- Zoom the browser to 150% and check nothing clips — that is roughly a med cart monitor.

## Cron

`vercel.json` runs `/api/cron/check-expirations` at `0 12 * * *` UTC — 08:00 Eastern during
daylight time, 07:00 in winter. Vercel Cron sends `Authorization: Bearer $CRON_SECRET`
automatically once `CRON_SECRET` is set in the project's env vars; without a matching header
the route returns 401.

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/check-expirations
```

Each run flips lapsed devices to `expired`, skips anything alerted in the last 7 days, and
sends a single email listing room / category / serial / expiry. Never resident names.

Verify DKIM + SPF on the Resend sending domain before relying on it — healthcare spam filters
quarantine unauthenticated mail silently.

## API

| Method | Route | Notes |
| --- | --- | --- |
| `GET` | `/api/devices` | Active + expired inventory, soonest expiry first |
| `POST` | `/api/devices` | Register a unit; 409 on duplicate serial |
| `PATCH` | `/api/devices` | Room move or `replaced`/`expired`; 409 if another nurse already changed it |
| `GET` | `/api/cron/check-expirations` | Bearer-authed alert sweep |
