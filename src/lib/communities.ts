// Approximate geographic centers for each community in the synthetic dataset.
// These match the centers used in generate-data.ts.
export const COMMUNITIES = [
  { name: "Aspen Woods",  lat: 51.0290, lon: -114.2290 },
  { name: "Auburn Bay",   lat: 50.9290, lon: -113.9400 },
  { name: "Bridgeland",   lat: 51.0530, lon: -114.0450 },
  { name: "Cranston",     lat: 50.8980, lon: -113.9520 },
  { name: "Evanston",     lat: 51.1780, lon: -114.1450 },
  { name: "Hillhurst",    lat: 51.0590, lon: -114.0940 },
  { name: "Mahogany",     lat: 50.9120, lon: -113.9150 },
  { name: "Tuscany",      lat: 51.1320, lon: -114.2290 },
] as const;

export type CommunityName = (typeof COMMUNITIES)[number]["name"];

export function getCommunityCoords(
  name: string
): { lat: number; lon: number } | null {
  const match = COMMUNITIES.find((c) => c.name === name);
  return match ? { lat: match.lat, lon: match.lon } : null;
}
