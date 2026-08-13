import { DeviceUpdate, NewDevice } from "@/lib/devices";
import { supabase } from "@/lib/supabaseClient";

export async function GET() {
  const { data, error } = await supabase
    .from("devices")
    .select("id, device_name, serial_number, category, room_number, install_date, expiry_date, status")
    .neq("status", "replaced")
    .order("expiry_date", { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ data });
}

export async function POST(request: Request) {
  const parsed = NewDevice.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("devices")
    .insert(parsed.data)
    .select()
    .single();

  if (error) {
    // 23505 = unique_violation on serial_number: the nurse double-submitted on flaky Wi-Fi.
    const duplicate = error.code === "23505";
    return Response.json(
      { error: duplicate ? "That serial number is already registered." : error.message },
      { status: duplicate ? 409 : 500 },
    );
  }
  return Response.json({ data }, { status: 201 });
}

export async function PATCH(request: Request) {
  const parsed = DeviceUpdate.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { id, ...changes } = parsed.data;

  // Optimistic concurrency: two nurses at shift change both mark the same pad replaced.
  // The `status = active` predicate makes the second write a no-op instead of a duplicate.
  const { data, error } = await supabase
    .from("devices")
    .update(changes)
    .eq("id", id)
    .eq("status", "active")
    .select()
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) {
    return Response.json(
      { error: "Someone else already updated this device. Refresh to see its current state." },
      { status: 409 },
    );
  }
  return Response.json({ data });
}
