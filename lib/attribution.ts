/**
 * Lead attribution: capture UTM params, referrer, and custom tags on first visit
 * and persist in sessionStorage so they're available when the user submits the form.
 */

const STORAGE_KEY = "lead_attribution";

const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
] as const;

/**
 * Query param keys that are stored as tags (not UTM). A param is captured if its key
 * equals one of these or starts with one + "_" (e.g. "source", "source_campaign").
 * Export so the tracking-link builder can restrict inputs to these keys.
 */
export const TAG_PARAM_PREFIXES = [
  "tag",
  "ref",
  "sales_rep",
  "promo",
  "source",
] as const;

/** Use in the tracking-link builder to only allow keys that will be captured on the visitor side */
export function isAllowedTagKey(key: string): boolean {
  const lower = key.toLowerCase().trim();
  if (!lower) return false;
  return TAG_PARAM_PREFIXES.some(
    (p) => lower === p || lower.startsWith(p + "_"),
  );
}

export interface AttributionData {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  referrer: string | null;
  tags: Record<string, string>;
}

const EMPTY_ATTRIBUTION: AttributionData = {
  utm_source: null,
  utm_medium: null,
  utm_campaign: null,
  utm_term: null,
  utm_content: null,
  referrer: null,
  tags: {},
};

/**
 * Parse URL search string into UTM fields and custom tags.
 */
export function getAttributionFromSearchParams(
  search: string,
): Partial<AttributionData> {
  if (typeof search !== "string" || !search.startsWith("?")) {
    return { tags: {} };
  }
  const params = new URLSearchParams(search);
  const result: Partial<AttributionData> = {
    utm_source: params.get("utm_source") || null,
    utm_medium: params.get("utm_medium") || null,
    utm_campaign: params.get("utm_campaign") || null,
    utm_term: params.get("utm_term") || null,
    utm_content: params.get("utm_content") || null,
    tags: {},
  };
  params.forEach((value, key) => {
    if (isAllowedTagKey(key)) {
      result.tags![key] = value;
    }
  });
  return result;
}

/**
 * Read stored attribution from sessionStorage.
 */
export function getStoredAttribution(): AttributionData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AttributionData;
    return {
      ...EMPTY_ATTRIBUTION,
      ...parsed,
      tags: parsed.tags && typeof parsed.tags === "object" ? parsed.tags : {},
    };
  } catch {
    return null;
  }
}

/**
 * First-touch: if no attribution is stored, capture from current URL and referrer
 * and persist to sessionStorage.
 */
export function captureAndPersistAttribution(): void {
  if (typeof window === "undefined") return;
  try {
    if (sessionStorage.getItem(STORAGE_KEY)) return;
    const fromParams = getAttributionFromSearchParams(window.location.search);
    const referrer =
      typeof document !== "undefined" && document.referrer
        ? document.referrer
        : null;
    const data: AttributionData = {
      utm_source: fromParams.utm_source ?? null,
      utm_medium: fromParams.utm_medium ?? null,
      utm_campaign: fromParams.utm_campaign ?? null,
      utm_term: fromParams.utm_term ?? null,
      utm_content: fromParams.utm_content ?? null,
      referrer: referrer || null,
      tags: fromParams.tags ?? {},
    };
    const hasAny =
      data.utm_source ||
      data.utm_medium ||
      data.utm_campaign ||
      data.utm_term ||
      data.utm_content ||
      data.referrer ||
      Object.keys(data.tags).length > 0;
    if (hasAny) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }
  } catch {
    // ignore
  }
}
