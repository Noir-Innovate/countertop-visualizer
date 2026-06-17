export type MaterialLineKind = "external" | "internal";

/**
 * Canonical public URL for the material line visualizer (subdomain or verified custom domain).
 * Internal lines use the v2-based experience at `/internal`, unless the line is
 * access-locked — locked internal lines forward to the authenticated `/sales`
 * portal, so that is their canonical entry point.
 */
export function getPublicVisualizerUrl(
  lineKind: MaterialLineKind | null | undefined,
  slug: string,
  customDomain: string | null,
  customDomainVerified: boolean,
  appDomain: string,
  accessLocked: boolean = false,
): string {
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
