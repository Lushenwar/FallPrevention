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

## Checks

```bash
npm test && npm run typecheck && npm run lint && npm run build
```

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
