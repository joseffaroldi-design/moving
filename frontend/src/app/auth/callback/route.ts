import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

function safeNext(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/portal";
  return value;
}

// OAuth (PKCE) callback — exchanges the ?code for a Supabase session, then, for
// customer sign-ins, links the verified Google email to a customer record via
// the existing self-activation RPC. Unlinked customers are routed to
// /portal/activate by middleware, mirroring the email/password flow.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));
  const oauthError = searchParams.get("error");

  if (oauthError) {
    return NextResponse.redirect(new URL("/portal/login?error=oauth", origin));
  }

  const response = NextResponse.redirect(new URL(next, origin));

  if (code) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(new URL("/portal/login?error=oauth", origin));
    }

    // Best-effort: link this verified email to a customer record. If it fails
    // (e.g. staff account, or no matching customer), middleware handles routing.
    if (next.startsWith("/portal")) {
      await supabase.rpc("portal_activate_customer_account");
    }

    return response;
  }

  return NextResponse.redirect(new URL("/portal/login?error=oauth", origin));
}
