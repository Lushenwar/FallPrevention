"use client";

import { CircleCheck, CirclePlus, LoaderCircle, ClipboardList } from "lucide-react";
import { useEffect, useState } from "react";
import { CATEGORIES, expiryFor, todayISO, type Category, type Device } from "@/lib/devices";

type FieldName = "device_name" | "serial_number" | "room_number";

// Serial is absent on purpose: labels rub off, and refusing the registration would leave
// the device untracked, which is worse than not knowing its serial.
const REQUIRED: Partial<Record<FieldName, string>> = {
  device_name: "Enter the device name printed on the unit.",
  room_number: "Enter the room this device is installed in.",
};

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
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [saved, setSaved] = useState<string | null>(null);

  // Success feedback has to outlast a glance away from the cart.
  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(null), 5000);
    return () => clearTimeout(timer);
  }, [saved]);

  function recalc(next: { category?: Category; installDate?: string }) {
    const c = next.category ?? category;
    const i = next.installDate ?? installDate;
    setCategory(c);
    setInstallDate(i);
    setExpiryDate(expiryFor(c, i));
  }

  // Validate on blur, never per keystroke — nagging someone mid-serial is how you get
  // an abandoned form. Once a field has errored, it re-checks as they fix it.
  function validate(name: FieldName, value: string) {
    const message = REQUIRED[name];
    setErrors((prev) => {
      const next = { ...prev };
      if (message && value.trim() === "") next[name] = message;
      else delete next[name];
      return next;
    });
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
      setSaved(
        `${payload.data.serial_number ?? "no serial"} → room ${payload.data.room_number}`,
      );
      setErrors({});
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
    <form onSubmit={submit} noValidate className="panel flex flex-col lg:min-h-0">
      <div className="panel-head">
        <ClipboardList className="size-4" aria-hidden />
        Register device
      </div>

      <div className="space-y-3 overflow-y-auto p-3">
        <div>
          <label className="label" htmlFor="category">
            Category
          </label>
          <select
            id="category"
            name="category"
            className="field"
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

        <Field
          name="device_name"
          label="Device name"
          error={errors.device_name}
          onValidate={validate}
          key={category}
          defaultValue={CATEGORIES[category].label}
          maxLength={120}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            name="serial_number"
            label="Serial (optional)"
            error={errors.serial_number}
            onValidate={validate}
            maxLength={64}
            mono
            optional
            placeholder="Optional"
          />
          <Field
            name="room_number"
            label="Room"
            error={errors.room_number}
            onValidate={validate}
            maxLength={20}
            mono
            placeholder="204-B"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="install_date">
              Installed
            </label>
            <input
              id="install_date"
              name="install_date"
              type="date"
              required
              className="field font-mono tnum"
              value={installDate}
              onChange={(e) => recalc({ installDate: e.target.value })}
            />
          </div>
          <div>
            <label className="label" htmlFor="expiry_date">
              Expires
            </label>
            <input
              id="expiry_date"
              name="expiry_date"
              type="date"
              required
              className="field font-mono tnum"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
            />
          </div>
        </div>

        <button type="submit" disabled={saving} className="btn btn-primary w-full">
          {saving ? (
            <LoaderCircle className="size-5 animate-spin" aria-hidden />
          ) : (
            <CirclePlus className="size-5" aria-hidden />
          )}
          {saving ? "Saving…" : "Add to inventory"}
        </button>

        <p aria-live="polite" className="min-h-0">
          {saved && (
            <span className="animate-rise flex items-start gap-2 border-2 border-safe bg-safe-fill p-3 text-sm font-semibold text-safe">
              <CircleCheck className="size-5 shrink-0" aria-hidden />
              <span>
                Added to the ledger.
                <span className="mt-0.5 block font-mono text-xs">{saved}</span>
              </span>
            </span>
          )}
        </p>
      </div>
    </form>
  );
}

function Field({
  name,
  label,
  error,
  onValidate,
  hint,
  mono,
  optional,
  ...input
}: {
  name: FieldName;
  label: string;
  error?: string;
  onValidate: (name: FieldName, value: string) => void;
  hint?: string;
  mono?: boolean;
  optional?: boolean;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const describedBy = [error ? `${name}-error` : null, hint ? `${name}-hint` : null]
    .filter(Boolean)
    .join(" ");

  return (
    <div>
      <label className="label" htmlFor={name}>
        {label}
      </label>
      <input
        {...input}
        id={name}
        name={name}
        required={!optional}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        onBlur={(e) => onValidate(name, e.target.value)}
        onChange={(e) => error && onValidate(name, e.target.value)}
        className={`field ${mono ? "font-mono" : ""}`}
      />
      {error ? (
        <p id={`${name}-error`} className="mt-1.5 text-xs font-bold text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${name}-hint`} className="mt-1.5 font-mono text-xs font-semibold text-ink-soft">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
