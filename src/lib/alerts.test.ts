import assert from "node:assert/strict";
import test from "node:test";
import { authorizeCron, dueForAlert, lapsed, summaryEmail, upcoming, urgent } from "./alerts.ts";
import type { Device } from "./devices.ts";

const TODAY = "2026-08-13";

function device(overrides: Partial<Device> = {}): Device {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    device_name: "Bed Sensor Pad",
    serial_number: "SN-98234-X",
    category: "bed_sensor",
    room_number: "204-B",
    install_date: "2026-05-01",
    expiry_date: "2026-08-20",
    status: "active",
    ...overrides,
  };
}

test("cron rejects everything but the exact bearer token", () => {
  assert.equal(authorizeCron("Bearer s3cret", "s3cret"), true);
  assert.equal(authorizeCron("Bearer wrong!", "s3cret"), false);
  assert.equal(authorizeCron("Bearer s3cret-plus-extra", "s3cret"), false);
  assert.equal(authorizeCron("s3cret", "s3cret"), false, "raw token without the scheme");
  assert.equal(authorizeCron(null, "s3cret"), false, "no header at all");
  assert.equal(authorizeCron("", "s3cret"), false);
});

test("cron fails closed when CRON_SECRET is unset", () => {
  // Otherwise a missing env var would turn the alert endpoint public.
  assert.equal(authorizeCron("Bearer ", undefined), false);
  assert.equal(authorizeCron(null, undefined), false);
  assert.equal(authorizeCron("Bearer anything", ""), false);
});

test("lapsed picks only active devices past their date", () => {
  const past = device({ id: "past", expiry_date: "2026-08-12" });
  const todayIsFine = device({ id: "today", expiry_date: TODAY });
  const future = device({ id: "future", expiry_date: "2026-09-01" });
  const alreadyExpired = device({ id: "done", expiry_date: "2026-01-01", status: "expired" });

  assert.deepEqual(
    lapsed([past, todayIsFine, future, alreadyExpired], TODAY).map((d) => d.id),
    ["past"],
  );
});

test("7-day throttle mutes devices already alerted on", () => {
  const a = device({ id: "a" });
  const b = device({ id: "b" });
  const c = device({ id: "c" });

  assert.deepEqual(dueForAlert([a, b, c], ["b"]).map((d) => d.id), ["a", "c"]);
  assert.deepEqual(dueForAlert([a, b, c], []).map((d) => d.id), ["a", "b", "c"]);
  assert.deepEqual(dueForAlert([a, b, c], ["a", "b", "c"]), [], "a fully muted run sends nothing");
});

test("one email aggregates every device into one table", () => {
  const html = summaryEmail(
    [device({ id: "1", room_number: "101-A" }), device({ id: "2", room_number: "202-C" })],
    [],
    TODAY,
  );
  assert.equal(html.match(/<table/g)?.length, 1);
  assert.equal(html.match(/<tr>/g)?.length, 2, "one row per device, one email");
  assert.match(html, /101-A/);
  assert.match(html, /202-C/);
  assert.match(html, /2 device\(s\)/);
});

test("email shows days remaining and days overdue", () => {
  assert.match(summaryEmail([device({ expiry_date: "2026-08-20" })], [], TODAY), /7d left/);
  assert.match(summaryEmail([device({ expiry_date: "2026-08-01" })], [], TODAY), /EXPIRED 12d ago/);
});

test("email carries no PHI even if the row grows new columns", () => {
  // A future ADT/EHR sync could add resident columns; the template must ignore them.
  const withPhi = {
    ...device(),
    resident_name: "Jane Doe",
    diagnosis: "post-stroke gait instability",
    health_card: "1234-567-890",
  } as Device;

  const html = summaryEmail([withPhi], [], TODAY);
  assert.doesNotMatch(html, /Jane Doe/);
  assert.doesNotMatch(html, /gait instability/);
  assert.doesNotMatch(html, /1234-567-890/);
  // The four structural identifiers are still there.
  assert.match(html, /204-B/);
  assert.match(html, /Bed Sensor Pad/);
  assert.match(html, /SN-98234-X/);
  assert.match(html, /2026-08-20/);
});

test("staff-typed text is escaped, not injected into the email", () => {
  const html = summaryEmail(
    [device({ serial_number: "<script>alert(1)</script>", room_number: 'A&B "wing"' })],
    [],
    TODAY,
  );
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /A&amp;B &quot;wing&quot;/);
});

test("the week-out tier fires; the two-week tier only rides along", () => {
  const overdue = device({ id: "overdue", expiry_date: "2026-08-01" });
  const inAWeek = device({ id: "week", expiry_date: "2026-08-20" }); // exactly 7d
  const day8 = device({ id: "day8", expiry_date: "2026-08-21" });
  const day14 = device({ id: "day14", expiry_date: "2026-08-27" });
  const day15 = device({ id: "day15", expiry_date: "2026-08-28" });
  const all = [overdue, inAWeek, day8, day14, day15];

  assert.deepEqual(urgent(all, TODAY).map((d) => d.id), ["overdue", "week"]);
  assert.deepEqual(upcoming(all, TODAY).map((d) => d.id), ["day8", "day14"]);
  // Day 15 is past the notice window and belongs to neither tier.
  assert.equal([...urgent(all, TODAY), ...upcoming(all, TODAY)].some((d) => d.id === "day15"), false);
});

test("the two-week tier is a second section, and vanishes when empty", () => {
  const withLater = summaryEmail([device({ id: "a", room_number: "101-A" })], [device({ id: "b", room_number: "999-Z", expiry_date: "2026-08-25" })], TODAY);
  assert.equal(withLater.match(/<table/g)?.length, 2, "one table per tier");
  assert.match(withLater, /Also within 14 days/);
  assert.match(withLater, /999-Z/);
  assert.match(withLater, /1 device\(s\) expired or expiring within 7 days/);

  const urgentOnly = summaryEmail([device({ id: "a" })], [], TODAY);
  assert.equal(urgentOnly.match(/<table/g)?.length, 1, "no empty second section");
  assert.doesNotMatch(urgentOnly, /Also within/);
});
