// Derive a short, brand-like material-line name from data scraped off the
// fabricator's website, so we don't fall back to an ugly "<Org> Internal".

const GENERIC_SEGMENT =
  /^(home|welcome|index|homepage|home ?page|main|untitled|loading)$/i;

function clampWords(value: string, maxWords: number): string {
  const words = value.replace(/\s+/g, " ").trim().split(" ");
  return words.slice(0, maxWords).join(" ");
}

/**
 * Turn a scraped page title into a short, sweet line name.
 *
 * Fabricator titles look like "Home | ABC Stone",
 * "ABC Stone - Countertops in Dallas, TX", or
 * "Calacatta Countertops | ABC Granite & Quartz". We split on common title
 * separators, drop generic/navigational segments ("Home", "Welcome", …), and
 * keep the shortest remaining segment — the brand is almost always shorter
 * than the descriptive tagline. The result is capped to a few words.
 *
 * Falls back to the organization name when there's no usable title.
 */
export function deriveMaterialLineName(
  title: string | null | undefined,
  orgName: string,
): string {
  const fallback = (orgName ?? "").trim() || "My Material Line";
  if (!title) return fallback;

  const segments = title
    .split(/\s*[|\-–—•·:>»]\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !GENERIC_SEGMENT.test(s));

  if (segments.length === 0) return fallback;

  // Brand names are typically the shortest non-generic segment.
  const brand = segments.reduce((a, b) => (b.length < a.length ? b : a));

  const cleaned = clampWords(brand, 4);
  return cleaned || fallback;
}
