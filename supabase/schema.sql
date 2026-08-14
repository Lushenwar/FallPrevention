-- LTC Fall Prevention — device ledger schema.
-- Run in the Supabase SQL editor (or `supabase db push`).

create extension if not exists pgcrypto;

create table if not exists devices (
  id            uuid primary key default gen_random_uuid(),
  device_name   text not null,
  serial_number text not null,
  category      text not null check (category in
                  ('bed_sensor','floor_mat','chair_alarm','grab_bar','hip_protector')),
  room_number   text not null,
  install_date  date not null,
  expiry_date   date not null,
  status        text not null default 'active' check (status in ('active','replaced','expired')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Hot path for the cron sweep and the dashboard.
create index if not exists devices_status_expiry_idx on devices (status, expiry_date);

-- A serial identifies a physical unit, so two devices *on the floor* may not share one.
-- Deliberately NOT a plain `unique` on the column: this ledger never deletes, so a global
-- constraint would make every serial single-use and leave a mis-clicked "Mark replaced"
-- permanently unregisterable — an untracked device, which is the failure this system exists
-- to prevent. Replaced rows keep their serial in history but release the live claim on it.
create unique index if not exists devices_serial_live_idx
  on devices (serial_number)
  where status <> 'replaced';

create table if not exists alert_logs (
  id        uuid primary key default gen_random_uuid(),
  device_id uuid not null references devices(id),
  sent_at   timestamptz not null default now()
);

create index if not exists alert_logs_device_sent_idx on alert_logs (device_id, sent_at desc);

-- Append-only ledger: a device may only leave 'active'. Enforced here rather than in
-- app code so a stray SQL console can't rewrite history either.
-- `set search_path = ''` pins resolution so a role-local search_path can't shadow the
-- names this guard relies on. It touches no tables, so an empty path costs nothing.
create or replace function devices_status_guard() returns trigger
  language plpgsql
  set search_path = ''
as $$
begin
  if old.status <> 'active' and new.status <> old.status then
    raise exception 'device % is % and cannot transition to %', old.id, old.status, new.status;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists devices_status_guard_trg on devices;
create trigger devices_status_guard_trg before update on devices
  for each row execute function devices_status_guard();

-- RLS. No delete policy exists, so deletes are refused for every non-service role:
-- that is the audit-immutability requirement, for free.
alter table devices    enable row level security;
alter table alert_logs enable row level security;

drop policy if exists devices_read   on devices;
drop policy if exists devices_insert on devices;
drop policy if exists devices_update on devices;
create policy devices_read   on devices for select using (true);
create policy devices_insert on devices for insert with check (true);
create policy devices_update on devices for update using (true) with check (true);

drop policy if exists alert_logs_read   on alert_logs;
drop policy if exists alert_logs_insert on alert_logs;
create policy alert_logs_read   on alert_logs for select using (true);
create policy alert_logs_insert on alert_logs for insert with check (true);

-- ponytail: policies are open to the anon key because auth is still facility-network
-- based (see CLAUDE.md "Deferred: Staff SSO"). Tighten to `auth.jwt()` claims once SSO lands.
