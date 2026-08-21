"use client";

import { CircleCheck, OctagonAlert, TriangleAlert, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import DeviceForm from "@/components/DeviceForm";
import InventoryTable from "@/components/InventoryTable";
import { health, todayISO, type Device } from "@/lib/devices";
import { csvFilename, toCsv } from "@/lib/export";

export default function Dashboard({ initial }: { initial: Device[] }) {
  const [devices, setDevices] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Native <dialog> rather than a hand-rolled overlay: focus trapping, Escape, and
  // inert background content are all platform behaviour, and all three are things a
  // bespoke modal usually gets wrong.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (error && !dialog.open) dialog.showModal();
    if (!error && dialog.open) dialog.close();
  }, [error]);

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

  // Built from what the table already holds, so the file always matches what is on screen.
  // No endpoint, no dependency: a Blob and an anchor are the whole feature.
  function exportCsv() {
    const url = URL.createObjectURL(new Blob([toCsv(devices)], { type: "text/csv" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = csvFilename(todayISO());
    link.click();
    URL.revokeObjectURL(url);
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
    <main className="mx-auto w-full max-w-[90rem] flex-1 space-y-3 p-3 sm:p-4 lg:min-h-0 lg:overflow-hidden">
      {/* Readout strip — the one thing that must be legible from across the corridor. */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Readout label="Devices tracked" value={devices.length} Icon={CircleCheck} tone="neutral" />
        <Readout
          label="Expiring ≤ 30 days"
          value={counts.soon}
          Icon={TriangleAlert}
          tone={counts.soon > 0 ? "warn" : "neutral"}
        />
        <Readout
          label="Expired"
          value={counts.expired}
          Icon={OctagonAlert}
          tone={counts.expired > 0 ? "danger" : "neutral"}
        />
      </div>

      <div className="grid gap-3 lg:min-h-0 lg:grid-cols-[21rem_1fr] xl:grid-cols-[23rem_1fr]">
        <DeviceForm onCreated={(device) => setDevices((c) => [device, ...c])} onError={setError} />
        <InventoryTable devices={devices} onReplace={replace} onExport={exportCsv} />
      </div>

      {/* Failures must be acknowledged, never swallowed — a missed save is a missed replacement. */}
      <dialog
        ref={dialogRef}
        onClose={() => setError(null)}
        aria-labelledby="failure-title"
        className="animate-pop m-auto w-[min(32rem,calc(100vw-2rem))] border-4 border-danger bg-paper p-0 text-ink backdrop:bg-ink/70"
      >
        <div className="p-6">
          <h2 id="failure-title" className="flex items-center gap-3 text-2xl font-bold text-danger">
            <OctagonAlert className="size-8 shrink-0" aria-hidden />
            Action failed
          </h2>
          <p className="mt-4 text-lg font-medium">{error}</p>
          <p className="mt-2 font-mono text-sm font-semibold text-ink-soft">
            Nothing was saved. Re-check the device before you walk away from it.
          </p>
          <button onClick={() => setError(null)} className="btn btn-danger mt-6 w-full">
            <X className="size-5" aria-hidden />
            I understand
          </button>
        </div>
      </dialog>
    </main>
  );
}

const TONES = {
  neutral: "bg-paper border-rule-hard",
  warn: "bg-warn-fill border-warn text-warn",
  danger: "bg-danger-fill border-danger text-danger",
} as const;

function Readout({
  label,
  value,
  Icon,
  tone,
}: {
  label: string;
  value: number;
  Icon: typeof TriangleAlert;
  tone: keyof typeof TONES;
}) {
  return (
    <div className={`animate-rise flex items-center gap-4 border-2 p-4 ${TONES[tone]}`}>
      <Icon className="size-8 shrink-0" aria-hidden />
      <div className="min-w-0">
        <p className="font-mono text-4xl leading-none font-bold tnum">{value}</p>
        <p className="mt-1.5 text-[0.6875rem] font-bold tracking-[0.12em] uppercase">{label}</p>
      </div>
    </div>
  );
}
