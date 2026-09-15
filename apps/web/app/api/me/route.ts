import { currentUser } from "@/lib/supabase/server";

export async function GET(): Promise<Response> {
  const email = await currentUser();
  if (!email) return Response.json({ error: "unauthenticated" }, { status: 401 });
  return Response.json({ email });
}
