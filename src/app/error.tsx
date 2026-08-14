"use client";

import { OctagonAlert, RotateCw } from "lucide-react";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 p-4 sm:p-6">
      <section className="panel panel-danger animate-rise">
        <div className="hazard-rule" aria-hidden />
        <div className="p-6 sm:p-8">
          <h2 className="flex items-center gap-3 text-2xl font-bold text-danger sm:text-3xl">
            <OctagonAlert className="size-9 shrink-0" aria-hidden />
            The inventory could not be loaded
          </h2>
          <p className="mt-4 text-lg font-medium">
            Do not assume every device is in date. This screen is showing you nothing, which is not
            the same as nothing being wrong.
          </p>
          <p className="mt-2 font-medium text-ink-soft">
            Retry below. If it fails again, check the devices on paper and tell IT.
          </p>
          <pre className="mt-5 overflow-x-auto border-2 border-rule bg-bone p-3 font-mono text-sm">
            {error.message}
          </pre>
          <button onClick={reset} className="btn btn-primary mt-6">
            <RotateCw className="size-5" aria-hidden />
            Retry
          </button>
        </div>
      </section>
    </main>
  );
}
