import { headers } from "next/headers";
import {
  MaterialLineConfig,
  DEFAULT_MATERIAL_LINE_CONFIG,
} from "./material-line";

// Get material line config from request headers (set by middleware)
export async function getMaterialLineFromHeaders(): Promise<MaterialLineConfig> {
  const headersList = await headers();

  const materialLineId = headersList.get("x-material-line-id");

  // If no material line ID in headers, return default config
  if (!materialLineId) {
    return DEFAULT_MATERIAL_LINE_CONFIG;
  }

  // Helper to safely get header value with fallback
  const getHeaderValue = (key: string, fallback: string): string => {
    const value = headersList.get(key);
    return value && value.trim() ? value.trim() : fallback;
  };

  return {
    id: materialLineId,
    organizationId: getHeaderValue("x-organization-id", ""),
    slug: getHeaderValue("x-material-line-slug", ""),
    name: decodeURIComponent(getHeaderValue("x-material-line-name", "")),
    logoUrl: headersList.get("x-material-line-logo") || null,
    primaryColor: getHeaderValue("x-material-line-primary-color", "#2563eb"),
    backgroundColor: getHeaderValue(
      "x-material-line-background-color",
      "#ffffff"
    ),
    supabaseFolder: getHeaderValue("x-material-line-folder", "default"),
  };
}

// Helper function to normalize hex color (handles 3-digit and 6-digit hex)
function normalizeHex(hex: string | null | undefined): string {
  // Handle null, undefined, or empty strings
  if (!hex || typeof hex !== "string") {
    return "000000"; // Return black as fallback
  }

  let normalized = hex.replace("#", "").trim();

  // Validate hex format (only 0-9, a-f, A-F)
  if (!/^[0-9A-Fa-f]+$/.test(normalized)) {
    return "000000"; // Return black as fallback for invalid hex
  }

  if (normalized.length === 3) {
    // Convert 3-digit to 6-digit
    normalized = normalized
      .split("")
      .map((char) => char + char)
      .join("");
  } else if (normalized.length !== 6) {
    // If not 3 or 6 digits, pad or truncate to 6
    normalized = normalized.padStart(6, "0").substring(0, 6);
  }

  return normalized;
}

// Helper function to lighten a hex color
function lightenColor(hex: string | null | undefined, percent: number): string {
  if (!hex || typeof hex !== "string") {
    return "#2563eb"; // Default blue fallback
  }

  const normalized = normalizeHex(hex);
  const num = parseInt(normalized, 16);
  if (isNaN(num)) {
    return hex.startsWith("#") ? hex : `#${hex}`; // Return original if invalid
  }

  const r = (num >> 16) & 0xff;
  const g = (num >> 8) & 0xff;
  const b = num & 0xff;

  const newR = Math.min(255, Math.round(r + (255 - r) * percent));
  const newG = Math.min(255, Math.round(g + (255 - g) * percent));
  const newB = Math.min(255, Math.round(b + (255 - b) * percent));

  return `#${((newR << 16) | (newG << 8) | newB)
    .toString(16)
    .padStart(6, "0")}`;
}

// Helper function to darken a hex color
function darkenColor(hex: string | null | undefined, percent: number): string {
  if (!hex || typeof hex !== "string") {
    return "#1d4ed8"; // Default dark blue fallback
  }

  const normalized = normalizeHex(hex);
  const num = parseInt(normalized, 16);
  if (isNaN(num)) {
    return hex.startsWith("#") ? hex : `#${hex}`; // Return original if invalid
  }

  const r = (num >> 16) & 0xff;
  const g = (num >> 8) & 0xff;
  const b = num & 0xff;

  const newR = Math.max(0, Math.round(r * (1 - percent)));
  const newG = Math.max(0, Math.round(g * (1 - percent)));
  const newB = Math.max(0, Math.round(b * (1 - percent)));

  return `#${((newR << 16) | (newG << 8) | newB)
    .toString(16)
    .padStart(6, "0")}`;
}

// Generate CSS variables for material line theming
export function generateThemeStyles(materialLine: MaterialLineConfig): string {
  // Ensure we have valid color values (fallback to defaults if needed)
  const primaryColor = materialLine.primaryColor || "#2563eb";
  const backgroundColor = materialLine.backgroundColor || "#ffffff";

  // Generate light and dark variants for primary color
  const primaryLight = lightenColor(primaryColor, 0.3);
  const primaryDark = darkenColor(primaryColor, 0.2);

  // Generate background variants (slightly lighter/darker)
  const bgSecondary = lightenColor(backgroundColor, 0.02);

  // Log colors in development for debugging
  if (process.env.NODE_ENV === "development") {
    console.log("[Theme] Material Line Colors:", {
      id: materialLine.id,
      primaryColor,
      backgroundColor,
      primaryLight,
      primaryDark,
    });
  }

  // These styles will override globals.css because they come after in the DOM
  // CSS specificity: both are :root, so the last one wins
  return `
    :root {
      /* Primary color and variants */
      --color-primary: ${primaryColor};
      --color-primary-light: ${primaryLight};
      --color-primary-dark: ${primaryDark};
      
      /* Accent uses primary color */
      --color-accent: ${primaryColor};
      --color-accent-light: ${primaryLight};
      --color-accent-dark: ${primaryDark};
      
      /* Background colors */
      --color-bg: ${backgroundColor};
      --color-bg-secondary: ${bgSecondary};
      --color-bg-card: ${backgroundColor};
    }
    
    /* Debug info - visible in dev mode */
    ${
      process.env.NODE_ENV === "development"
        ? `
    body::before {
      content: "Theme Debug: Primary=${primaryColor} BG=${backgroundColor}";
      position: fixed;
      top: 0;
      left: 0;
      background: rgba(0,0,0,0.9);
      color: white;
      padding: 4px 8px;
      font-size: 10px;
      font-family: monospace;
      z-index: 9999;
      pointer-events: none;
      white-space: pre;
    }
    `
        : ""
    }
  `;
}
