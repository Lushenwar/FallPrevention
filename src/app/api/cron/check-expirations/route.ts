import { Resend } from "resend";
import {
  authorizeCron,
  dueForAlert,
  lapsed,
  summaryEmail,
  THROTTLE_DAYS,
  upcoming,
  urgent,
} from "@/lib/alerts";
import { addDays, NOTICE_DAYS, todayISO, type Device } from "@/lib/devices";
import { supabase } from "@/lib/supabaseClient";

const COLUMNS =
  "id, device_name, serial_number, category, room_number, install_date, expiry_date, status";

export async function GET(request: Request) {
  if (!authorizeCron(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const today = todayISO();
  const { data, error } = await supabase
    .from("devices")
    .select(COLUMNS)
    .eq("status", "active")
    .lte("expiry_date", addDays(today, NOTICE_DAYS))
    .order("expiry_date", { ascending: true });

  if (error) return Response.json({ success: false, message: error.message }, { status: 500 });
  const due = (data ?? []) as Device[];

  // Lapsed units move active -> expired. Never deleted: the ledger has to prove what was
  // installed on the day of an incident.
  const overdue = lapsed(due, today).map((d) => d.id);
  if (overdue.length) {
    await supabase.from("devices").update({ status: "expired" }).in("id", overdue).eq("status", "active");
  }

  const { data: recent } = await supabase
    .from("alert_logs")
    .select("device_id")
    .gte("sent_at", `${addDays(today, -THROTTLE_DAYS)}T00:00:00Z`);
  // Only the urgent tier is throttled and logged. The 8-14 day rows ride along for
  // planning; they are never enough on their own to send, and never logged, so they
  // still arrive as urgent in their own right a week later.
  const toAlert = dueForAlert(urgent(due, today), (recent ?? []).map((r) => r.device_id));
  const alsoComing = upcoming(due, today);

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

  const { error: sendError } = await new Resend(RESEND_API_KEY).emails.send({
    from: ALERT_FROM_EMAIL,
    to: ALERT_TO_EMAIL.split(",").map((s) => s.trim()),
    subject: `[Fall Prevention] ${toAlert.length} device(s) need replacement — ${today}`,
    html: summaryEmail(toAlert, alsoComing, today),
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
