import { NextRequest, NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getPostHogEventCount } from "@/lib/posthog-server";

// Cache PostHog responses for 5 minutes
const CACHE_REVALIDATE_SECONDS = 60 * 5; // 5 minutes

async function fetchEventCountUncached(
  eventName: string,
  materialLineId: string,
  days: number,
  userId: string,
) {
  // Calculate date range
  const now = new Date();
  const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  // Fetch event count
  const count = await getPostHogEventCount({
    eventName,
    materialLineIds: [materialLineId],
    startDate,
  });

  return count;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const eventName = searchParams.get("eventName");
    const materialLineId = searchParams.get("materialLineId");
    const days = parseInt(searchParams.get("days") || "30", 10);
    const forceRefresh = searchParams.get("forceRefresh") === "true";

    if (!eventName || !materialLineId) {
      return NextResponse.json(
        { error: "eventName and materialLineId are required" },
        { status: 400 },
      );
    }

    // Verify authentication
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user has access to this material line
    const { data: materialLine } = await supabase
      .from("material_lines")
      .select("organization_id")
      .eq("id", materialLineId)
      .single();

    if (!materialLine) {
      return NextResponse.json(
        { error: "Material line not found" },
        { status: 404 },
      );
    }

    const { data: membership } = await supabase
      .from("organization_members")
      .select("role")
      .eq("profile_id", user.id)
      .eq("organization_id", materialLine.organization_id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Create cache key based on parameters
    const cacheKey = `event-count-${eventName}-${materialLineId}-${days}-${user.id}`;

    // Fetch with caching (unless force refresh)
    let count: number;
    if (forceRefresh) {
      count = await fetchEventCountUncached(
        eventName,
        materialLineId,
        days,
        user.id,
      );
    } else {
      const cachedFetch = unstable_cache(
        async () =>
          fetchEventCountUncached(eventName, materialLineId, days, user.id),
        [cacheKey],
        {
          revalidate: CACHE_REVALIDATE_SECONDS,
          tags: [`analytics-${materialLineId}`, `analytics-${eventName}`],
        },
      );
      count = await cachedFetch();
    }

    // Set cache headers for client-side caching
    const response = NextResponse.json({ count });
    response.headers.set(
      "Cache-Control",
      `public, s-maxage=${CACHE_REVALIDATE_SECONDS}, stale-while-revalidate=60`,
    );

    return response;
  } catch (error) {
    console.error("Error fetching event count:", error);
    return NextResponse.json(
      { error: "Failed to fetch event count" },
      { status: 500 },
    );
  }
}
