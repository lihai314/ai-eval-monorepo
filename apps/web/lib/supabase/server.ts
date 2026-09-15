import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function env() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY not configured");
  }
  return { url, key };
}

/** Server-side session client. Cookie writes only work in route handlers and
 *  server actions — in a pure RSC render they throw, which we swallow per
 *  Supabase's Next.js guidance (refresh happens on the next request). */
export async function supabaseServer() {
  const { url, key } = env();
  const store = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (
        list: { name: string; value: string; options: import("@supabase/ssr").CookieOptions }[],
      ) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          /* read-only render */
        }
      },
    },
  });
}

/** Email of the logged-in user, or null. The gate for console + write APIs. */
export async function currentUser(): Promise<string | null> {
  try {
    const supabase = await supabaseServer();
    const { data } = await supabase.auth.getUser();
    return data.user?.email ?? null;
  } catch {
    return null;
  }
}
