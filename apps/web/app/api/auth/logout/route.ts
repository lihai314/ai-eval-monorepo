import { supabaseServer } from "@/lib/supabase/server";

export async function POST(): Promise<Response> {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  return Response.json({ ok: true });
}
