"use client";

import { CircleAlert, TriangleAlert, X } from "lucide-react";
import { useState } from "react";
import DeviceForm from "@/components/DeviceForm";
import InventoryTable from "@/components/InventoryTable";
import { health, todayISO, type Device } from "@/lib/devices";

export default function Dashboard({ initial }: { initial: Device[] }) {
  const [devices, setDevices] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    const response = await fetch("/api/devices", { signal: AbortSignal.timeout(15_000) });
    if (response.ok) setDevices((await response.json()).data);
  }

  async function replace(device: Device) {
    try {
      const response = await fetch("/api/devices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: device.id, status: "replaced" }),
        signal: AbortSignal.timeout(15_000),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? `Update failed (${response.status})`);
      setDevices((current) => current.filter((d) => d.id !== device.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The update did not go through. Try again.");
      void reload();
    }
  }

  const today = todayISO();
  const counts = devices.reduce(
    (acc, d) => {
      const state = health(d, today);
      if (state === "expired") acc.expired += 1;
      if (state === "soon") acc.soon += 1;
      return acc;
    },
    { expired: 0, soon: 0 },
  );

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 p-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Devices tracked" value={devices.length} tone="bg-white border-slate-400" />
        <Stat
          label="Expiring within 30 days"
          value={counts.soon}
          tone="bg-amber-100 border-amber-700"
          Icon={TriangleAlert}
        />
        <Stat label="Expired" value={counts.expired} tone="bg-red-100 border-red-700" Icon={CircleAlert} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[24rem_1fr]">
        <DeviceForm onCreated={(device) => setDevices((c) => [device, ...c])} onError={setError} />
        <InventoryTable devices={devices} onReplace={replace} />
      </div>

      {/* Failures must be acknowledged, never swallowed — a missed save is a missed replacement. */}
      {error && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-6">
          <div role="alertdialog" aria-modal className="max-w-lg rounded-lg border-4 border-red-700 bg-white p-6">
            <h2 className="flex items-center gap-3 text-2xl font-black text-red-800">
              <CircleAlert className="size-8" /> Action failed
            </h2>
            <p className="mt-4 text-lg font-semibold text-slate-900">{error}</p>
            <button
              onClick={() => setError(null)}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-md bg-red-700 px-4 py-4 text-lg font-black text-white hover:bg-red-800"
            >
              <X className="size-6" /> I understand
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function Stat({
  label,
  value,
  tone,
  Icon,
}: {
  label: string;
  value: number;
  tone: string;
  Icon?: typeof TriangleAlert;
}) {
  return (
    <div className={`flex items-center gap-4 rounded-lg border-2 p-5 ${tone}`}>
      {Icon && <Icon className="size-9 text-slate-900" />}
      <div>
        <p className="text-4xl font-black text-slate-900">{value}</p>
        <p className="text-lg font-bold text-slate-900">{label}</p>
      </div>
    </div>
  );
}
