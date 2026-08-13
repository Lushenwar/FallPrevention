"use client";

import { CirclePlus, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { CATEGORIES, expiryFor, todayISO, type Category, type Device } from "@/lib/devices";

const field =
  "w-full rounded-md border-2 border-slate-400 bg-white px-3 py-3 text-lg font-medium text-slate-900 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700";
const label = "block text-base font-bold text-slate-900";

export default function DeviceForm({
  onCreated,
  onError,
}: {
  onCreated: (device: Device) => void;
  onError: (message: string) => void;
}) {
  const [category, setCategory] = useState<Category>("bed_sensor");
  const [installDate, setInstallDate] = useState(todayISO());
  // Auto-calculated from category + install date; staff can still override a vendor exception.
  const [expiryDate, setExpiryDate] = useState(expiryFor("bed_sensor", todayISO()));
  const [saving, setSaving] = useState(false);

  function recalc(next: { category?: Category; installDate?: string }) {
    const c = next.category ?? category;
    const i = next.installDate ?? installDate;
    setCategory(c);
    setInstallDate(i);
    setExpiryDate(expiryFor(c, i));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = Object.fromEntries(new FormData(form));
    setSaving(true);
    try {
      // Med-cart Wi-Fi drops mid-hallway: a hung request must not look like a save.
      const response = await fetch("/api/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? `Save failed (${response.status})`);
      onCreated(payload.data);
      form.reset();
      recalc({ installDate: todayISO() });
    } catch (error) {
      onError(
        error instanceof Error && error.name !== "TimeoutError"
          ? error.message
          : "No response from the server. The device was NOT saved — check your connection and try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg border-2 border-slate-300 bg-white p-5">
      <h2 className="text-xl font-black text-slate-900">Register device</h2>

      <div>
        <label className={label} htmlFor="category">
          Category
        </label>
        <select
          id="category"
          name="category"
          className={field}
          value={category}
          onChange={(e) => recalc({ category: e.target.value as Category })}
        >
          {Object.entries(CATEGORIES).map(([value, { label: text, shelfLifeDays }]) => (
            <option key={value} value={value}>
              {text} ({shelfLifeDays}d)
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={label} htmlFor="device_name">
          Device name
        </label>
        <input
          id="device_name"
          name="device_name"
          required
          maxLength={120}
          key={category}
          defaultValue={CATEGORIES[category].label}
          className={field}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={label} htmlFor="serial_number">
            Serial number
          </label>
          <input id="serial_number" name="serial_number" required maxLength={64} className={field} />
        </div>
        <div>
          <label className={label} htmlFor="room_number">
            Room
          </label>
          <input id="room_number" name="room_number" required maxLength={20} className={field} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={label} htmlFor="install_date">
            Installed
          </label>
          <input
            id="install_date"
            name="install_date"
            type="date"
            required
            className={field}
            value={installDate}
            onChange={(e) => recalc({ installDate: e.target.value })}
          />
        </div>
        <div>
          <label className={label} htmlFor="expiry_date">
            Expires
          </label>
          <input
            id="expiry_date"
            name="expiry_date"
            type="date"
            required
            className={field}
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={saving}
        className="flex w-full items-center justify-center gap-2 rounded-md bg-blue-800 px-4 py-4 text-lg font-black text-white hover:bg-blue-900 disabled:bg-slate-500"
      >
        {saving ? <LoaderCircle className="size-6 animate-spin" /> : <CirclePlus className="size-6" />}
        {saving ? "Saving…" : "Add to inventory"}
      </button>
    </form>
  );
}
