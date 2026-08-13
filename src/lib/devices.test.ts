import assert from "node:assert/strict";
import test from "node:test";
import { addDays, daysUntil, expiryFor, health, NewDevice } from "./devices.ts";

test("addDays crosses months, years and leap days", () => {
  assert.equal(addDays("2026-08-13", 90), "2026-11-11");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2028-02-28", 1), "2028-02-29");
});

test("daysUntil is signed", () => {
  assert.equal(daysUntil("2026-08-20", "2026-08-13"), 7);
  assert.equal(daysUntil("2026-08-13", "2026-08-13"), 0);
  assert.equal(daysUntil("2026-08-01", "2026-08-13"), -12);
});

test("bed sensor pads expire 90 days after install", () => {
  assert.equal(expiryFor("bed_sensor", "2026-08-01"), "2026-10-30");
});

test("health is the traffic light", () => {
  const t = "2026-08-13";
  assert.equal(health({ expiry_date: "2027-01-01", status: "active" }, t), "ok");
  assert.equal(health({ expiry_date: "2026-09-12", status: "active" }, t), "soon"); // 30 days
  assert.equal(health({ expiry_date: "2026-08-12", status: "active" }, t), "expired");
  assert.equal(health({ expiry_date: "2099-01-01", status: "replaced" }, t), "replaced");
});

test("NewDevice rejects junk payloads", () => {
  const ok = NewDevice.safeParse({
    device_name: "Floor Pressure Mat",
    serial_number: "FM-00123",
    category: "floor_mat",
    room_number: "101-A",
    install_date: "2026-08-13",
    expiry_date: "2027-08-13",
  });
  assert.equal(ok.success, true);
  assert.equal(NewDevice.safeParse({}).success, false);
  assert.equal(
    NewDevice.safeParse({ ...ok.data, category: "laser_beam" }).success,
    false,
  );
  assert.equal(
    NewDevice.safeParse({ ...ok.data, install_date: "13/08/2026" }).success,
    false,
  );
});
