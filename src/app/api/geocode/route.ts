import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface GeoComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

interface GeocodeResult {
  formatted_address: string;
  geometry: { location: { lat: number; lng: number } };
  address_components: GeoComponent[];
}

interface GeocodeResponse {
  status: string;
  results: GeocodeResult[];
}

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");
  if (!address?.trim()) {
    return NextResponse.json({ error: "Missing address" }, { status: 400 });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Geocoding not configured on server" }, { status: 503 });
  }

  const url =
    `https://maps.googleapis.com/maps/api/geocode/json` +
    `?address=${encodeURIComponent(address)}` +
    `&key=${apiKey}`;

  let data: GeocodeResponse;
  try {
    const resp = await fetch(url, { next: { revalidate: 0 } });
    data = await resp.json();
  } catch {
    return NextResponse.json({ error: "Geocoding request failed" }, { status: 502 });
  }

  if (data.status !== "OK" || data.results.length === 0) {
    return NextResponse.json(
      { error: "Address not found — try adding the city or postal code" },
      { status: 404 }
    );
  }

  const result = data.results[0];
  const { lat, lng } = result.geometry.location;
  const components = result.address_components;

  // Extract neighborhood / sublocality for community auto-fill
  const neighborhood =
    components.find((c) => c.types.includes("neighborhood"))?.long_name ??
    components.find((c) => c.types.includes("sublocality_level_1"))?.long_name ??
    components.find((c) => c.types.includes("sublocality"))?.long_name ??
    null;

  return NextResponse.json({
    lat,
    lon: lng,
    neighborhood,
    formatted_address: result.formatted_address,
  });
}
