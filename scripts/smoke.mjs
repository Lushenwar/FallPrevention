// End-to-end smoke test against a running server + real Supabase.
// The unit tests cover pure logic; these are the paths that only exist once Postgres
// is in the loop — unique serials, the shift-change race, and cron auth.
//
//   npm run dev                       # terminal 1
//   npm run smoke                     # terminal 2
//
// Env: BASE_URL (default http://localhost:3000), CRON_SECRET, SMOKE_SEND_EMAIL=1.
// The test device is left behind as `replaced` — this ledger has no delete, by design.

import assert from "node:assert/strict";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const serial = `SMOKE-${Date.now()}`;
let passed = 0;

async function step(name, fn) {
  try {
    await fn();
    console.log(`  PASS  ${name}`);
    passed += 1;
  } catch (error) {
    console.error(`  FAIL  ${name}\n        ${error.message}`);
    process.exitCode = 1;
  }
}

const api = (init) =>
  fetch(`${BASE}/api/devices`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });

const today = new Date().toISOString().slice(0, 10);
const payload = {
  device_name: "Bed Sensor Pad",
  serial_number: serial,
  category: "bed_sensor",
  room_number: "SMOKE-1",
  install_date: today,
  expiry_date: "2027-01-01",
};

console.log(`Smoke testing ${BASE} with serial ${serial}\n`);
let id;

await step("POST /api/devices registers a device", async () => {
  const response = await api({ method: "POST", body: JSON.stringify(payload) });
  const body = await response.json();
  assert.equal(response.status, 201, JSON.stringify(body));
  assert.equal(body.data.serial_number, serial);
  assert.equal(body.data.status, "active");
  assert.ok(body.data.id, "server assigns the uuid, not the client");
  id = body.data.id;
});

await step("POST rejects a duplicate serial with 409, not 500", async () => {
  const response = await api({ method: "POST", body: JSON.stringify(payload) });
  assert.equal(response.status, 409);
});

await step("POST rejects an invalid payload with 400", async () => {
  const response = await api({
    method: "POST",
    body: JSON.stringify({ ...payload, serial_number: `${serial}-2`, category: "laser_beam" }),
  });
  assert.equal(response.status, 400);
});

await step("GET /api/devices lists the new device", async () => {
  const response = await api({});
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.ok(body.data.some((d) => d.id === id), "device missing from inventory");
});

await step("PATCH moves a room without touching the dates", async () => {
  const response = await api({
    method: "PATCH",
    body: JSON.stringify({ id, room_number: "SMOKE-2" }),
  });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  assert.equal(body.data.room_number, "SMOKE-2");
  assert.equal(body.data.install_date, payload.install_date, "room shuffle reset install_date");
  assert.equal(body.data.expiry_date, payload.expiry_date, "room shuffle reset expiry_date");
});

await step("shift change: two nurses replace at once, exactly one wins", async () => {
  const replace = () => api({ method: "PATCH", body: JSON.stringify({ id, status: "replaced" }) });
  const [a, b] = await Promise.all([replace(), replace()]);
  const codes = [a.status, b.status].sort();
  assert.deepEqual(codes, [200, 409], `expected one 200 and one 409, got ${codes}`);
});

await step("a third replace is still refused", async () => {
  const response = await api({ method: "PATCH", body: JSON.stringify({ id, status: "replaced" }) });
  assert.equal(response.status, 409);
});

await step("replaced devices drop out of the active inventory", async () => {
  const body = await (await api({})).json();
  assert.ok(!body.data.some((d) => d.id === id));
});

const cron = (headers) => fetch(`${BASE}/api/cron/check-expirations`, { headers });

await step("cron is closed to the public", async () => {
  assert.equal((await cron({})).status, 401, "no auth header");
  assert.equal((await cron({ Authorization: "Bearer nope" })).status, 401, "wrong secret");
  assert.equal((await cron({ Authorization: process.env.CRON_SECRET ?? "x" })).status, 401, "missing scheme");
});

if (process.env.SMOKE_SEND_EMAIL === "1" && process.env.CRON_SECRET) {
  await step("cron runs with the right secret (SENDS A REAL EMAIL)", async () => {
    const response = await cron({ Authorization: `Bearer ${process.env.CRON_SECRET}` });
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.success, true);
    assert.equal(typeof body.alertedCount, "number");
  });
} else {
  console.log("  SKIP  authorized cron run — set SMOKE_SEND_EMAIL=1 and CRON_SECRET to include it");
}

console.log(`\n${passed} passed${process.exitCode ? " — FAILURES ABOVE" : ""}`);
