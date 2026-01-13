import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { createServerClient } from "@supabase/ssr";

// Material line resolution cache (in-memory for edge runtime)
const materialLineCache = new Map<
  string,
  { materialLine: MaterialLineConfig | null; timestamp: number }
>();
const CACHE_TTL = 60 * 1000; // 1 minute cache

interface MaterialLineConfig {
  id: string;
  organization_id: string;
  slug: string;
  name: string;
  custom_domain: string | null;
  custom_domain_verified: boolean;
  logo_url: string | null;
  primary_color: string;
  accent_color: string;
  background_color: string;
  supabase_folder: string;
}

async function getMaterialLineBySlugOrDomain(
  hostname: string,
  appDomain: string
): Promise<MaterialLineConfig | null> {
  // Check cache first
  const cached = materialLineCache.get(hostname);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.materialLine;
  }

  // Create a minimal supabase client for material line lookup
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return [];
        },
        setAll() {},
      },
    }
  );

  let materialLine: MaterialLineConfig | null = null;

  // Check if this is a wildcard subdomain
  if (hostname.endsWith(`.${appDomain}`)) {
    const slug = hostname.replace(`.${appDomain}`, "");
    const { data } = await supabase
      .from("material_lines")
      .select("*")
      .eq("slug", slug)
      .single();
    materialLine = data;
  } else if (hostname !== appDomain && hostname !== `www.${appDomain}`) {
    // Check for custom domain
    const { data } = await supabase
      .from("material_lines")
      .select("*")
      .eq("custom_domain", hostname)
      .eq("custom_domain_verified", true)
      .single();
    materialLine = data;
  }

  // Cache the result
  materialLineCache.set(hostname, { materialLine, timestamp: Date.now() });

  return materialLine;
}

export async function proxy(request: NextRequest) {
  const hostname = request.headers.get("host") || "";
  const appDomain = process.env.NEXT_PUBLIC_APP_DOMAIN || "localhost:3000";
  const pathname = request.nextUrl.pathname;

  // Skip middleware for static files and API routes that don't need material line context
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // Update Supabase auth session
  const { supabaseResponse, user } = await updateSession(request);

  // Check if this is a dashboard route
  const isDashboardRoute = pathname.startsWith("/dashboard");

  // For dashboard routes, check authentication
  if (isDashboardRoute) {
    // Allow access to login, signup, and invitation pages without auth
    if (
      pathname === "/dashboard/login" ||
      pathname === "/dashboard/signup" ||
      pathname.startsWith("/dashboard/invitations/")
    ) {
      // If already logged in and on login/signup, redirect to dashboard
      if (user && (pathname === "/dashboard/login" || pathname === "/dashboard/signup")) {
        const url = request.nextUrl.clone();
        url.pathname = "/dashboard";
        return NextResponse.redirect(url);
      }
      return supabaseResponse;
    }

    // For all other dashboard routes, require authentication
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }

    // For dashboard routes, don't resolve material line - dashboard handles org/material line selection
    return supabaseResponse;
  }

  // For non-dashboard routes, resolve material line from hostname
  // Skip material line resolution for localhost in development
  const isLocalhost =
    hostname.includes("localhost") || hostname.includes("127.0.0.1");

  if (!isLocalhost) {
    const materialLine = await getMaterialLineBySlugOrDomain(
      hostname,
      appDomain
    );

    if (materialLine) {
      // Inject material line context into response headers
      supabaseResponse.headers.set("x-material-line-id", materialLine.id);
      supabaseResponse.headers.set(
        "x-organization-id",
        materialLine.organization_id
      );
      supabaseResponse.headers.set("x-material-line-slug", materialLine.slug);
      supabaseResponse.headers.set(
        "x-material-line-name",
        encodeURIComponent(materialLine.name)
      );
      supabaseResponse.headers.set(
        "x-material-line-logo",
        materialLine.logo_url || ""
      );
      supabaseResponse.headers.set(
        "x-material-line-primary-color",
        materialLine.primary_color
      );
      supabaseResponse.headers.set(
        "x-material-line-accent-color",
        materialLine.accent_color
      );
      supabaseResponse.headers.set(
        "x-material-line-background-color",
        materialLine.background_color
      );
      supabaseResponse.headers.set(
        "x-material-line-folder",
        materialLine.supabase_folder
      );
    } else if (!pathname.startsWith("/api")) {
      // If no material line found and not an API route, could redirect to error page
      // For now, we'll allow access (could be main domain or localhost)
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
