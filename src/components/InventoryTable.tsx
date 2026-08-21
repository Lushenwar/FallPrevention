"use client";

import {
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Inbox,
  LoaderCircle,
  OctagonAlert,
  PackageCheck,
  Search,
  TriangleAlert,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { CATEGORIES, daysUntil, health, todayISO, type Device } from "@/lib/devices";

const PAGE_SIZE = 10;
const SKIP_WARNING_KEY = "fp:skip-replace-warning";

// localStorage is an external store, so it's read through useSyncExternalStore rather than
// mirrored into state in an effect. That keeps the server snapshot (false) authoritative
// during hydration instead of rendering one tree and immediately replacing it.
let skipListeners: (() => void)[] = [];

function subscribeSkip(onChange: () => void) {
  skipListeners.push(onChange);
  // Another tab or another cart window turning the warning back on should apply here too.
  window.addEventListener("storage", onChange);
  return () => {
    skipListeners = skipListeners.filter((l) => l !== onChange);
    window.removeEventListener("storage", onChange);
  };
}

const getSkip = () => localStorage.getItem(SKIP_WARNING_KEY) === "1";

function setSkip(value: boolean) {
  if (value) localStorage.setItem(SKIP_WARNING_KEY, "1");
  else localStorage.removeItem(SKIP_WARNING_KEY);
  skipListeners.forEach((l) => l());
}

// Three signals per status, not one: fill colour, icon silhouette (round / triangle /
// octagon — distinguishable with no colour at all), and a word. Glare kills colour,
// and ~8% of men can't separate the red from the green.
const PILL = {
  ok: {
    cls: "bg-safe-fill text-safe",
    row: "",
    Icon: CircleCheck,
    text: "IN DATE",
  },
  soon: {
    cls: "bg-warn-fill text-warn",
    row: "bg-warn-fill/35",
    Icon: TriangleAlert,
    text: "EXPIRING",
  },
  expired: {
    cls: "bg-danger-fill text-danger",
    row: "bg-danger-fill/45",
    Icon: OctagonAlert,
    text: "EXPIRED",
  },
  replaced: {
    cls: "bg-done-fill text-done",
    row: "",
    Icon: PackageCheck,
    text: "REPLACED",
  },
} as const;

export default function InventoryTable({
  devices,
  onReplace,
}: {
  devices: Device[];
  onReplace: (device: Device) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [page, setPage] = useState(0);
  // Marking replaced is irreversible: the DB guard refuses every transition out of
  // 'replaced'. No undo is possible, so the confirmation has to come first.
  const [confirming, setConfirming] = useState<Device | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [dontAsk, setDontAsk] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const today = todayISO();
  const skipWarning = useSyncExternalStore(subscribeSkip, getSkip, () => false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (confirming && !dialog.open) dialog.showModal();
    if (!confirming && dialog.open) dialog.close();
  }, [confirming]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return devices.filter(
      (d) =>
        (category === "all" || d.category === category) &&
        (q === "" ||
          d.room_number.toLowerCase().includes(q) ||
          (d.serial_number ?? "").toLowerCase().includes(q) ||
          d.device_name.toLowerCase().includes(q)),
    );
  }, [devices, query, category]);

  // Pagination, not infinite scroll: staff count rows against a paper census.
  const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const rows = matches.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);
  const filtered = query.trim() !== "" || category !== "all";

  async function runReplace(device: Device) {
    setConfirming(null);
    setPending(device.id);
    try {
      await onReplace(device);
    } finally {
      setPending(null);
    }
  }

  function requestReplace(device: Device) {
    if (skipWarning) return void runReplace(device);
    setDontAsk(false);
    setConfirming(device);
  }

  function confirmFromDialog(device: Device) {
    if (dontAsk) setSkip(true);
    void runReplace(device);
  }

  function restoreWarning() {
    setSkip(false);
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <Search className="size-4" aria-hidden />
        Inventory
        <span className="ml-auto font-mono text-sm tracking-normal normal-case tnum">
          {matches.length}
          <span className="text-paper/70"> / {devices.length}</span>
        </span>
      </div>

      <div className="flex flex-wrap items-end gap-3 border-b-2 border-rule-hard p-4">
        <div className="min-w-56 flex-1">
          <label className="label" htmlFor="ledger-search">
            Search
          </label>
          {/* No icon inside the input: the panel header already carries one, the field
              is labelled, and an overlaid glyph only ever collides with the placeholder. */}
          <input
            id="ledger-search"
            type="search"
            placeholder="Room, serial or device"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            className="field font-mono"
          />
        </div>
        <div className="min-w-48 flex-1">
          <label className="label" htmlFor="ledger-category">
            Category
          </label>
          <select
            id="ledger-category"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(0);
            }}
            className="field"
          >
            <option value="all">All categories</option>
            {Object.entries(CATEGORIES).map(([value, { label }]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Wide content scrolls inside its own box; the page itself never scrolls sideways. */}
      <div className="overflow-x-auto">
        <table className="ledger w-full text-left">
          <thead>
            <tr className="border-b-2 border-rule-hard bg-bone">
              {["Room", "Device", "Serial", "Expires", "Status", ""].map((h, i) => (
                <th
                  key={h || i}
                  scope="col"
                  className="px-4 py-2.5 text-[0.6875rem] font-bold tracking-[0.12em] uppercase text-ink-soft"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((device, i) => {
              const state = health(device, today);
              const { cls, row, Icon, text } = PILL[state];
              const days = daysUntil(device.expiry_date, today);
              const isPending = pending === device.id;
              return (
                <tr
                  key={device.id}
                  className={`animate-rise border-b-2 border-rule ${row}`}
                  // Safety over choreography: an expired device is never made to wait its
                  // turn in the stagger. The worst news lands on frame one.
                  style={{
                    animationDelay: state === "expired" ? "0ms" : `${Math.min(i, 8) * 40}ms`,
                  }}
                >
                  <td data-label="Room">
                    {/* The scan anchor. Never let a room number break across lines. */}
                    <span className="font-mono text-2xl leading-none font-bold whitespace-nowrap tnum">
                      {device.room_number}
                    </span>
                  </td>
                  <td data-label="Device" className="font-medium">
                    {CATEGORIES[device.category].label}
                  </td>
                  <td data-label="Serial" className="font-mono text-[0.9375rem] whitespace-nowrap">
                    {device.serial_number ?? <span className="text-ink-soft">&mdash;</span>}
                  </td>
                  <td data-label="Expires">
                    <span className="font-mono whitespace-nowrap tnum">{device.expiry_date}</span>
                    <span className="ml-2 font-mono text-sm font-semibold whitespace-nowrap text-ink-soft tnum">
                      {days < 0 ? `${-days}d ago` : `+${days}d`}
                    </span>
                  </td>
                  <td data-label="Status">
                    <span className={`pill ${cls}`}>
                      <Icon className="size-4 shrink-0" aria-hidden />
                      {text}
                    </span>
                  </td>
                  <td data-label="Action">
                    {device.status === "replaced" ? null : (
                      <button
                        onClick={() => requestReplace(device)}
                        disabled={isPending}
                        className="btn btn-secondary btn-sm whitespace-nowrap"
                      >
                        {isPending && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
                        {isPending ? "Saving…" : "Mark replaced"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="p-10 text-center">
                  <span className="mx-auto flex max-w-md flex-col items-center gap-3">
                    <Inbox className="size-10 text-ink-soft" aria-hidden />
                    <span className="text-xl font-bold">
                      {filtered ? "Nothing matches this filter" : "No devices on the ledger yet"}
                    </span>
                    <span className="font-medium text-ink-soft">
                      {filtered
                        ? "Clear the search or pick a different category — a device you expect to see may be filed under another room."
                        : "Register the first unit with the panel on the left. Expiry is calculated for you from the category's shelf life."}
                    </span>
                    {filtered && (
                      <button
                        onClick={() => {
                          setQuery("");
                          setCategory("all");
                          setPage(0);
                        }}
                        className="btn btn-secondary mt-1"
                      >
                        <X className="size-4" aria-hidden />
                        Clear filters
                      </button>
                    )}
                  </span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-3 border-t-2 border-rule-hard p-4">
        <button
          onClick={() => setPage(current - 1)}
          disabled={current === 0}
          className="btn btn-secondary"
        >
          <ChevronLeft className="size-5" aria-hidden />
          Prev
        </button>
        <span className="font-mono text-sm font-semibold tnum" aria-live="polite">
          Page {current + 1} / {pages}
        </span>
        <button
          onClick={() => setPage(current + 1)}
          disabled={current >= pages - 1}
          className="btn btn-secondary"
        >
          Next
          <ChevronRight className="size-5" aria-hidden />
        </button>
      </div>

      {/* Suppressing a warning about an irreversible action must not be a one-way door,
          so the way back is offered exactly when it is relevant. */}
      {skipWarning && (
        <div className="flex flex-wrap items-center gap-2 border-t-2 border-rule px-4 py-3">
          <TriangleAlert className="size-4 shrink-0 text-warn" aria-hidden />
          <span className="text-sm font-semibold">Replacement warnings are off.</span>
          <button onClick={restoreWarning} className="text-sm font-bold underline underline-offset-2">
            Turn them back on
          </button>
        </div>
      )}

      <dialog
        ref={dialogRef}
        onClose={() => setConfirming(null)}
        aria-labelledby="replace-title"
        className="animate-pop m-auto w-[min(30rem,calc(100vw-2rem))] border-4 border-danger bg-paper p-0 text-ink backdrop:bg-ink/70"
      >
        {confirming && (
          <div className="p-6">
            <h2 id="replace-title" className="flex items-center gap-3 text-xl font-bold text-danger">
              <OctagonAlert className="size-7 shrink-0" aria-hidden />
              This cannot be undone
            </h2>
            <p className="mt-4 font-medium">
              Marking a device replaced is permanent. The ledger is an audit record, so the entry
              can never be reopened or edited afterwards.
            </p>
            {/* Structural identifiers only — never resident names or diagnoses. */}
            <dl className="mt-4 border-2 border-rule bg-bone p-3 font-mono text-sm">
              <div className="flex gap-2">
                <dt className="w-16 font-bold text-ink-soft">Room</dt>
                <dd className="font-bold">{confirming.room_number}</dd>
              </div>
              <div className="mt-1 flex gap-2">
                <dt className="w-16 font-bold text-ink-soft">Device</dt>
                <dd>{CATEGORIES[confirming.category].label}</dd>
              </div>
              <div className="mt-1 flex gap-2">
                <dt className="w-16 font-bold text-ink-soft">Serial</dt>
                <dd>{confirming.serial_number ?? "— (no serial recorded)"}</dd>
              </div>
            </dl>

            <label className="mt-4 flex items-center gap-3 font-medium">
              <input
                type="checkbox"
                checked={dontAsk}
                onChange={(e) => setDontAsk(e.target.checked)}
                className="size-5 shrink-0 accent-[var(--color-danger)]"
              />
              Don&apos;t show this again on this device
            </label>

            <div className="mt-5 flex flex-wrap gap-3">
              <button onClick={() => confirmFromDialog(confirming)} className="btn btn-danger flex-1">
                <PackageCheck className="size-5" aria-hidden />
                Mark replaced
              </button>
              <button onClick={() => setConfirming(null)} className="btn btn-secondary flex-1">
                <X className="size-5" aria-hidden />
                Cancel
              </button>
            </div>
          </div>
        )}
      </dialog>
    </section>
  );
}
