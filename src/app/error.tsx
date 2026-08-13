"use client";

import { CircleAlert } from "lucide-react";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto max-w-2xl p-10">
      <h2 className="flex items-center gap-3 text-3xl font-black text-red-800">
        <CircleAlert className="size-9" /> The inventory could not be loaded
      </h2>
      <p className="mt-4 text-xl font-semibold text-slate-900">
        Do not assume every device is in date. Retry, and tell IT if this keeps happening.
      </p>
      <p className="mt-2 font-mono text-base text-slate-900">{error.message}</p>
      <button
        onClick={reset}
        className="mt-6 rounded-md bg-blue-800 px-6 py-4 text-lg font-black text-white hover:bg-blue-900"
      >
        Retry
      </button>
    </main>
  );
}
