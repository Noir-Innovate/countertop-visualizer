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
  display_title: string | null;
  custom_domain: string | null;
  custom_domain_verified: boolean;
  logo_url: string | null;
  primary_color: string;
  accent_color: string;
  background_color: string;
  supabase_folder: string;
}

interface MaterialLineWithKitchens extends MaterialLineConfig {
  kitchen_images: Array<{
    id: string;
    filename: string;
    title: string | null;
    order: number;
  }>;
}

async function getMaterialLineBySlugOrDomain(
  hostname: string,
  appDomain: string,
): Promise<MaterialLineWithKitchens | null> {
  // Check cache first
  const cached = materialLineCache.get(hostname);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.materialLine as MaterialLineWithKitchens | null;
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
    },
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

  // If we found a material line, fetch its kitchen images
  let materialLineWithKitchens: MaterialLineWithKitchens | null = null;
  if (materialLine) {
    const { data: kitchenImagesData } = await supabase
      .from("kitchen_images")
      .select("id, filename, title, order")
      .eq("material_line_id", materialLine.id)
      .order("order", { ascending: true });

    materialLineWithKitchens = {
      ...materialLine,
      kitchen_images: kitchenImagesData || [],
    };
  }

  // Cache the result
  materialLineCache.set(hostname, {
    materialLine: materialLineWithKitchens,
    timestamp: Date.now(),
  });

  return materialLineWithKitchens;
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
      if (
        user &&
        (pathname === "/dashboard/login" || pathname === "/dashboard/signup")
      ) {
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

  // For /admin routes, require authentication (super_admin check happens in admin layout)
  if (pathname.startsWith("/admin")) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  // For non-dashboard routes, resolve material line from hostname
  // Allow subdomain testing on localhost (e.g., subdomain.localhost:3000)
  const isLocalhost =
    hostname.includes("localhost") || hostname.includes("127.0.0.1");
  const isLocalhostSubdomain =
    isLocalhost && hostname.includes(".") && !hostname.startsWith("www.");

  // Resolve material line for subdomains (including localhost subdomains)
  if (!isLocalhost || isLocalhostSubdomain) {
    // For localhost subdomains, extract the port from hostname or use default
    let effectiveAppDomain = appDomain;
    if (isLocalhostSubdomain) {
      // Extract port from hostname (e.g., "subdomain.localhost:3000" -> "localhost:3000")
      const portMatch = hostname.match(/:(\d+)$/);
      const port = portMatch ? portMatch[1] : "3000";
      effectiveAppDomain = `localhost:${port}`;
    }
    const materialLine = await getMaterialLineBySlugOrDomain(
      hostname,
      effectiveAppDomain,
    );

    if (materialLine) {
      // Inject material line context into response headers
      supabaseResponse.headers.set("x-material-line-id", materialLine.id);
      supabaseResponse.headers.set(
        "x-organization-id",
        materialLine.organization_id,
      );
      supabaseResponse.headers.set("x-material-line-slug", materialLine.slug);
      // Use display_title for public-facing pages, fallback to name
      const displayName = materialLine.display_title || materialLine.name;
      supabaseResponse.headers.set(
        "x-material-line-name",
        encodeURIComponent(displayName),
      );
      supabaseResponse.headers.set(
        "x-material-line-logo",
        materialLine.logo_url || "",
      );
      supabaseResponse.headers.set(
        "x-material-line-primary-color",
        materialLine.primary_color,
      );
      supabaseResponse.headers.set(
        "x-material-line-accent-color",
        materialLine.accent_color,
      );
      supabaseResponse.headers.set(
        "x-material-line-background-color",
        materialLine.background_color,
      );
      supabaseResponse.headers.set(
        "x-material-line-folder",
        materialLine.supabase_folder,
      );
      // Add kitchen images as JSON-encoded string
      supabaseResponse.headers.set(
        "x-material-line-kitchen-images",
        JSON.stringify(materialLine.kitchen_images || []),
      );
    } else if (!pathname.startsWith("/api")) {
      // If no material line found and not an API route, could redirect to error page
      // For now, we'll allow access (could be main domain or localhost)
    }
  } else {
    // Plain localhost without subdomain - use default behavior (no material line)
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
