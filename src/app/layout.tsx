import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fall Prevention Device Tracking",
  description: "Expiry ledger for LTC fall prevention equipment",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // Forced light + system font stack: clinical monitors are high-glare and old.
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-slate-100 text-slate-900">
        <header className="flex items-center gap-3 border-b-4 border-blue-900 bg-blue-900 px-6 py-4 text-white">
          <ShieldCheck className="size-8" />
          <h1 className="text-2xl font-black">Fall Prevention — Device Ledger</h1>
        </header>
        {children}
      </body>
    </html>
  );
}
