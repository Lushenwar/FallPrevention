import assert from "node:assert/strict";
import test from "node:test";
import {
  addDays,
  CATEGORIES,
  daysUntil,
  DeviceUpdate,
  expiryFor,
  health,
  NewDevice,
} from "./devices.ts";

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

test("every category in service is a one-year shelf life", () => {
  assert.equal(expiryFor("bed_sensor", "2026-08-01"), "2027-08-01");
  assert.equal(expiryFor("chair_alarm", "2026-08-01"), "2027-08-01");
  assert.equal(expiryFor("floor_mat", "2026-08-01"), "2027-08-01");
});

test("only the three categories still in service are offered", () => {
  // Grab bars and hip protectors were withdrawn; the DB check constraint agrees, so a
  // stray value here would be a 400 at the boundary rather than a bad row.
  assert.deepEqual(Object.keys(CATEGORIES), ["bed_sensor", "chair_alarm", "floor_mat"]);
  assert.equal(NewDevice.safeParse({ category: "grab_bar" }).success, false);
});

test("health is the traffic light", () => {
  const t = "2026-08-13";
  assert.equal(health({ expiry_date: "2027-01-01", status: "active" }, t), "ok");
  assert.equal(health({ expiry_date: "2026-09-12", status: "active" }, t), "soon"); // 30 days
  assert.equal(health({ expiry_date: "2026-08-12", status: "active" }, t), "expired");
  assert.equal(health({ expiry_date: "2099-01-01", status: "replaced" }, t), "replaced");
});

test("health boundaries: 31 days is still green, expiry day itself is not yet red", () => {
  const t = "2026-08-13";
  assert.equal(health({ expiry_date: "2026-09-13", status: "active" }, t), "ok", "31 days out");
  assert.equal(health({ expiry_date: "2026-09-12", status: "active" }, t), "soon", "30 days out");
  assert.equal(health({ expiry_date: t, status: "active" }, t), "soon", "expires today");
  // A row still marked active but past its date reads as expired: the cron may not have run.
  assert.equal(health({ expiry_date: "2026-08-12", status: "active" }, t), "expired");
  assert.equal(health({ expiry_date: "2026-08-12", status: "expired" }, t), "expired");
});

test("every category has a shelf life that lands in the future", () => {
  for (const category of ["bed_sensor", "chair_alarm", "floor_mat"] as const) {
    assert.ok(expiryFor(category, "2026-08-13") > "2026-08-13", category);
  }
});

test("DeviceUpdate guards the PATCH boundary", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  assert.equal(DeviceUpdate.safeParse({ id, status: "replaced" }).success, true);
  // Room shuffle: a resident moves, the device keeps its id, install and expiry dates.
  assert.equal(DeviceUpdate.safeParse({ id, room_number: "310-A" }).success, true);
  assert.equal(DeviceUpdate.safeParse({ id }).success, false, "no-op update");
  assert.equal(DeviceUpdate.safeParse({ id, status: "active" }).success, false, "no resurrection");
  assert.equal(DeviceUpdate.safeParse({ id, status: "deleted" }).success, false);
  assert.equal(DeviceUpdate.safeParse({ id: "not-a-uuid", status: "replaced" }).success, false);
  assert.equal(DeviceUpdate.safeParse({ id, room_number: "" }).success, false);
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

test("serial number is optional, and blank means NULL rather than empty string", () => {
  const base = {
    device_name: "Bed Sensor Pad",
    category: "bed_sensor",
    room_number: "101-A",
    install_date: "2026-08-13",
    expiry_date: "2027-08-13",
  };

  // Omitted entirely, blank, and whitespace-only all land on NULL. That matters: the
  // live-unique index ignores NULLs but would reject a second "".
  for (const serial of [undefined, "", "   "]) {
    const parsed = NewDevice.safeParse({ ...base, serial_number: serial });
    assert.equal(parsed.success, true, JSON.stringify(serial));
    assert.equal(parsed.data!.serial_number, null, JSON.stringify(serial));
  }

  const real = NewDevice.safeParse({ ...base, serial_number: "  BSP-77  " });
  assert.equal(real.data!.serial_number, "BSP-77", "a real serial is kept, trimmed");

  // The other two identifiers are still mandatory -- an unroomed device is untrackable.
  assert.equal(NewDevice.safeParse({ ...base, room_number: "" }).success, false);
  assert.equal(NewDevice.safeParse({ ...base, device_name: "" }).success, false);
});
