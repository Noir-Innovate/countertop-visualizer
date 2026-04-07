export type MaterialLineKind = "external" | "internal";

/**
 * Canonical public URL for the material line visualizer (subdomain or verified custom domain).
 * Internal lines use the v2-based experience at `/internal`.
 */
export function getPublicVisualizerUrl(
  lineKind: MaterialLineKind | null | undefined,
  slug: string,
  customDomain: string | null,
  customDomainVerified: boolean,
  appDomain: string,
): string {
  const base =
    customDomain && customDomainVerified
      ? `https://${customDomain}`
      : `https://${slug}.${appDomain}`;
  if (lineKind === "internal") {
    return `${base}/internal`;
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
