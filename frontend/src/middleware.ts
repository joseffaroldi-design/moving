import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PROTECTED = ["/dashboard", "/portal", "/mobile"];
// Public auth pages that live under a protected prefix must be excluded.
const PUBLIC_UNDER_PROTECTED = ["/portal/login"];

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // Do not trust getSession() for auth decisions — getUser() revalidates.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublicAuthPage = PUBLIC_UNDER_PROTECTED.some(
    (p) => path === p || path.startsWith(p + "/")
  );
  const isProtected =
    !isPublicAuthPage &&
    PROTECTED.some((p) => path === p || path.startsWith(p + "/"));

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    // Customers get the customer-branded login; staff/crew get the ops login.
    url.pathname = path.startsWith("/portal") ? "/portal/login" : "/login";
    url.searchParams.set("next", path);
    const redirect = NextResponse.redirect(url);
    // Carry over any auth cookies Supabase refreshed while validating, so a
    // token refresh during a protected request cannot cause a redirect loop.
    response.cookies.getAll().forEach((c) =>
      redirect.cookies.set(c.name, c.value, c)
    );
    return redirect;
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|brand/|auth/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
