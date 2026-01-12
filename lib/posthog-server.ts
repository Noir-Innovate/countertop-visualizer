/**
 * Server-side PostHog API helper functions
 * Used for querying analytics data in dashboard pages
 *
 * Required environment variables:
 * - POSTHOG_API_KEY: PostHog Personal API Key with query:read permissions
 * - POSTHOG_PROJECT_ID: Your PostHog project ID (numeric)
 * - NEXT_PUBLIC_POSTHOG_HOST: PostHog host URL (e.g., https://app.posthog.com or https://us.i.posthog.com)
 */

interface PostHogEventCountParams {
  eventName: string;
  materialLineIds?: string[];
  organizationId?: string;
  startDate?: Date;
  endDate?: Date;
}

// Cache project ID to avoid repeated API calls
let cachedProjectId: string | null = null;

/**
 * Get PostHog project ID from API or environment variables
 */
async function getPostHogProjectId(): Promise<string | null> {
  // Check cache first
  if (cachedProjectId) {
    return cachedProjectId;
  }

  // Check environment variable - only use POSTHOG_PROJECT_ID
  const envProjectId = process.env.POSTHOG_PROJECT_ID;

  if (envProjectId) {
    // Validate it's not an API key (API keys start with phc_ or phx_)
    if (!envProjectId.startsWith("phc_") && !envProjectId.startsWith("phx_")) {
      cachedProjectId = envProjectId;
      return envProjectId;
    } else {
      console.warn(
        "[PostHog] POSTHOG_PROJECT_ID appears to be an API key, not a project ID. " +
          "Project IDs are numeric or UUIDs. Attempting to fetch project ID from API..."
      );
    }
  }

  // Try to extract from API key format (some PostHog keys contain project info)
  const apiKey = process.env.POSTHOG_API_KEY;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

  if (!apiKey) {
    return null;
  }

  // Try to fetch project ID from PostHog API
  // Personal API keys are scoped to a project, so we can query the user/me endpoint
  try {
    // Try /api/users/@me/ to get user info which might include project
    const userResponse = await fetch(`${host}/api/users/@me/`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (userResponse.ok) {
      const userData = await userResponse.json();
      // Check if user data contains project information
      if (userData.team?.organization?.projects?.[0]?.id) {
        const projectId = userData.team.organization.projects[0].id.toString();
        cachedProjectId = projectId;
        return projectId;
      }
    }

    // Alternative: Try /api/projects/ endpoint
    const projectsResponse = await fetch(`${host}/api/projects/`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (projectsResponse.ok) {
      const projectsData = await projectsResponse.json();

      // Debug: log the response structure
      if (process.env.NODE_ENV === "development") {
        console.log(
          "[PostHog] Projects API response:",
          JSON.stringify(projectsData, null, 2)
        );
      }

      // Handle both paginated and non-paginated responses
      const projects =
        projectsData.results ||
        (Array.isArray(projectsData) ? projectsData : []);
      if (projects.length > 0) {
        // Personal API keys are typically scoped to one project
        // Project ID can be in 'id' field (numeric) or 'uuid' field
        const project = projects[0];
        const projectId =
          project.id?.toString() ||
          project.uuid ||
          project.project_id?.toString();

        if (projectId) {
          console.log(
            `[PostHog] Successfully fetched project ID from API: ${projectId}`
          );
          cachedProjectId = projectId;
          return projectId;
        } else {
          console.warn(
            "[PostHog] Project found but no ID field detected. Project structure:",
            Object.keys(project)
          );
        }
      } else {
        console.warn(
          "[PostHog] No projects found in API response. Make sure your API key has access to projects."
        );
      }
    } else {
      const errorText = await projectsResponse.text().catch(() => "");
      console.warn(
        `[PostHog] Could not fetch projects: ${projectsResponse.status} ${projectsResponse.statusText}`,
        errorText
      );
    }
  } catch (error) {
    console.warn("[PostHog] Could not fetch project ID from API:", error);
  }

  return null;
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
      // Use toDateTime() function to convert string to DateTime in HogQL
      conditions.push(
        `timestamp >= toDateTime('${startDate
          .toISOString()
          .replace("T", " ")
          .replace("Z", "")}')`
      );
    }

    if (endDate) {
      conditions.push(
        `timestamp <= toDateTime('${endDate
          .toISOString()
          .replace("T", " ")
          .replace("Z", "")}')`
      );
    }

    const whereClause = conditions.join(" AND ");

    // Construct HogQL query
    // Note: PostHog properties are accessed via JSONExtractString or direct property access
    const query = `SELECT count() as event_count FROM events WHERE ${whereClause}`;

    // Get project ID (from env or API)
    const projectId = await getPostHogProjectId();

    if (!projectId) {
      console.error(
        "[PostHog] Could not determine project ID.\n" +
          "Please set POSTHOG_PROJECT_ID environment variable.\n" +
          "\n" +
          "To find your Project ID:\n" +
          "1. Go to your PostHog dashboard: " +
          (host || "https://app.posthog.com") +
          "\n" +
          "2. Navigate to Project Settings (or check the URL)\n" +
          "3. The Project ID is a NUMBER (not phc_...), shown in:\n" +
          "   - URL: /project/12345/ (12345 is the project ID)\n" +
          "   - Project Settings page\n" +
          "\n" +
          "NOTE: Project ID is NOT the same as your API key (phc_...)\n" +
          "The Project ID is a numeric identifier for your project."
      );
      return 0;
    }

    // Validate project ID format (should not be an API key)
    if (projectId.startsWith("phc_") || projectId.startsWith("phx_")) {
      console.error(
        `[PostHog] Invalid project ID format: ${projectId}\n` +
          "This appears to be an API key, not a project ID.\n" +
          "Project IDs are numeric (e.g., 12345) or UUIDs, not API keys (phc_...)."
      );
      return 0;
    }

    // Make request to PostHog Query API
    // Based on error: query object needs a 'kind' discriminator field
    // Format: { "query": { "kind": "HogQLQuery", "query": "SELECT ..." } }
    const response = await fetch(`${host}/api/projects/${projectId}/query/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query: {
          kind: "HogQLQuery",
          query: query,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorDetails = errorText;
      try {
        const errorJson = JSON.parse(errorText);
        errorDetails = JSON.stringify(errorJson, null, 2);
      } catch {
        // Keep as text if not JSON
      }

      console.error(
        `[PostHog] Query failed: ${response.status} ${response.statusText}`,
        `\nProject ID used: ${projectId}`,
        `\nHost: ${host}`,
        `\nError: ${errorDetails}`
      );

      // If project not found, clear cache to retry fetching
      if (response.status === 404) {
        cachedProjectId = null;
      }

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
