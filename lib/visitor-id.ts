// Persistent anonymous visitor identifier. Lives in localStorage (primary)
// and a long-lived cookie (mirror) so anonymous page views can be stitched
// to a single visitor across sessions, and across the signup boundary where
// profile_id becomes available.

const STORAGE_KEY = "v_id";
const COOKIE_KEY = "v_id";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365 * 2; // 2 years

function generateUuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers.
  return "v_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function readCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${COOKIE_KEY}=([^;]+)`),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(value: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${COOKIE_KEY}=${encodeURIComponent(value)}; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
}

/**
 * Returns the visitor id, minting one on first call. Safe to call from any
 * client-side code; no-ops to a fresh id if invoked on the server (which
 * shouldn't happen — server-side code should use `recordEventServer` with
 * its own context).
 */
export function getVisitorId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      // Refresh the cookie mirror so it doesn't lapse.
      writeCookie(stored);
      return stored;
    }
    const fromCookie = readCookie();
    if (fromCookie) {
      window.localStorage.setItem(STORAGE_KEY, fromCookie);
      return fromCookie;
    }
    const fresh = generateUuid();
    window.localStorage.setItem(STORAGE_KEY, fresh);
    writeCookie(fresh);
    return fresh;
  } catch {
    // localStorage can throw in some private-browsing modes — fall back to
    // a cookie-only round-trip and accept that the id may not persist if
    // cookies are also blocked.
    const fromCookie = readCookie();
    if (fromCookie) return fromCookie;
    const fresh = generateUuid();
    writeCookie(fresh);
    return fresh;
  }
}
