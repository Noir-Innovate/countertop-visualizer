/**
 * Thin wrapper around the Firecrawl v1 scrape API.
 *
 * Auth: pass FIRECRAWL_API_KEY as Bearer token.
 *
 * We only use the single-page /scrape endpoint (no crawl) for v1 of onboarding.
 * Crawl is async and adds polling complexity; in practice the homepage gives us
 * enough to seed the wizard, and the user can manually upload anything missing.
 */

import sharp from "sharp";

const FIRECRAWL_BASE_URL = "https://api.firecrawl.dev/v2";
const FIRECRAWL_TIMEOUT_MS = 90_000;
const SCREENSHOT_FETCH_TIMEOUT_MS = 15_000;

export interface FirecrawlScrapeResult {
  /** Image URLs that look like logo candidates (og:image, favicon, alt*=logo). */
  logoCandidates: string[];
  /** All other <img> URLs found on the page, deduped. */
  imageCandidates: string[];
  /** Top distinct brand color candidates, ordered by score (most likely first). */
  colorCandidates: string[];
  /** Best single guess — colorCandidates[0], or null if nothing chromatic was found. */
  primaryColor: string | null;
  /** The page's title, useful for seeding material-line names. */
  title: string | null;
}

const MAX_COLOR_CANDIDATES = 5;
const NEAR_DUPLICATE_DISTANCE = 40;

interface FirecrawlScrapeApiResponse {
  success: boolean;
  data?: {
    html?: string;
    markdown?: string;
    screenshot?: string;
    metadata?: {
      title?: string;
      description?: string;
      ogImage?: string;
      ogTitle?: string;
      favicon?: string;
      sourceURL?: string;
      [k: string]: unknown;
    };
  };
  error?: string;
}

