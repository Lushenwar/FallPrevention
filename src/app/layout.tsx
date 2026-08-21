import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { ShieldCheck } from "lucide-react";
import "./globals.css";

// Plex was drawn for screens and for industrial/technical work: large x-height,
// unmistakable 0/O and 1/l, and mono numerals that line up down a column. Exactly
// the job here — every serial, room and date is read off a bad monitor in a hurry.
const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Fall Prevention Device Tracking",
  description: "Expiry ledger for LTC fall prevention equipment",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`h-full antialiased ${plexSans.variable} ${plexMono.variable}`}>
      <body className="flex min-h-full flex-col lg:h-dvh lg:overflow-hidden">
        <header className="shrink-0 bg-ink text-paper">
          <div className="mx-auto flex w-full max-w-[90rem] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
            <ShieldCheck className="size-7 shrink-0 text-hazard" aria-hidden />
            <h1 className="text-lg font-bold tracking-[0.14em] uppercase sm:text-xl">
              Fall Prevention
            </h1>
            <span aria-hidden className="hidden h-6 w-0.5 bg-paper/35 sm:block" />
            <p className="font-mono text-sm tracking-wide text-paper/80">Device Ledger</p>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
