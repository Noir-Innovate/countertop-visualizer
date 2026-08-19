import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface ReverseBody {
  mode: "reverse";
  lat: number;
  lng: number;
}

interface AutocompleteBody {
  mode: "autocomplete";
  query: string;
  sessionToken?: string;
}

interface PlaceDetailsBody {
  mode: "place_details";
  placeId: string;
  sessionToken?: string;
}

type Body = ReverseBody | AutocompleteBody | PlaceDetailsBody;

interface NormalizedAddress {
  formatted: string;
  street?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  country?: string;
  lat?: number;
  lng?: number;
}

interface GeocodeAddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

interface GeocodeResult {
  formatted_address: string;
  address_components: GeocodeAddressComponent[];
  geometry?: { location?: { lat: number; lng: number } };
}

function normalizeGeocodeResult(result: GeocodeResult): NormalizedAddress {
  const components = result.address_components || [];
  const get = (type: string) =>
    components.find((c) => c.types?.includes(type));

  const streetNumber = get("street_number")?.long_name || "";
  const route = get("route")?.long_name || "";
  const street = [streetNumber, route].filter(Boolean).join(" ").trim();
  const city =
    get("locality")?.long_name ||
    get("sublocality")?.long_name ||
    get("postal_town")?.long_name;
  const region = get("administrative_area_level_1")?.short_name;
  const postalCode = get("postal_code")?.long_name;
  const country = get("country")?.short_name;

  return {
    formatted: result.formatted_address || "",
    street: street || undefined,
    city,
    region,
    postalCode,
    country,
    lat: result.geometry?.location?.lat,
    lng: result.geometry?.location?.lng,
  };
}

interface PlaceAddressComponent {
  longText: string;
  shortText: string;
  types: string[];
}

interface PlaceResult {
  formattedAddress: string;
  addressComponents?: PlaceAddressComponent[];
  location?: { latitude: number; longitude: number };
}

/**
 * Places API (New) returns the same address components under camelCase keys and
 * a differently-shaped location, so it needs its own normalizer even though the
 * output matches the Geocoding API's.
 */
function normalizePlaceResult(result: PlaceResult): NormalizedAddress {
  const components = result.addressComponents || [];
  const get = (type: string) => components.find((c) => c.types?.includes(type));

  const street = [get("street_number")?.longText, get("route")?.longText]
    .filter(Boolean)
    .join(" ")
    .trim();

  return {
    formatted: result.formattedAddress || "",
    street: street || undefined,
    city:
      get("locality")?.longText ||
      get("sublocality")?.longText ||
      get("postal_town")?.longText,
    region: get("administrative_area_level_1")?.shortText,
    postalCode: get("postal_code")?.longText,
    country: get("country")?.shortText,
    lat: result.location?.latitude,
    lng: result.location?.longitude,
  };
}

export async function POST(request: NextRequest) {
  // Require auth — this is a paid API and we don't want it open to abuse.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Geocoding is not configured" },
      { status: 503 },
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    if (body.mode === "reverse") {
      if (typeof body.lat !== "number" || typeof body.lng !== "number") {
        return NextResponse.json(
          { error: "lat and lng are required" },
          { status: 400 },
        );
      }
      const url =
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${body.lat},${body.lng}` +
        `&key=${apiKey}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.status !== "OK" || !json.results?.length) {
        return NextResponse.json(
          { error: json.error_message || json.status || "No results" },
          { status: 502 },
        );
      }
      const normalized = normalizeGeocodeResult(json.results[0]);
      return NextResponse.json({ address: normalized });
    }

    if (body.mode === "autocomplete") {
      const q = body.query?.trim();
      if (!q) return NextResponse.json({ predictions: [] });

      const res = await fetch(
        "https://places.googleapis.com/v1/places:autocomplete",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
          },
          body: JSON.stringify({
            input: q,
            includedPrimaryTypes: ["street_address", "premise", "subpremise"],
            ...(body.sessionToken ? { sessionToken: body.sessionToken } : {}),
          }),
        },
      );
      const json = await res.json();
      if (!res.ok) {
        return NextResponse.json(
          { error: json.error?.message || "Address lookup failed" },
          { status: 502 },
        );
      }

      interface Suggestion {
        placePrediction?: {
          placeId: string;
          text?: { text?: string };
          structuredFormat?: {
            mainText?: { text?: string };
            secondaryText?: { text?: string };
          };
        };
      }
      const predictions = ((json.suggestions || []) as Suggestion[])
        .map((s) => s.placePrediction)
        .filter((p): p is NonNullable<Suggestion["placePrediction"]> => !!p)
        .map((p) => ({
          placeId: p.placeId,
          description: p.text?.text || "",
          mainText: p.structuredFormat?.mainText?.text,
          secondaryText: p.structuredFormat?.secondaryText?.text,
        }));
      return NextResponse.json({ predictions });
    }

    if (body.mode === "place_details") {
      const res = await fetch(
        `https://places.googleapis.com/v1/places/${encodeURIComponent(body.placeId)}` +
          (body.sessionToken
            ? `?sessionToken=${encodeURIComponent(body.sessionToken)}`
            : ""),
        {
          headers: {
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask": "formattedAddress,addressComponents,location",
          },
        },
      );
      const json = await res.json();
      if (!res.ok || !json.formattedAddress) {
        return NextResponse.json(
          { error: json.error?.message || "No result" },
          { status: 502 },
        );
      }
      return NextResponse.json({ address: normalizePlaceResult(json) });
    }

    return NextResponse.json({ error: "Unknown mode" }, { status: 400 });
  } catch (e) {
    console.error("[sales/geocode] failed:", e);
    return NextResponse.json(
      { error: "Geocoding request failed" },
      { status: 500 },
    );
  }
}
