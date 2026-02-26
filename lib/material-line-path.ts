export type MaterialLineKind = "external" | "internal";

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
