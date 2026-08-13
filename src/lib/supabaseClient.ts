import { createClient } from "@supabase/supabase-js";
import type { Device } from "./devices";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY — see .env.example",
  );
}

type AlertLog = { id: string; device_id: string; sent_at: string };

// ponytail: hand-written row types instead of generated ones. Two tables, one shape each;
// run `supabase gen types typescript` if the schema grows past that.
type Schema = {
  public: {
    Tables: {
      devices: {
        Row: Device & { created_at: string; updated_at: string };
        Insert: Omit<Device, "id" | "status"> & { status?: Device["status"] };
        Update: Partial<Device>;
        Relationships: [];
      };
      alert_logs: {
        Row: AlertLog;
        Insert: { device_id: string };
        Update: never;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};

export const supabase = createClient<Schema>(url, key);
