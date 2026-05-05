export type SlabImageResult =
  | { data: string; mimeType: string }
  | { error: string };

// "https://host" / "http://host:port" — protocol+host only, no path.
export type Origin = string;

export interface ResolveSlabImageOptions {
  allowedOrigins?: Set<Origin>;
  fetchImpl?: typeof fetch;
}

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

function originOf(u: URL): Origin {
  return `${u.protocol}//${u.host}`;
}

export function getDefaultAllowedSlabOrigins(): Set<Origin> {
  const origins = new Set<Origin>();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (supabaseUrl) {
    try {
      origins.add(originOf(new URL(supabaseUrl)));
    } catch {}
  }
  return origins;
}

function isLocalHost(hostname: string): boolean {
  return (
    LOCAL_HOSTNAMES.has(hostname) ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".localhost")
  );
}

export async function resolveSlabImage(
  slabImage: string | undefined,
  slabImageUrl: string | undefined,
  options: ResolveSlabImageOptions = {},
): Promise<SlabImageResult> {
  const allowedOrigins =
    options.allowedOrigins ?? getDefaultAllowedSlabOrigins();
  const fetchImpl = options.fetchImpl ?? fetch;

  if (slabImageUrl) {
    let parsed: URL;
    try {
      parsed = new URL(slabImageUrl);
    } catch {
      return { error: "Invalid slabImageUrl" };
    }

    const origin = originOf(parsed);
    const inAllowlist =
      allowedOrigins.size > 0 && allowedOrigins.has(origin);
    const localHttp =
      parsed.protocol === "http:" && isLocalHost(parsed.hostname);

    if (parsed.protocol !== "https:" && !inAllowlist && !localHttp) {
      return { error: "slabImageUrl must be https" };
    }
    if (allowedOrigins.size > 0 && !inAllowlist && !localHttp) {
      return { error: "slabImageUrl host not allowed" };
    }

    const res = await fetchImpl(slabImageUrl);
    if (!res.ok) {
      return { error: `Failed to fetch slab image (${res.status})` };
    }
    const arrayBuffer = await res.arrayBuffer();
    const mimeType =
      res.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
    return {
      data: Buffer.from(arrayBuffer).toString("base64"),
      mimeType,
    };
  }

  if (slabImage) {
    const data = slabImage.includes(",") ? slabImage.split(",")[1] : slabImage;
    const mimeType = slabImage.includes(",")
      ? slabImage.split(",")[0].split(":")[1].split(";")[0]
      : "image/jpeg";
    return { data, mimeType };
  }

  return { error: "Slab image is required" };
}
