import { CATEGORIES, type Device } from "./devices.ts";

const HEADERS = ["Room", "Type", "Installed", "Expires"];

/**
 * Excel treats a leading `=`, `+`, `-` or `@` as a formula, so a room number typed as
 * `=HYPERLINK(...)` would execute when the file is opened on a nurse's workstation.
 * Prefixing with an apostrophe keeps the text visible and inert. This is the same
 * untrusted free-text boundary the email template escapes for — different sink, same rule.
 */
function cell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/**
 * ponytail: CSV, not a real .xlsx. Excel opens it natively with a double-click and it
 * costs no dependency; a genuine workbook would pull in exceljs to gain formatting
 * nobody asked for. Swap to exceljs here if they ever need multiple sheets or styling.
 */
export function toCsv(devices: Device[]): string {
  const rows = devices.map((d) =>
    [d.room_number, CATEGORIES[d.category].label, d.install_date, d.expiry_date]
      .map(cell)
      .join(","),
  );
  // CRLF and a BOM: Excel needs both to open UTF-8 cleanly on Windows.
  return `﻿${[HEADERS.join(","), ...rows].join("\r\n")}`;
}

export function csvFilename(today: string): string {
  return `fall-prevention-devices-${today}.csv`;
}
