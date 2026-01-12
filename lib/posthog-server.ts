/**
 * Server-side PostHog API helper functions
 * Used for querying analytics data in dashboard pages
 *
 * Required environment variables:
 * - POSTHOG_API_KEY: PostHog Personal API Key with query:read permissions
 * - POSTHOG_PROJECT_ID or NEXT_PUBLIC_POSTHOG_PROJECT_ID: Your PostHog project ID
 * - NEXT_PUBLIC_POSTHOG_HOST: PostHog host URL (e.g., https://app.posthog.com or https://us.i.posthog.com)
 */

interface PostHogEventCountParams {
  eventName: string;
  materialLineIds?: string[];
  organizationId?: string;
  startDate?: Date;
  endDate?: Date;
}

/**
 * Get count of events from PostHog using HogQL query
 */
export async function getPostHogEventCount({
  eventName,
  materialLineIds,
  organizationId,
  startDate,
  endDate,
}: PostHogEventCountParams): Promise<number> {
  const apiKey = process.env.POSTHOG_API_KEY;
  const host =
    process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://app.posthog.com";

  if (!apiKey) {
    console.warn("[PostHog] POSTHOG_API_KEY not set, returning 0");
    return 0;
  }

  try {
    // Build WHERE conditions
    const conditions: string[] = [`event = '${eventName.replace(/'/g, "''")}'`];

    if (materialLineIds && materialLineIds.length > 0) {
      // Escape single quotes in IDs and build IN clause
      // PostHog properties are JSON, use JSONExtractString for safe access
      const escapedIds = materialLineIds
        .map((id) => `'${id.replace(/'/g, "''")}'`)
        .join(", ");
      conditions.push(
        `JSONExtractString(properties, 'materialLineId') IN (${escapedIds})`
      );
    } else if (materialLineIds && materialLineIds.length === 0) {
      // If empty array provided, return 0 (no material lines to query)
      return 0;
    }

    if (organizationId) {
      const escapedOrgId = organizationId.replace(/'/g, "''");
      conditions.push(
        `JSONExtractString(properties, 'organizationId') = '${escapedOrgId}'`
      );
    }

    if (startDate) {
      conditions.push(`timestamp >= '${startDate.toISOString()}'`);
    }

    if (endDate) {
      conditions.push(`timestamp <= '${endDate.toISOString()}'`);
    }

    const whereClause = conditions.join(" AND ");

    // Construct HogQL query
    // Note: PostHog properties are accessed via JSONExtractString or direct property access
    const query = `SELECT count() as event_count FROM events WHERE ${whereClause}`;

    // Get project ID from environment variable
    // PostHog requires project ID for API queries
    const projectId =
      process.env.NEXT_PUBLIC_POSTHOG_PROJECT_ID ||
      process.env.POSTHOG_PROJECT_ID;

    if (!projectId) {
      console.warn(
        "[PostHog] POSTHOG_PROJECT_ID or NEXT_PUBLIC_POSTHOG_PROJECT_ID not set, returning 0"
      );
      return 0;
    }

    // Make request to PostHog Query API
    const response = await fetch(`${host}/api/projects/${projectId}/query/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        kind: "HogQLQuery",
        query,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(
        `[PostHog] Query failed: ${response.status} ${response.statusText}`,
        errorText
      );
      return 0;
    }

    const data = await response.json();

    // Extract count from result
    // PostHog Query API returns results in format: { results: [[count]], ... }
    if (
      data.results &&
      Array.isArray(data.results) &&
      data.results.length > 0
    ) {
      const firstResult = data.results[0];
      // Results can be array of arrays or array of objects
      if (Array.isArray(firstResult) && firstResult.length > 0) {
        return Number(firstResult[0]) || 0;
      } else if (
        typeof firstResult === "object" &&
        firstResult.event_count !== undefined
      ) {
        return Number(firstResult.event_count) || 0;
      } else if (typeof firstResult === "number") {
        return firstResult;
      }
    }

    return 0;
  } catch (error) {
    console.error("[PostHog] Error querying events:", error);
    return 0;
  }
}

/**
 * Get multiple event counts in parallel
 */
export async function getPostHogEventCounts(
  params: PostHogEventCountParams[]
): Promise<number[]> {
  return Promise.all(params.map((param) => getPostHogEventCount(param)));
}
