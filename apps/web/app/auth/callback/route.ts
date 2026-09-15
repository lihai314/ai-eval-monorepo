import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

/** Handles both OAuth (?code=) and magic link (?token_hash&type=) returns. */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const next = url.searchParams.get("next") ?? "/";

  const supabase = await supabaseServer();
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  } else if (tokenHash && type === "email") {
    const { error } = await supabase.auth.verifyOtp({ type: "email", token_hash: tokenHash });
    if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  } else {
    redirect("/login");
  }
  return Response.redirect(new URL(next, url.origin), 303);
}
