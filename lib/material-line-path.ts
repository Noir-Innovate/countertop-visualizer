export type MaterialLineKind = "external" | "internal";

export interface PublicVisualizerUrlParams {
  lineKind: MaterialLineKind | null | undefined;
  slug: string;
  customDomain: string | null;
  customDomainVerified: boolean;
  appDomain: string;
  accessLocked?: boolean;
  /**
   * Organization slug — required to build the path-based sales URL for
   * access-locked internal lines. When omitted, those lines fall back to the
   * legacy subdomain `/sales` entry point.
   */
  orgSlug?: string | null;
  /**
   * Origin of the main app (e.g. https://www.countertopvisualizer.com).
   * Defaults to NEXT_PUBLIC_APP_URL. Used for the path-based sales URL.
   */
  appBaseUrl?: string | null;
}

/**
 * Canonical public URL for the material line visualizer.
 *
 * - External lines → subdomain (or verified custom domain).
 * - Internal lines that are NOT access-locked → subdomain `/internal` (legacy
 *   public v2 experience).
 * - Internal lines that ARE access-locked ("sales" lines) → the path-based
 *   portal on the main app domain, `/{orgSlug}/{lineSlug}/sales`. This keeps
 *   the user's existing session (subdomains have their own cookie scope and
 *   would force a second sign-in). Falls back to the subdomain `/sales` only
 *   when no orgSlug is available.
 */
export function getPublicVisualizerUrl(
  params: PublicVisualizerUrlParams,
): string {
  const {
    lineKind,
    slug,
    customDomain,
    customDomainVerified,
    appDomain,
    accessLocked = false,
    orgSlug,
    appBaseUrl = process.env.NEXT_PUBLIC_APP_URL ?? null,
  } = params;

  if (lineKind === "internal" && accessLocked && orgSlug) {
    const mainBase = (appBaseUrl || `https://${appDomain}`).replace(/\/+$/, "");
    return `${mainBase}/${orgSlug}/${slug}/sales`;
  }

  const base =
    customDomain && customDomainVerified
      ? `https://${customDomain}`
      : `https://${slug}.${appDomain}`;
  if (lineKind === "internal") {
    return accessLocked ? `${base}/sales` : `${base}/internal`;
  }
  return base;
}

export function getMaterialLineBasePath(
  orgId: string,
  materialLineId: string,
  lineKind: MaterialLineKind | null | undefined,
) {
  if (lineKind === "internal") {
    return `/dashboard/organizations/${orgId}/material-lines/internal/${materialLineId}`;
  }

  return `/dashboard/organizations/${orgId}/material-lines/${materialLineId}`;
}
