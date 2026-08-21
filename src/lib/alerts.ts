import { timingSafeEqual } from "node:crypto";
import {
  CATEGORIES,
  daysUntil,
  NOTICE_DAYS,
  URGENT_DAYS,
  type Device,
} from "./devices.ts";

export const THROTTLE_DAYS = 7;

/** Constant-time bearer check. Returns false when CRON_SECRET is unset — fail closed. */
export function authorizeCron(header: string | null, secret: string | undefined): boolean {
  if (!secret) return false;
  const got = Buffer.from(header ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Active devices whose date has already passed: they move active -> expired. */
export function lapsed(devices: Device[], today: string): Device[] {
  return devices.filter((d) => d.status === "active" && daysUntil(d.expiry_date, today) < 0);
}

/** Tier 1: already expired, or expiring within a week. These fire the email. */
export function urgent(devices: Device[], today: string): Device[] {
  return devices.filter((d) => daysUntil(d.expiry_date, today) <= URGENT_DAYS);
}

/** Tier 2: 8-14 days out. Listed for planning, never enough on its own to send. */
export function upcoming(devices: Device[], today: string): Device[] {
  return devices.filter((d) => {
    const days = daysUntil(d.expiry_date, today);
    return days > URGENT_DAYS && days <= NOTICE_DAYS;
  });
}

/** The 7-day throttle: anything alerted on within the cooldown stays out of today's email. */
export function dueForAlert(devices: Device[], alertedRecently: Iterable<string>): Device[] {
  const muted = new Set(alertedRecently);
  return devices.filter((d) => !muted.has(d.id));
}

/** Serial numbers and room numbers are free text typed by staff — never interpolate raw. */
function esc(value: string): string {
  return value.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!,
  );
}

const CELL = "padding:8px;border:1px solid #cbd5e1";

/**
 * Fields are pulled out by name rather than spread, so a future column on `devices`
 * cannot leak resident data onto the public internet (HIPAA/PHIPA).
 */
function table(devices: Device[], today: string): string {
  const rows = devices
    .map((d) => {
      const days = daysUntil(d.expiry_date, today);
      const state = days < 0 ? `EXPIRED ${-days}d ago` : `${days}d left`;
      return `<tr>
        <td style="${CELL};font-weight:700">${esc(d.room_number)}</td>
        <td style="${CELL}">${CATEGORIES[d.category].label}</td>
        <td style="${CELL};font-family:monospace">${d.serial_number ? esc(d.serial_number) : "&mdash;"}</td>
        <td style="${CELL}">${esc(d.expiry_date)}</td>
        <td style="${CELL};color:${days < 0 ? "#b91c1c" : "#b45309"};font-weight:700">${state}</td>
      </tr>`;
    })
    .join("");

  return `<table style="border-collapse:collapse;font-size:14px">
      <thead><tr style="background:#e2e8f0">
        <th style="${CELL};text-align:left">Room</th>
        <th style="${CELL};text-align:left">Device</th>
        <th style="${CELL};text-align:left">Serial</th>
        <th style="${CELL};text-align:left">Expires</th>
        <th style="${CELL};text-align:left">Status</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

/**
 * One email, N rows — never one email per device.
 *
 * Two sections: what needs replacing now, then what is coming so the order can be placed
 * in one trip. Only the first section is throttle-logged by the caller.
 */
export function summaryEmail(
  urgentDevices: Device[],
  upcomingDevices: Device[],
  today: string,
): string {
  const later = upcomingDevices.length
    ? `<h3 style="margin-top:24px">Also within ${NOTICE_DAYS} days</h3>
    <p>${upcomingDevices.length} device(s) — no action needed yet, listed so replacements can be ordered together.</p>
    ${table(upcomingDevices, today)}`
    : "";

  return `<div style="font-family:system-ui,sans-serif;color:#0f172a">
    <h2>Fall prevention devices needing attention — ${today}</h2>
    <p>${urgentDevices.length} device(s) expired or expiring within ${URGENT_DAYS} days.</p>
    ${table(urgentDevices, today)}
    <p>Replace the unit, then log it in the dashboard.</p>
    ${later}
  </div>`;
}
