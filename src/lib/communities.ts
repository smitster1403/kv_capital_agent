// Approximate geographic centers for Calgary communities.
// Used to derive lat/lon from a community name so users never enter coordinates.
// Coordinates are community centroids accurate to ~500m, sufficient for
// the Haversine distance ranking in retrieval.ts.

export const COMMUNITIES = [
  // Inner city / Central
  { name: "Altadore",            lat: 51.0230, lon: -114.1020 },
  { name: "Bankview",            lat: 51.0380, lon: -114.0970 },
  { name: "Beltline",            lat: 51.0390, lon: -114.0800 },
  { name: "Bridgeland",          lat: 51.0530, lon: -114.0450 },
  { name: "Cliff Bungalow",      lat: 51.0320, lon: -114.0690 },
  { name: "Crescent Heights",    lat: 51.0600, lon: -114.0650 },
  { name: "Elbow Park",          lat: 51.0320, lon: -114.0720 },
  { name: "Erlton",              lat: 51.0330, lon: -114.0670 },
  { name: "Hillhurst",           lat: 51.0590, lon: -114.0940 },
  { name: "Inglewood",           lat: 51.0400, lon: -114.0380 },
  { name: "Kensington",          lat: 51.0550, lon: -114.0930 },
  { name: "Killarney",           lat: 51.0390, lon: -114.1150 },
  { name: "Mission",             lat: 51.0320, lon: -114.0840 },
  { name: "Mount Royal",         lat: 51.0330, lon: -114.0760 },
  { name: "Ramsay",              lat: 51.0320, lon: -114.0460 },
  { name: "Rutland Park",        lat: 51.0420, lon: -114.1310 },
  { name: "South Calgary",       lat: 51.0240, lon: -114.0870 },
  { name: "Sunalta",             lat: 51.0450, lon: -114.1020 },
  { name: "Upper Mount Royal",   lat: 51.0350, lon: -114.0880 },
  { name: "Windsor Park",        lat: 51.0460, lon: -114.0940 },

  // NW Calgary
  { name: "Arbour Lake",         lat: 51.1230, lon: -114.2040 },
  { name: "Brentwood",           lat: 51.0870, lon: -114.1320 },
  { name: "Carrington",          lat: 51.1830, lon: -114.1680 },
  { name: "Charleswood",         lat: 51.0900, lon: -114.1680 },
  { name: "Citadel",             lat: 51.1450, lon: -114.1780 },
  { name: "Dalhousie",           lat: 51.0970, lon: -114.1530 },
  { name: "Edgemont",            lat: 51.1160, lon: -114.1650 },
  { name: "Evanston",            lat: 51.1780, lon: -114.1450 },
  { name: "Hamptons",            lat: 51.1490, lon: -114.1960 },
  { name: "Hawkwood",            lat: 51.1210, lon: -114.2100 },
  { name: "Kincora",             lat: 51.1660, lon: -114.1900 },
  { name: "Montgomery",          lat: 51.0720, lon: -114.1450 },
  { name: "Mount Pleasant",      lat: 51.0710, lon: -114.0970 },
  { name: "Parkdale",            lat: 51.0760, lon: -114.1290 },
  { name: "Ranchlands",          lat: 51.1130, lon: -114.1750 },
  { name: "Rocky Ridge",         lat: 51.1650, lon: -114.2380 },
  { name: "Royal Oak",           lat: 51.1370, lon: -114.2370 },
  { name: "Scenic Acres",        lat: 51.1170, lon: -114.1870 },
  { name: "Silver Springs",      lat: 51.1050, lon: -114.2000 },
  { name: "Tuscany",             lat: 51.1320, lon: -114.2290 },
  { name: "University Heights",  lat: 51.0790, lon: -114.1280 },
  { name: "Valley Ridge",        lat: 51.1100, lon: -114.2700 },
  { name: "Varsity",             lat: 51.0860, lon: -114.1500 },

  // SW Calgary
  { name: "Aspen Woods",         lat: 51.0290, lon: -114.2290 },
  { name: "West Springs",        lat: 51.0490, lon: -114.2070 },
  { name: "Canyon Meadows",      lat: 50.9600, lon: -114.0920 },
  { name: "Cedarbrae",           lat: 50.9660, lon: -114.1240 },
  { name: "Cougar Ridge",        lat: 51.0360, lon: -114.2150 },
  { name: "Discovery Ridge",     lat: 50.9830, lon: -114.2080 },
  { name: "Evergreen",           lat: 50.9450, lon: -114.1300 },
  { name: "Haysboro",            lat: 50.9840, lon: -114.0910 },
  { name: "Kingsland",           lat: 50.9990, lon: -114.0850 },
  { name: "Lakeview",            lat: 51.0020, lon: -114.1260 },
  { name: "Millrise",            lat: 50.9300, lon: -114.1000 },
  { name: "Oakridge",            lat: 51.0030, lon: -114.1380 },
  { name: "Palliser",            lat: 50.9970, lon: -114.1200 },
  { name: "Parkland",            lat: 50.9700, lon: -114.1600 },
  { name: "Patterson",           lat: 51.0220, lon: -114.1830 },
  { name: "Pump Hill",           lat: 50.9940, lon: -114.1270 },
  { name: "Shawnessy",           lat: 50.9210, lon: -114.1040 },
  { name: "Signal Hill",         lat: 51.0280, lon: -114.2150 },
  { name: "Somerset",            lat: 50.9140, lon: -114.0980 },
  { name: "Southwood",           lat: 50.9850, lon: -114.0820 },
  { name: "Springbank Hill",     lat: 51.0230, lon: -114.2040 },
  { name: "Woodlands",           lat: 50.9670, lon: -114.0980 },

  // N Calgary
  { name: "Beddington Heights",  lat: 51.1060, lon: -114.0640 },
  { name: "Coventry Hills",      lat: 51.1680, lon: -114.0420 },
  { name: "Country Hills",       lat: 51.1550, lon: -114.0400 },
  { name: "Harvest Hills",       lat: 51.1530, lon: -114.0290 },
  { name: "Highwood",            lat: 51.1020, lon: -114.0550 },
  { name: "Keystone Hills",      lat: 51.1950, lon: -114.0270 },
  { name: "Livingston",          lat: 51.2020, lon: -114.0300 },
  { name: "Panorama Hills",      lat: 51.1520, lon: -114.0600 },

  // NE Calgary
  { name: "Castleridge",         lat: 51.1010, lon: -113.9870 },
  { name: "Coral Springs",       lat: 51.1300, lon: -113.9590 },
  { name: "Falconridge",         lat: 51.1310, lon: -113.9840 },
  { name: "Martindale",          lat: 51.1420, lon: -113.9720 },
  { name: "Saddle Ridge",        lat: 51.1500, lon: -113.9670 },
  { name: "Taradale",            lat: 51.1360, lon: -113.9490 },

  // SE Calgary
  { name: "Acadia",              lat: 50.9720, lon: -114.0460 },
  { name: "Auburn Bay",          lat: 50.9290, lon: -113.9400 },
  { name: "Bonavista Downs",     lat: 50.9480, lon: -114.0680 },
  { name: "Chaparral",           lat: 50.8960, lon: -114.0140 },
  { name: "Copperfield",         lat: 50.8870, lon: -114.0410 },
  { name: "Cranston",            lat: 50.8980, lon: -113.9520 },
  { name: "Douglasdale",         lat: 50.9380, lon: -113.9850 },
  { name: "Lake Bonavista",      lat: 50.9430, lon: -114.0560 },
  { name: "Legacy",              lat: 50.8830, lon: -113.9950 },
  { name: "Mahogany",            lat: 50.9120, lon: -113.9150 },
  { name: "McKenzie Lake",       lat: 50.9180, lon: -113.9560 },
  { name: "McKenzie Towne",      lat: 50.8820, lon: -114.0040 },
  { name: "New Brighton",        lat: 50.8940, lon: -114.0300 },
  { name: "Quarry Park",         lat: 50.9580, lon: -114.0260 },
  { name: "Riverbend",           lat: 50.9600, lon: -114.0110 },
  { name: "Silverado",           lat: 50.9120, lon: -114.0460 },
  { name: "Seton",               lat: 50.8790, lon: -113.9900 },
  { name: "Walden",              lat: 50.8890, lon: -113.9710 },
  { name: "Wolf Willow",         lat: 50.8620, lon: -114.0100 },
] as const;

export type CommunityName = (typeof COMMUNITIES)[number]["name"];

export function getCommunityCoords(
  name: string
): { lat: number; lon: number } | null {
  const match = COMMUNITIES.find(
    (c) => c.name.toLowerCase() === name.toLowerCase()
  );
  return match ? { lat: match.lat, lon: match.lon } : null;
}
