/**
 * Formats a role enum value for display.
 * Converts snake_case to Title Case (e.g., "sales_person" -> "Sales Person")
 */
export function formatRole(role: string): string {
  return role
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
