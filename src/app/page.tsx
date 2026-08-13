import Dashboard from "@/components/Dashboard";
import type { Device } from "@/lib/devices";
import { supabase } from "@/lib/supabaseClient";

// Never serve a cached inventory: a stale row here is a device nobody replaces.
export const dynamic = "force-dynamic";

export default async function Page() {
  const { data, error } = await supabase
    .from("devices")
    .select("id, device_name, serial_number, category, room_number, install_date, expiry_date, status")
    .neq("status", "replaced")
    .order("expiry_date", { ascending: true });

  if (error) throw new Error(error.message);
  return <Dashboard initial={(data ?? []) as Device[]} />;
}
