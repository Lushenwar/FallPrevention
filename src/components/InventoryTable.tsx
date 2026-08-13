"use client";

import { CheckCircle2, CircleAlert, Search, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { CATEGORIES, daysUntil, health, todayISO, type Device } from "@/lib/devices";

const PAGE_SIZE = 10;

// Colour is doubled up with an icon and a word: glare and colour-blindness both defeat colour alone.
const PILL = {
  ok: { cls: "bg-emerald-100 text-emerald-900 border-emerald-700", Icon: CheckCircle2, text: "OK" },
  soon: { cls: "bg-amber-100 text-amber-900 border-amber-700", Icon: TriangleAlert, text: "EXPIRING" },
  expired: { cls: "bg-red-100 text-red-900 border-red-700", Icon: CircleAlert, text: "EXPIRED" },
  replaced: { cls: "bg-slate-200 text-slate-900 border-slate-600", Icon: CheckCircle2, text: "REPLACED" },
} as const;

export default function InventoryTable({
  devices,
  onReplace,
}: {
  devices: Device[];
  onReplace: (device: Device) => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [page, setPage] = useState(0);
  const today = todayISO();

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return devices.filter(
      (d) =>
        (category === "all" || d.category === category) &&
        (q === "" ||
          d.room_number.toLowerCase().includes(q) ||
          d.serial_number.toLowerCase().includes(q) ||
          d.device_name.toLowerCase().includes(q)),
    );
  }, [devices, query, category]);

  // Pagination, not infinite scroll: staff count rows against a paper census.
  const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const rows = matches.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  return (
    <section className="rounded-lg border-2 border-slate-300 bg-white">
      <div className="flex flex-wrap items-center gap-3 border-b-2 border-slate-300 p-4">
        <div className="relative flex-1 min-w-64">
          <Search className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-slate-700" />
          <input
            aria-label="Search room, serial or device"
            placeholder="Search room, serial or device"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            className="w-full rounded-md border-2 border-slate-400 py-3 pl-11 pr-3 text-lg font-medium text-slate-900 focus:border-blue-700 focus:outline-none"
          />
        </div>
        <select
          aria-label="Filter by category"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(0);
          }}
          className="rounded-md border-2 border-slate-400 px-3 py-3 text-lg font-medium text-slate-900"
        >
          <option value="all">All categories</option>
          {Object.entries(CATEGORIES).map(([value, { label }]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <p className="text-lg font-bold text-slate-900">{matches.length} device(s)</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-lg text-slate-900">
          <thead className="bg-slate-200 text-base uppercase">
            <tr>
              <th className="px-4 py-3">Room</th>
              <th className="px-4 py-3">Device</th>
              <th className="px-4 py-3">Serial</th>
              <th className="px-4 py-3">Expires</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((device) => {
              const { cls, Icon, text } = PILL[health(device, today)];
              const days = daysUntil(device.expiry_date, today);
              return (
                <tr key={device.id} className="border-t-2 border-slate-200">
                  <td className="px-4 py-4 text-xl font-black">{device.room_number}</td>
                  <td className="px-4 py-4 font-semibold">{CATEGORIES[device.category].label}</td>
                  <td className="px-4 py-4 font-mono">{device.serial_number}</td>
                  <td className="px-4 py-4 font-semibold">
                    {device.expiry_date}
                    <span className="block text-base font-bold">
                      {days < 0 ? `${-days} days ago` : `in ${days} days`}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <span
                      className={`inline-flex items-center gap-2 rounded-full border-2 px-3 py-1 text-base font-black ${cls}`}
                    >
                      <Icon className="size-5" />
                      {text}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    {device.status === "replaced" ? null : (
                      <button
                        onClick={() => onReplace(device)}
                        className="rounded-md border-2 border-slate-700 px-4 py-3 text-base font-black text-slate-900 hover:bg-slate-100"
                      >
                        Mark replaced
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-xl font-bold">
                  No devices match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-4 border-t-2 border-slate-300 p-4">
        <button
          onClick={() => setPage(current - 1)}
          disabled={current === 0}
          className="rounded-md border-2 border-slate-700 px-5 py-3 text-lg font-black text-slate-900 disabled:border-slate-300 disabled:text-slate-400"
        >
          Previous
        </button>
        <span className="text-lg font-bold text-slate-900">
          Page {current + 1} of {pages}
        </span>
        <button
          onClick={() => setPage(current + 1)}
          disabled={current >= pages - 1}
          className="rounded-md border-2 border-slate-700 px-5 py-3 text-lg font-black text-slate-900 disabled:border-slate-300 disabled:text-slate-400"
        >
          Next
        </button>
      </div>
    </section>
  );
}
