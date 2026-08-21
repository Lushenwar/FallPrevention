import { z } from "zod";

/** Shelf life per category, in days. Tune these — vendors change spec sheets. */
export const CATEGORIES = {
  bed_sensor: { label: "Bed Sensor Pad", shelfLifeDays: 90 },
  floor_mat: { label: "Floor Pressure Mat", shelfLifeDays: 365 },
  chair_alarm: { label: "Chair Alarm", shelfLifeDays: 180 },
  grab_bar: { label: "Grab Bar", shelfLifeDays: 730 },
  hip_protector: { label: "Hip Protector", shelfLifeDays: 180 },
} as const;

export type Category = keyof typeof CATEGORIES;
export type Status = "active" | "replaced" | "expired";

export type Device = {
  id: string;
  device_name: string;
  serial_number: string;
  category: Category;
  room_number: string;
  install_date: string;
  expiry_date: string;
  status: Status;
};

/** Days inside which an active device counts as "expiring soon" on the dashboard. */
export const WARN_DAYS = 30;

/** Alerting tiers. URGENT is what fires an email and gets throttle-logged; NOTICE rides
 *  along in that email as planning context and is never logged, so a device muted at 14
 *  days would not go quiet at 7 — the tier that matters is the one that is tracked. */
export const URGENT_DAYS = 7;
export const NOTICE_DAYS = 14;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const NewDevice = z.object({
  device_name: z.string().trim().min(1).max(120),
  serial_number: z.string().trim().min(1).max(64),
  category: z.enum(Object.keys(CATEGORIES) as [Category, ...Category[]]),
  room_number: z.string().trim().min(1).max(20),
  install_date: isoDate,
  expiry_date: isoDate,
});

/** Room shuffles and replacements: the UUID is the identity, everything else moves. */
export const DeviceUpdate = z
  .object({
    id: z.string().uuid(),
    room_number: z.string().trim().min(1).max(20).optional(),
    status: z.enum(["replaced", "expired"]).optional(),
  })
  .refine((v) => v.room_number !== undefined || v.status !== undefined, {
    message: "nothing to update",
  });

// ponytail: dates are plain `date` columns, so all math is UTC-midnight arithmetic.
// The 08:00 cron and the facility are both far from a UTC day boundary, so no TZ shim.
export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysUntil(expiry: string, today: string): number {
  return Math.round(
    (Date.parse(`${expiry}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000,
  );
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Expiry date implied by installing this category today. */
export function expiryFor(category: Category, installDate: string): string {
  return addDays(installDate, CATEGORIES[category].shelfLifeDays);
}

/** Traffic light. `expired` also covers a lapsed date on a still-`active` row. */
export function health(device: Pick<Device, "expiry_date" | "status">, today: string) {
  if (device.status === "replaced") return "replaced" as const;
  const days = daysUntil(device.expiry_date, today);
  if (device.status === "expired" || days < 0) return "expired" as const;
  return days <= WARN_DAYS ? ("soon" as const) : ("ok" as const);
}