export async function scrapeHomepage(
  url: string,
): Promise<FirecrawlScrapeResult> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    throw new Error("FIRECRAWL_API_KEY is not configured");
  }

  console.log("[firecrawl] POST /v2/scrape", { url });
  const t0 = Date.now();
  let res: Response;
  try {
    res = await fetch(`${FIRECRAWL_BASE_URL}/scrape`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        url,
        formats: ["html", "screenshot"],
        onlyMainContent: false,
        timeout: 60000,
      }),
      signal: AbortSignal.timeout(FIRECRAWL_TIMEOUT_MS),
    });
  } catch (err) {
    throw new Error(
      `Firecrawl request failed/timed out after ${Date.now() - t0}ms: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  console.log("[firecrawl] response", { status: res.status, ms: Date.now() - t0 });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Firecrawl scrape failed: ${res.status} ${text}`);
  }

  const json = (await res.json()) as FirecrawlScrapeApiResponse;
  if (!json.success || !json.data) {
    throw new Error(json.error ?? "Firecrawl returned unsuccessful response");
  }

  const html = json.data.html ?? "";
  const metadata = json.data.metadata ?? {};
  const baseUrl = (metadata.sourceURL as string | undefined) ?? url;

  // Pre-extraction diagnostics: what raw signals does the HTML carry?
  const inlineSvgCount = (html.match(/<svg\b/gi) ?? []).length;
  const linkIconCount = (html.match(/<link\b[^>]*rel\s*=\s*["'][^"']*icon[^"']*["']/gi) ?? []).length;
  const imgTagCount = (html.match(/<img\b/gi) ?? []).length;
  const pictureCount = (html.match(/<picture\b/gi) ?? []).length;
  const sourceTagCount = (html.match(/<source\b/gi) ?? []).length;
  const styleBgCount = (html.match(/background-image\s*:\s*url\(/gi) ?? []).length;
  console.log("[firecrawl] html signal counts", {
    htmlBytes: html.length,
    inlineSvgCount,
    linkIconCount,
    imgTagCount,
    pictureCount,
    sourceTagCount,
    styleBgCount,
    metadataKeys: Object.keys(metadata),
    metadataOgImage: metadata.ogImage ?? null,
    metadataFavicon: metadata.favicon ?? null,
  });

  const { logoCandidates, imageCandidates } = extractImagesFromHtml(
    html,
    metadata,
    baseUrl,
  );
  console.log("[firecrawl] extracted images", {
    logos: logoCandidates.length,
    images: imageCandidates.length,
    hasScreenshot: Boolean(json.data.screenshot),
  });
  // Full URL dumps so we can see exactly what the picker will show vs miss.
  console.log("[firecrawl] logo candidate URLs", logoCandidates);
  console.log("[firecrawl] image candidate URLs", imageCandidates);

  // Aggregate brand color candidates from three sources, weighted so signal
  // from CSS literals (the brand's actual chosen colors) and logo pixels
  // (always intentional) beats screenshot pixels (which include lots of UI
  // chrome that's irrelevant to brand identity).
  const buckets = new ScoreBuckets();

  // 1) HTML/CSS hex + rgb() literals — buttons, links, inline styles, <style>
  //    blocks. These are *the* brand colors as the site author declared them.
  buckets.addMany(extractColorsFromHtml(html), 3.0);
  console.log("[firecrawl] html color literals", {
    count: buckets.size(),
  });

  // 2) Every logo image — logos almost always carry the real brand color.
  for (const logoUrl of logoCandidates) {
    const fromLogo = await extractCandidateColors(logoUrl);
    buckets.addMany(fromLogo, 2.0);
    console.log("[firecrawl] logo colors", { logoUrl, count: fromLogo.length });
  }

  // 3) Screenshot — broad coverage, weakest weight.
  if (json.data.screenshot) {
    const fromScreenshot = await extractCandidateColors(json.data.screenshot);
    buckets.addMany(fromScreenshot, 1.0);
    console.log("[firecrawl] screenshot colors", {
      count: fromScreenshot.length,
    });
  }

  const colorCandidates = buckets.topDistinct(MAX_COLOR_CANDIDATES);
  console.log("[firecrawl] final color candidates", { colorCandidates });

  return {
    logoCandidates,
    imageCandidates,
    colorCandidates,
    primaryColor: colorCandidates[0] ?? null,
    title: (metadata.title ?? metadata.ogTitle ?? null) as string | null,
  };
}

// Extract image URLs from HTML, separating logo-candidates from material-candidates.
function extractImagesFromHtml(
  html: string,
  metadata: Record<string, unknown>,
  baseUrl: string,
): { logoCandidates: string[]; imageCandidates: string[] } {
  const logoSet = new Set<string>();
  const allImages = new Set<string>();

  // Reject anything that isn't fetchable from a public URL — we've seen
  // file:/// paths sneak in via stale references in site manifests.
  function isFetchable(u: string): boolean {
    return /^https?:\/\//i.test(u);
  }
  function addLogo(u: string) {
    if (isFetchable(u)) logoSet.add(u);
  }
  function addImage(u: string) {
    if (isFetchable(u)) allImages.add(u);
  }

  // 1) og:image is the social-share hero, NOT necessarily the logo — on
  // GoHighLevel/Squarespace/etc it's usually a kitchen photo. File it as a
  // generic image candidate; promote to logo only if its URL hints at one.
  if (typeof metadata.ogImage === "string") {
    const abs = absoluteUrl(metadata.ogImage, baseUrl);
    addImage(abs);
    if (/logo|brand|mark/i.test(abs)) addLogo(abs);
  }
  if (typeof metadata.favicon === "string") {
    addLogo(absoluteUrl(metadata.favicon, baseUrl));
  }

  // 2) <link rel="...icon..." href="..."> — catches SVG favicons and
  // apple-touch-icons that don't show up via metadata.favicon.
  const linkRegex = /<link\b[^>]*>/gi;
  const relRegex = /\brel\s*=\s*["']([^"']+)["']/i;
  const hrefRegex = /\bhref\s*=\s*["']([^"']+)["']/i;
  let linkMatch: RegExpExecArray | null;
  while ((linkMatch = linkRegex.exec(html)) !== null) {
    const tag = linkMatch[0];
    const rel = relRegex.exec(tag)?.[1]?.toLowerCase() ?? "";
    if (!rel.includes("icon")) continue;
    const href = hrefRegex.exec(tag)?.[1];
    if (!href || href.startsWith("data:")) continue;
    addLogo(absoluteUrl(href, baseUrl));
  }

  // 2b) Inline <svg>…</svg> elements that look like a logo. The picker can't
  // render <svg> directly, but we can wrap the markup in a data: URL so the
  // <img> tag in the picker shows it. We only surface SVGs whose surrounding
  // tag attributes (class/id/aria-label) hint at "logo" — a typical page has
  // dozens of inline icons we don't want to pollute the picker with.
  const svgBlockRegex = /<svg\b[^>]*>[\s\S]*?<\/svg>/gi;
  let svgMatch: RegExpExecArray | null;
  let svgLogosFound = 0;
  while ((svgMatch = svgBlockRegex.exec(html)) !== null) {
    const block = svgMatch[0];
    const openTag = block.slice(0, block.indexOf(">") + 1);
    const cls = /\bclass\s*=\s*["']([^"']*)["']/i.exec(openTag)?.[1] ?? "";
    const id = /\bid\s*=\s*["']([^"']*)["']/i.exec(openTag)?.[1] ?? "";
    const aria = /\baria-label\s*=\s*["']([^"']*)["']/i.exec(openTag)?.[1] ?? "";
    const role = /\brole\s*=\s*["']([^"']*)["']/i.exec(openTag)?.[1] ?? "";
    const haystack = `${cls} ${id} ${aria} ${role}`.toLowerCase();
    if (!/logo|brand|wordmark/.test(haystack)) continue;
    // Skip absurdly large SVGs — those are usually decorative illustrations,
    // and we don't want to bloat the page or DB row.
    if (block.length > 30_000) continue;
    const dataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(block)}`;
    logoSet.add(dataUrl);
    svgLogosFound++;
  }
  if (svgLogosFound > 0) {
    console.log("[firecrawl] inline svg logos surfaced", { svgLogosFound });
  }

  // 2c) Pre-compute "header/nav region" character offsets so we can mark any
  // <img> that appears inside one as a logo candidate. Catches the common
  // case where the header logo has generic alt text and a hashed filename
  // (e.g. GoHighLevel sites).
  const headerRegions: Array<[number, number]> = [];
  const regionRegex = /<(header|nav)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let regionMatch: RegExpExecArray | null;
  while ((regionMatch = regionRegex.exec(html)) !== null) {
    headerRegions.push([regionMatch.index, regionMatch.index + regionMatch[0].length]);
  }
  function isInHeaderRegion(offset: number): boolean {
    for (const [start, end] of headerRegions) {
      if (offset >= start && offset < end) return true;
    }
    return false;
  }

  // The src URL of a content image often has querystring/path noise that
  // wraps the real underlying URL (e.g. images.leadconnectorhq.com/.../u_<actualUrl>).
  // We treat any URL whose path component contains ".svg" as a logo signal,
  // even when the URL itself is served by an image proxy.
  function looksLikeSvgUrl(u: string): boolean {
    try {
      const lower = new URL(u).toString().toLowerCase();
      return /\.svg(?:[?#]|$)/.test(lower) || lower.includes(".svg");
    } catch {
      return u.toLowerCase().includes(".svg");
    }
  }

  // 3) Walk every <img> tag. Also pick up lazy-load attributes (data-src,
  // data-original, etc.) and srcset entries — sites frequently put the real
  // logo in srcset and a 1×1 transparent placeholder in src.
  const imgRegex = /<img\b[^>]*>/gi;
  const srcRegex = /\bsrc\s*=\s*["']([^"']+)["']/i;
  const dataSrcRegex = /\bdata-(?:src|original|lazy-src)\s*=\s*["']([^"']+)["']/i;
  const srcsetRegex = /\b(?:srcset|data-srcset)\s*=\s*["']([^"']+)["']/i;
  const altRegex = /\balt\s*=\s*["']([^"']*)["']/i;
  const classRegex = /\bclass\s*=\s*["']([^"']*)["']/i;

  function pickFromSrcset(value: string): string[] {
    return value
      .split(",")
      .map((part) => part.trim().split(/\s+/)[0])
      .filter(Boolean);
  }

  let match: RegExpExecArray | null;
  while ((match = imgRegex.exec(html)) !== null) {
    const tag = match[0];
    const tagOffset = match.index;
    const candidates: string[] = [];
    const src = srcRegex.exec(tag)?.[1];
    if (src) candidates.push(src);
    const dataSrc = dataSrcRegex.exec(tag)?.[1];
    if (dataSrc) candidates.push(dataSrc);
    const srcset = srcsetRegex.exec(tag)?.[1];
    if (srcset) candidates.push(...pickFromSrcset(srcset));

    const alt = altRegex.exec(tag)?.[1]?.toLowerCase() ?? "";
    const cls = classRegex.exec(tag)?.[1]?.toLowerCase() ?? "";
    const inHeader = isInHeaderRegion(tagOffset);

    for (const raw of candidates) {
      if (!raw || raw.startsWith("data:") || raw.startsWith("javascript:")) {
        continue;
      }
      const abs = absoluteUrl(raw, baseUrl);
      addImage(abs);
      const looksLikeLogo =
        alt.includes("logo") ||
        cls.includes("logo") ||
        abs.toLowerCase().includes("logo") ||
        looksLikeSvgUrl(abs) ||
        inHeader;
      if (looksLikeLogo) {
        addLogo(abs);
      }
    }
  }

  // 4) <source srcset="..."> inside <picture> — many sites use this for the
  // header logo (with an <img> fallback that may be a placeholder).
  const sourceRegex = /<source\b[^>]*>/gi;
  let sourceMatch: RegExpExecArray | null;
  while ((sourceMatch = sourceRegex.exec(html)) !== null) {
    const tag = sourceMatch[0];
    const srcset = srcsetRegex.exec(tag)?.[1];
    if (!srcset) continue;
    for (const raw of pickFromSrcset(srcset)) {
      if (!raw || raw.startsWith("data:")) continue;
      const abs = absoluteUrl(raw, baseUrl);
      addImage(abs);
      if (abs.toLowerCase().includes("logo")) addLogo(abs);
    }
  }

  // 5) CSS `background-image: url(...)` from inline style attributes and
  // <style> blocks. Catches header logos rendered as background images
  // (common with SVG sprites and Webflow/Squarespace themes).
  const bgUrlRegex = /background(?:-image)?\s*:\s*[^;"'}]*url\(\s*(?:["']?)([^"')]+)(?:["']?)\s*\)/gi;
  let bgMatch: RegExpExecArray | null;
  while ((bgMatch = bgUrlRegex.exec(html)) !== null) {
    const raw = bgMatch[1];
    if (!raw || raw.startsWith("data:")) continue;
    const abs = absoluteUrl(raw, baseUrl);
    addImage(abs);
    if (abs.toLowerCase().includes("logo")) addLogo(abs);
  }

  // Logo candidates should not double-count in image candidates.
  const imageCandidates = Array.from(allImages).filter((u) => !logoSet.has(u));

  return {
    logoCandidates: Array.from(logoSet),
    imageCandidates,
  };
}

function absoluteUrl(href: string, base: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

// Sample chromatic colors from an image, returning hex strings ordered by
// saturation-weighted prevalence. Skips near-white, near-black, and grayscale
// pixels. Returns up to ~16 candidates; the caller dedupes across sources.
async function extractCandidateColors(imageUrl: string): Promise<string[]> {
  try {
    let buf: Buffer;
    if (imageUrl.startsWith("data:")) {
      // Inline SVG data URLs (we synthesize these for inline-<svg> logos).
      // Decode directly — fetch() can't handle data: in node.
      const comma = imageUrl.indexOf(",");
      if (comma === -1) return [];
      const meta = imageUrl.slice(5, comma);
      const payload = imageUrl.slice(comma + 1);
      buf = meta.includes(";base64")
        ? Buffer.from(payload, "base64")
        : Buffer.from(decodeURIComponent(payload), "utf8");
    } else if (!/^https?:\/\//i.test(imageUrl)) {
      return [];
    } else {
      const res = await fetch(imageUrl, {
        signal: AbortSignal.timeout(SCREENSHOT_FETCH_TIMEOUT_MS),
      });
      if (!res.ok) return [];
      buf = Buffer.from(await res.arrayBuffer());
    }

    // Composite over white BEFORE resizing so transparent logo backgrounds
    // become white (which we filter out below) instead of leaking the random
    // RGB underneath transparent pixels into the sample.
    const small = sharp(buf)
      .flatten({ background: "#ffffff" })
      .resize({ width: 128, withoutEnlargement: true });
    const { data, info } = await small
      .raw()
      .toBuffer({ resolveWithObject: true });

    const channels = data.length / (info.width * info.height);
    if (channels < 3) return [];

    // Score each color bucket by the SUM of its pixel saturations rather than
    // raw count. A vivid red CTA (small but saturated) should beat a sea of
    // off-white pixels that barely pass the chromatic threshold.
    const scores = new Map<string, number>();
    for (let i = 0; i < info.width * info.height; i++) {
      const off = i * channels;
      const r = data[off];
      const g = data[off + 1];
      const b = data[off + 2];
      if (r === undefined || g === undefined || b === undefined) continue;

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max > 240 && min > 220) continue; // near-white
      if (max < 25) continue; // near-black
      const chroma = max - min;
      if (chroma < 30) continue; // low saturation

      const key = `${r >> 4},${g >> 4},${b >> 4}`;
      scores.set(key, (scores.get(key) ?? 0) + chroma);
    }

    return [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 16)
      .map(([key]) => {
        const [qr, qg, qb] = key.split(",").map(Number);
        return rgbToHex((qr << 4) + 8, (qg << 4) + 8, (qb << 4) + 8);
      });
  } catch (err) {
    console.warn("Color extraction failed", err);
    return [];
  }
}

// Pull explicit color literals out of the page's HTML — inline style
// attributes, <style> blocks, anything matching #RGB / #RRGGBB / rgb(r,g,b).
// These are the brand's *declared* colors and are stronger signal than image
// pixel sampling.
function extractColorsFromHtml(html: string): string[] {
  const counts = new Map<string, number>();
  const add = (r: number, g: number, b: number) => {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max > 240 && min > 220) return; // near-white
    if (max < 25) return; // near-black
    if (max - min < 30) return; // grayscale
    const key = `${r >> 4},${g >> 4},${b >> 4}`;
    counts.set(key, (counts.get(key) ?? 0) + (max - min));
  };

  // #RGB and #RRGGBB (also matches #RRGGBBAA but we only use the first 6).
  const hexRe = /#([0-9a-fA-F]{3,8})\b/g;
  let m: RegExpExecArray | null;
  while ((m = hexRe.exec(html)) !== null) {
    const hex = m[1];
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      add(r, g, b);
    } else if (hex.length >= 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      add(r, g, b);
    }
  }

  // rgb(...) and rgba(...) — comma- or space-separated, optional alpha.
  const rgbRe =
    /rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})/gi;
  while ((m = rgbRe.exec(html)) !== null) {
    add(parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10));
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 16)
    .map(([key]) => {
      const [qr, qg, qb] = key.split(",").map(Number);
      return rgbToHex((qr << 4) + 8, (qg << 4) + 8, (qb << 4) + 8);
    });
}

// Aggregates colors across multiple sources with per-source weights, then
// returns the top N de-duplicated by RGB distance.
class ScoreBuckets {
  private readonly scores = new Map<string, number>();

  size(): number {
    return this.scores.size;
  }

  addMany(colors: string[], weight: number): void {
    // Earlier candidates get more weight (they were the higher-scoring buckets
    // from their source), so position-decay them within the source's weight.
    for (let i = 0; i < colors.length; i++) {
      const decayed = weight * (1 - i / (colors.length + 1));
      this.scores.set(
        colors[i],
        (this.scores.get(colors[i]) ?? 0) + decayed,
      );
    }
  }

  topDistinct(max: number): string[] {
    const sorted = [...this.scores.entries()].sort((a, b) => b[1] - a[1]);
    const kept: Array<[number, number, number]> = [];
    const out: string[] = [];
    for (const [hex] of sorted) {
      const rgb = hexToRgb(hex);
      if (!rgb) continue;
      const tooClose = kept.some(
        (k) => rgbDistance(k, rgb) < NEAR_DUPLICATE_DISTANCE,
      );
      if (tooClose) continue;
      kept.push(rgb);
      out.push(hex);
      if (out.length >= max) break;
    }
    return out;
  }
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToRgb(hex: string): [number, number, number] | null {
  const c = hex.replace("#", "");
  if (c.length !== 6) return null;
  return [
    parseInt(c.slice(0, 2), 16),
    parseInt(c.slice(2, 4), 16),
    parseInt(c.slice(4, 6), 16),
  ];
}

function rgbDistance(
  a: [number, number, number],
  b: [number, number, number],
): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}
