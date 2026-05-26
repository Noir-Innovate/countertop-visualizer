import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSalespersonOnly } from "@/lib/sales/assignments";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Resolve the post-login destination. Respect explicit ?next= unless
      // it would dump a salesperson onto the admin dashboard.
      let next = nextParam ?? "/dashboard";
      const wantsDashboardRoot = !nextParam || nextParam === "/dashboard";
      if (wantsDashboardRoot) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user && (await isSalespersonOnly(user.id))) {
          next = "/sales";
        }
      }

      const forwardedHost = request.headers.get("x-forwarded-host");
      const isLocalEnv = process.env.NODE_ENV === "development";
      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${next}`);
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`);
      } else {
        return NextResponse.redirect(`${origin}${next}`);
      }
    }
  }

  // return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}
