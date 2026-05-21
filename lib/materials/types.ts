export interface MaterialTypeOption {
  value: string;
  label: string;
}

// Material-type taxonomy used by the slabs editor (upload form + filter) and
// by the /internal visualizer search bar. "none" is the sentinel for "no
// type set" — stored as NULL in the DB.
export const MATERIAL_TYPES: readonly MaterialTypeOption[] = [
  { value: "none", label: "None" },
  { value: "Granite", label: "Granite" },
  { value: "Quartz", label: "Quartz" },
  { value: "Quartzite", label: "Quartzite" },
  { value: "Marble", label: "Marble" },
  { value: "Soapstone", label: "Soapstone" },
  { value: "Porcelain", label: "Porcelain" },
  { value: "Solid Surface", label: "Solid Surface" },
  { value: "Laminate", label: "Laminate" },
  { value: "Other", label: "Other" },
] as const;

// Same list with the "none" sentinel stripped — for filter dropdowns where
// the empty option already means "any type".
export const MATERIAL_TYPE_FILTER_OPTIONS = MATERIAL_TYPES.filter(
  (t) => t.value !== "none",
);
