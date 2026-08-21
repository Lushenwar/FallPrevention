import assert from "node:assert/strict";
import test from "node:test";
import type { Device } from "./devices.ts";
import { csvFilename, toCsv } from "./export.ts";

function device(overrides: Partial<Device> = {}): Device {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    device_name: "Bed Sensor Pad",
    serial_number: "SN-98234-X",
    category: "bed_sensor",
    room_number: "204-B",
    install_date: "2026-08-01",
    expiry_date: "2027-08-01",
    status: "active",
    ...overrides,
  };
}

test("the export is room, type, install and expiry — one row per device", () => {
  const csv = toCsv([
    device({ room_number: "101-A", category: "floor_mat", install_date: "2026-01-05", expiry_date: "2027-01-05" }),
    device({ room_number: "202-C", category: "chair_alarm" }),
  ]);
  const lines = csv.replace("﻿", "").split("\r\n");

  assert.equal(lines[0], "Room,Type,Installed,Expires");
  assert.equal(lines[1], "101-A,Floor Pressure Mat,2026-01-05,2027-01-05");
  assert.equal(lines[2], "202-C,Chair Alarm,2026-08-01,2027-08-01");
  assert.equal(lines.length, 3, "header plus one row per device, nothing else");
});

test("a device with no serial still exports", () => {
  // Serial is not a column, but a null must not crash the renderer on the way past.
  const csv = toCsv([device({ serial_number: null, room_number: "300-A" })]);
  assert.match(csv, /300-A,Bed Sensor Pad/);
  assert.doesNotMatch(csv, /null/);
});

test("Excel opens it as UTF-8 with CRLF line endings", () => {
  const csv = toCsv([device()]);
  assert.ok(csv.startsWith("﻿"), "BOM, or Excel mangles accented room labels");
  assert.ok(csv.includes("\r\n"), "CRLF");
});

test("a room number typed as a formula is neutralised, not executed", () => {
  // CSV injection: Excel runs a leading =, +, - or @ when the file is opened.
  for (const hostile of ["=1+1", "+1", "-1", "@SUM(A1)"]) {
    const csv = toCsv([device({ room_number: hostile })]);
    assert.ok(csv.includes(`'${hostile}`), `${hostile} should be quoted inert`);
  }
});

test("commas and quotes in free text do not shift columns", () => {
  const csv = toCsv([device({ room_number: 'B "wing", bed 2' })]);
  const row = csv.replace("﻿", "").split("\r\n")[1];
  assert.equal(row, '"B ""wing"", bed 2",Bed Sensor Pad,2026-08-01,2027-08-01');
});

test("the filename carries the date the export was taken", () => {
  assert.equal(csvFilename("2026-08-21"), "fall-prevention-devices-2026-08-21.csv");
});
