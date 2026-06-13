import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Nominatim address breakdown (keys vary by place; all optional except lat/lon).
interface NominatimAddress {
  house_number?: string;
  road?: string;
  neighbourhood?: string;
  suburb?: string;
  city_district?: string;
  city?: string;
  state?: string;
  postcode?: string;
  country?: string;
  country_code?: string;
}

interface NominatimResult {
  lat: string;    // string in Nominatim -- parse to float
  lon: string;
  display_name: string;
  address?: NominatimAddress;
}

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address")?.trim();
  if (!address) {
    return NextResponse.json({ error: "Missing address" }, { status: 400 });
  }

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", address);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "ca");
  url.searchParams.set("accept-language", "en");

  let results: NominatimResult[];
  try {
    const resp = await fetch(url.toString(), {
      headers: {
        // Required by Nominatim usage policy.
        "User-Agent": "KVCapital-CompAnalysis/1.0 (contact@kvcapital.ca)",
        "Accept": "application/json",
      },
      // Cache same-address lookups for 24 h to respect the 1 req/s rate limit.
      next: { revalidate: 86400 },
    });
    results = await resp.json();
  } catch {
    return NextResponse.json({ error: "Geocoding request failed" }, { status: 502 });
  }

  if (!results.length) {
    return NextResponse.json(
      { error: "Address not found — try adding the city or postal code" },
      { status: 404 }
    );
  }

  const top = results[0];
  const lat = parseFloat(top.lat);
  const lon = parseFloat(top.lon);
  const addr = top.address ?? {};

  // Neighbourhood in Calgary typically comes back as suburb or neighbourhood.
  const neighborhood =
    addr.neighbourhood ??
    addr.suburb ??
    addr.city_district ??
    null;

  return NextResponse.json({
    lat,
    lon,
    neighborhood,
    formatted_address: top.display_name,
  });
}
