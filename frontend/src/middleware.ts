import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PROTECTED = ["/dashboard", "/portal", "/mobile"];
const PUBLIC_UNDER_PROTECTED = ["/portal/login"];

const STAFF_ROLES = new Set(["owner", "operations_manager", "dispatcher", "sales"]);
const MOBILE_ROLES = new Set(["owner", "operations_manager", "dispatcher", "crew_lead", "mover"]);

function withRefreshedCookies(response: NextResponse, redirect: NextResponse) {
  response.cookies.getAll().forEach((c) => redirect.cookies.set(c.name, c.value, c));
  return redirect;
}

function roleRedirect(request: NextRequest, response: NextResponse, pathname: string, role: string | null) {
  const url = request.nextUrl.clone();

  if (!role) {
    url.pathname = "/unauthorized";
    url.search = "";
    return withRefreshedCookies(response, NextResponse.redirect(url));
  }

  if (pathname.startsWith("/mobile") && !MOBILE_ROLES.has(role)) {
    url.pathname = role === "customer" ? "/portal" : STAFF_ROLES.has(role) ? "/dashboard" : "/unauthorized";
    url.search = "";
    return withRefreshedCookies(response, NextResponse.redirect(url));
  }

  if (pathname.startsWith("/portal") && role !== "customer") {
    url.pathname = MOBILE_ROLES.has(role) && !STAFF_ROLES.has(role) ? "/mobile/jobs" : STAFF_ROLES.has(role) ? "/dashboard" : "/unauthorized";
    url.search = "";
    return withRefreshedCookies(response, NextResponse.redirect(url));
  }

  if (pathname.startsWith("/dashboard") && !STAFF_ROLES.has(role)) {
    url.pathname = role === "customer" ? "/portal" : MOBILE_ROLES.has(role) ? "/mobile/jobs" : "/unauthorized";
    url.search = "";
    return withRefreshedCookies(response, NextResponse.redirect(url));
  }

  return null;
}

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
    url.pathname = path.startsWith("/portal")
      ? "/portal/login"
      : path.startsWith("/mobile")
        ? "/crew/login"
        : "/login";
    url.searchParams.set("next", path);
    return withRefreshedCookies(response, NextResponse.redirect(url));
  }

  if (isProtected && user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, is_active")
      .eq("id", user.id)
      .maybeSingle();

    const role = typeof profile?.role === "string" ? profile.role : null;
    if (!profile || profile.is_active !== true) {
      const url = request.nextUrl.clone();
      url.pathname = "/unauthorized";
      url.search = "";
      return withRefreshedCookies(response, NextResponse.redirect(url));
    }

    const redirect = roleRedirect(request, response, path, role);
    if (redirect) return redirect;
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|brand/|auth/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
