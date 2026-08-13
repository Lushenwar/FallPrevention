import { timingSafeEqual } from "node:crypto";
import { Resend } from "resend";
import { addDays, CATEGORIES, daysUntil, todayISO, WARN_DAYS, type Device } from "@/lib/devices";
import { supabase } from "@/lib/supabaseClient";

const THROTTLE_DAYS = 7;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const got = Buffer.from(request.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

/**
 * Room number, category, serial, date. No resident names, no diagnoses — this table
 * crosses the public internet (HIPAA/PHIPA).
 */
function summaryEmail(devices: Device[], today: string) {
  const rows = devices
    .map((d) => {
      const days = daysUntil(d.expiry_date, today);
      const state = days < 0 ? `EXPIRED ${-days}d ago` : `${days}d left`;
      return `<tr>
        <td style="padding:8px;border:1px solid #cbd5e1;font-weight:700">${d.room_number}</td>
        <td style="padding:8px;border:1px solid #cbd5e1">${CATEGORIES[d.category].label}</td>
        <td style="padding:8px;border:1px solid #cbd5e1;font-family:monospace">${d.serial_number}</td>
        <td style="padding:8px;border:1px solid #cbd5e1">${d.expiry_date}</td>
        <td style="padding:8px;border:1px solid #cbd5e1;color:${days < 0 ? "#b91c1c" : "#b45309"};font-weight:700">${state}</td>
      </tr>`;
    })
    .join("");

  return `<div style="font-family:system-ui,sans-serif;color:#0f172a">
    <h2>Fall prevention devices needing attention — ${today}</h2>
    <p>${devices.length} device(s) expired or expiring within ${WARN_DAYS} days.</p>
    <table style="border-collapse:collapse;font-size:14px">
      <thead><tr style="background:#e2e8f0">
        <th style="padding:8px;border:1px solid #cbd5e1;text-align:left">Room</th>
        <th style="padding:8px;border:1px solid #cbd5e1;text-align:left">Device</th>
        <th style="padding:8px;border:1px solid #cbd5e1;text-align:left">Serial</th>
        <th style="padding:8px;border:1px solid #cbd5e1;text-align:left">Expires</th>
        <th style="padding:8px;border:1px solid #cbd5e1;text-align:left">Status</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p>Replace the unit, then log it in the dashboard.</p>
  </div>`;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const today = todayISO();
  const { data: due, error } = await supabase
    .from("devices")
    .select("id, device_name, serial_number, category, room_number, install_date, expiry_date, status")
    .eq("status", "active")
    .lte("expiry_date", addDays(today, WARN_DAYS))
    .order("expiry_date", { ascending: true });

  if (error) return Response.json({ success: false, message: error.message }, { status: 500 });

  // Lapsed units move active -> expired. Never deleted: the ledger has to prove what was
  // installed on the day of an incident.
  const lapsed = (due ?? []).filter((d) => daysUntil(d.expiry_date, today) < 0).map((d) => d.id);
  if (lapsed.length) {
    await supabase.from("devices").update({ status: "expired" }).in("id", lapsed).eq("status", "active");
  }

  // 7-day throttle: one nudge per device per week, so the alert stays worth reading.
  const { data: recent } = await supabase
    .from("alert_logs")
    .select("device_id")
    .gte("sent_at", `${addDays(today, -THROTTLE_DAYS)}T00:00:00Z`);
  const muted = new Set((recent ?? []).map((r) => r.device_id));
  const toAlert = (due ?? []).filter((d) => !muted.has(d.id));

  if (toAlert.length === 0) {
    return Response.json({ success: true, alertedCount: 0, message: "Nothing due to alert on." });
  }

  const { RESEND_API_KEY, ALERT_FROM_EMAIL, ALERT_TO_EMAIL } = process.env;
  if (!RESEND_API_KEY || !ALERT_FROM_EMAIL || !ALERT_TO_EMAIL) {
    return Response.json(
      { success: false, message: "Resend is not configured (RESEND_API_KEY/ALERT_FROM_EMAIL/ALERT_TO_EMAIL)." },
      { status: 500 },
    );
  }

  // One aggregated email, never one per device.
  const { error: sendError } = await new Resend(RESEND_API_KEY).emails.send({
    from: ALERT_FROM_EMAIL,
    to: ALERT_TO_EMAIL.split(",").map((s) => s.trim()),
    subject: `[Fall Prevention] ${toAlert.length} device(s) need replacement — ${today}`,
    html: summaryEmail(toAlert, today),
  });

  if (sendError) {
    // Logging nothing here is deliberate: an unlogged device is re-alerted tomorrow.
    return Response.json({ success: false, message: sendError.message }, { status: 502 });
  }

  await supabase.from("alert_logs").insert(toAlert.map((d) => ({ device_id: d.id })));

  return Response.json({
    success: true,
    alertedCount: toAlert.length,
    message: "Alerts dispatched to team lead.",
  });
}
