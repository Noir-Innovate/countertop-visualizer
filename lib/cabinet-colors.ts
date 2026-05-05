// Default cabinet paint swatches seeded onto every new material line.
// Mirrors the values applied to existing rows in migration 056.
export const DEFAULT_CABINET_COLORS: Array<{ name: string; hex: string }> = [
  { name: "Pure White", hex: "#FFFFFF" },
  { name: "Soft White", hex: "#F2F0EB" },
  { name: "Antique White", hex: "#EBE6DC" },
  { name: "Cream", hex: "#F0E6D2" },
  { name: "Light Gray", hex: "#C8C8C8" },
  { name: "Greige", hex: "#A8A29E" },
  { name: "Warm Taupe", hex: "#8B7355" },
  { name: "Charcoal", hex: "#4A4A4A" },
  { name: "Espresso", hex: "#3E2723" },
  { name: "True Black", hex: "#1A1A1A" },
  { name: "Navy", hex: "#1E3A5F" },
  { name: "Slate Blue", hex: "#4A6B8A" },
  { name: "Sage", hex: "#9CAF88" },
  { name: "Hunter Green", hex: "#2D4A3E" },
];

export const DEFAULT_CATEGORY_COLORS = {
  Cabinets: DEFAULT_CABINET_COLORS,
} as const;
