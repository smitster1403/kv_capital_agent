/*
 * GENERATION ASSUMPTIONS
 * ---------------------------------------------------------------------------
 * Communities: 8 real Calgary communities with approximate geographic centers.
 *   Inner-city (Bridgeland, Hillhurst) carry higher base $/sqft than outer
 *   suburbs (Evanston, Cranston) reflecting Calgary market premiums.
 *
 * Price formula (all arithmetic, no LLM):
 *   base     = community.basePricePerSqft * gla_sqft
 *   type_adj = base * (type multiplier - 1)
 *              detached=1.00, semi_detached=0.88, townhouse=0.78, apt=0.65
 *   cond_adj = (condition - 3) * gla_sqft * 14   (+- per step from mid)
 *   age_adj  = (year_built - 2000) * 1200        (newer commands premium)
 *   garage   = garage_spaces * 15000
 *   bsmt     = finished -> 45000, unfinished -> 15000, none -> 0
 *   bath_adj = baths_full * 7000 + baths_half * 3000
 *   noise    = price * uniform(-0.05, +0.05)
 *
 * Property type mix per community:
 *   Inner-city (Bridgeland, Hillhurst): heavier condo/townhouse weighting
 *   Outer suburbs (Evanston, Tuscany, Aspen Woods): heavier detached weighting
 *   Others: balanced mix
 *
 * GLA ranges by type (sqft):
 *   detached: 1100-3200, semi_detached: 900-1900, townhouse: 800-1700, apt: 450-1300
 *
 * Lot size: null for apartment_condo; otherwise scales with type and community.
 *
 * Dates: uniform random over the last 12 months from script run date.
 *
 * Record count: ~300 total, distributed across communities.
 *
 * These values approximate Calgary 2025 market conditions. Production values
 * would be derived from paired sales regression on actual MLS data.
 * ---------------------------------------------------------------------------
 */

import path from "path";
import { randomUUID } from "crypto";
import Database from "better-sqlite3";
import fs from "fs";

// ---------------------------------------------------------------------------
// Community definitions
// ---------------------------------------------------------------------------

type PropertyTypeKey = "detached" | "semi_detached" | "townhouse" | "apartment_condo";

interface Community {
  name: string;
  lat: number;
  lon: number;
  basePricePerSqft: number;
  // Relative probability weights for property types [det, semi, town, apt]
  typeDist: [number, number, number, number];
}

const COMMUNITIES: Community[] = [
  { name: "Hillhurst",    lat: 51.0590, lon: -114.0940, basePricePerSqft: 500, typeDist: [20, 25, 25, 30] },
  { name: "Bridgeland",   lat: 51.0530, lon: -114.0450, basePricePerSqft: 460, typeDist: [15, 20, 30, 35] },
  { name: "Aspen Woods",  lat: 51.0290, lon: -114.2290, basePricePerSqft: 400, typeDist: [55, 20, 20,  5] },
  { name: "Mahogany",     lat: 50.9120, lon: -113.9150, basePricePerSqft: 360, typeDist: [40, 25, 25, 10] },
  { name: "Auburn Bay",   lat: 50.9290, lon: -113.9400, basePricePerSqft: 345, typeDist: [40, 25, 25, 10] },
  { name: "Tuscany",      lat: 51.1320, lon: -114.2290, basePricePerSqft: 340, typeDist: [55, 20, 20,  5] },
  { name: "Cranston",     lat: 50.8980, lon: -113.9520, basePricePerSqft: 325, typeDist: [45, 25, 25,  5] },
  { name: "Evanston",     lat: 51.1780, lon: -114.1450, basePricePerSqft: 310, typeDist: [50, 25, 20,  5] },
];

// ---------------------------------------------------------------------------
// Type multipliers (applied to base price)
// ---------------------------------------------------------------------------

const TYPE_MULTIPLIER: Record<PropertyTypeKey, number> = {
  detached:        1.00,
  semi_detached:   0.88,
  townhouse:       0.78,
  apartment_condo: 0.65,
};

// ---------------------------------------------------------------------------
// GLA ranges by type (sqft)
// ---------------------------------------------------------------------------

const GLA_RANGE: Record<PropertyTypeKey, [number, number]> = {
  detached:        [1100, 3200],
  semi_detached:   [900,  1900],
  townhouse:       [800,  1700],
  apartment_condo: [450,  1300],
};

// ---------------------------------------------------------------------------
// Random helpers (no external dep, deterministic-ish with seed offset)
// ---------------------------------------------------------------------------

function randFloat(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randInt(min: number, max: number): number {
  return Math.floor(randFloat(min, max + 1));
}

function weightedChoice<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

// ISO date string N days before today
function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Price computation (pure arithmetic)
// ---------------------------------------------------------------------------

function computePrice(params: {
  community: Community;
  propertyType: PropertyTypeKey;
  gla: number;
  condition: number;
  yearBuilt: number;
  garageSpaces: number;
  basement: "none" | "unfinished" | "finished";
  bathsFull: number;
  bathsHalf: number;
}): number {
  const {
    community, propertyType, gla, condition, yearBuilt,
    garageSpaces, basement, bathsFull, bathsHalf,
  } = params;

  const base     = community.basePricePerSqft * gla * TYPE_MULTIPLIER[propertyType];
  const condAdj  = (condition - 3) * gla * 14;
  const ageAdj   = (yearBuilt - 2000) * 1200;
  const garageAdj = garageSpaces * 15000;
  const bsmtAdj  = basement === "finished" ? 45000 : basement === "unfinished" ? 15000 : 0;
  const bathAdj  = bathsFull * 7000 + bathsHalf * 3000;

  const subtotal = base + condAdj + ageAdj + garageAdj + bsmtAdj + bathAdj;

  // ±5% market noise
  const noise = subtotal * randFloat(-0.05, 0.05);

  return Math.round(subtotal + noise);
}

// ---------------------------------------------------------------------------
// Single record generator
// ---------------------------------------------------------------------------

type BasementType = "none" | "unfinished" | "finished";

function generateRecord(community: Community, index: number): Record<string, unknown> {
  const TYPES: PropertyTypeKey[] = ["detached", "semi_detached", "townhouse", "apartment_condo"];
  const propertyType = weightedChoice(TYPES, community.typeDist);

  const [glaMin, glaMax] = GLA_RANGE[propertyType];
  const gla = Math.round(randFloat(glaMin, glaMax));

  // Beds / baths correlated with GLA
  const beds = propertyType === "apartment_condo"
    ? randInt(1, 3)
    : propertyType === "townhouse"
      ? randInt(2, 3)
      : randInt(2, 5);

  const bathsFull = Math.min(beds, randInt(1, Math.ceil(beds / 1.5)));
  const bathsHalf = randInt(0, 1);

  const yearBuilt = randInt(1978, 2024);

  // Condition: skewed toward 3-4
  const condition = weightedChoice([1, 2, 3, 4, 5], [3, 8, 30, 40, 19]);

  // Garage: condos rarely have >1, detached up to 3
  const garageSpaces = propertyType === "apartment_condo"
    ? weightedChoice([0, 1], [30, 70])
    : propertyType === "townhouse"
      ? randInt(1, 2)
      : propertyType === "semi_detached"
        ? randInt(1, 2)
        : randInt(1, 3);

  // Basement: condos always none; others vary
  const basement: BasementType = propertyType === "apartment_condo"
    ? "none"
    : weightedChoice(["none", "unfinished", "finished"] as BasementType[], [10, 30, 60]);

  // Lot size: null for condos, else roughly proportional to type
  const lotSizeSqft = propertyType === "apartment_condo"
    ? null
    : propertyType === "detached"
      ? Math.round(randFloat(3000, 8000))
      : propertyType === "semi_detached"
        ? Math.round(randFloat(2000, 4000))
        : Math.round(randFloat(1000, 2500));

  // Sale date: uniform over last 365 days
  const saleDaysAgo = randInt(1, 365);
  const saleDate = daysAgo(saleDaysAgo);

  // Lat/lon: scatter within ~1.5km of community center
  const lat = community.lat + randFloat(-0.014, 0.014);
  const lon = community.lon + randFloat(-0.018, 0.018);

  const salePrice = computePrice({
    community, propertyType, gla, condition, yearBuilt,
    garageSpaces, basement, bathsFull, bathsHalf,
  });

  return {
    id:             randomUUID(),
    community:      community.name,
    city:           "Calgary",
    latitude:       parseFloat(lat.toFixed(6)),
    longitude:      parseFloat(lon.toFixed(6)),
    property_type:  propertyType,
    beds,
    baths_full:     bathsFull,
    baths_half:     bathsHalf,
    gla_sqft:       gla,
    lot_size_sqft:  lotSizeSqft,
    year_built:     yearBuilt,
    condition,
    garage_spaces:  garageSpaces,
    basement,
    sale_date:      saleDate,
    sale_price:     salePrice,
  };
}

// ---------------------------------------------------------------------------
// Main: create DB, drop+recreate table, insert records
// ---------------------------------------------------------------------------

const DB_PATH = process.env.DB_PATH ?? "./data/sales.db";
const resolvedPath = path.resolve(process.cwd(), DB_PATH);

fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

const db = new Database(resolvedPath);
db.pragma("journal_mode = WAL");

db.exec(`DROP TABLE IF EXISTS sales`);
db.exec(`
  CREATE TABLE sales (
    id             TEXT PRIMARY KEY,
    community      TEXT NOT NULL,
    city           TEXT NOT NULL,
    latitude       REAL NOT NULL,
    longitude      REAL NOT NULL,
    property_type  TEXT NOT NULL,
    beds           INTEGER NOT NULL,
    baths_full     INTEGER NOT NULL,
    baths_half     INTEGER NOT NULL,
    gla_sqft       REAL NOT NULL,
    lot_size_sqft  REAL,
    year_built     INTEGER NOT NULL,
    condition      INTEGER NOT NULL,
    garage_spaces  INTEGER NOT NULL,
    basement       TEXT NOT NULL,
    sale_date      TEXT NOT NULL,
    sale_price     REAL NOT NULL
  )
`);

const insert = db.prepare(`
  INSERT INTO sales
    (id, community, city, latitude, longitude, property_type,
     beds, baths_full, baths_half, gla_sqft, lot_size_sqft, year_built,
     condition, garage_spaces, basement, sale_date, sale_price)
  VALUES
    (@id, @community, @city, @latitude, @longitude, @property_type,
     @beds, @baths_full, @baths_half, @gla_sqft, @lot_size_sqft, @year_built,
     @condition, @garage_spaces, @basement, @sale_date, @sale_price)
`);

// Target: ~38 records per community = ~304 total
const RECORDS_PER_COMMUNITY = 38;

const insertMany = db.transaction((records: Record<string, unknown>[]) => {
  for (const r of records) insert.run(r);
});

const allRecords: Record<string, unknown>[] = [];
for (const community of COMMUNITIES) {
  for (let i = 0; i < RECORDS_PER_COMMUNITY; i++) {
    allRecords.push(generateRecord(community, i));
  }
}

insertMany(allRecords);

const count = (db.prepare("SELECT COUNT(*) as n FROM sales").get() as { n: number }).n;
console.log(`Seeded ${count} sales records into ${resolvedPath}`);

// Show 5 sample rows
const samples = db.prepare(`
  SELECT id, community, property_type, beds, baths_full, gla_sqft,
         condition, year_built, garage_spaces, basement, sale_date, sale_price
  FROM sales
  ORDER BY RANDOM()
  LIMIT 5
`).all();

console.log("\n5 sample rows:");
console.table(samples);

// Show price stats by community and type
const stats = db.prepare(`
  SELECT community, property_type,
         COUNT(*) as n,
         CAST(AVG(sale_price) AS INTEGER) as avg_price,
         CAST(MIN(sale_price) AS INTEGER) as min_price,
         CAST(MAX(sale_price) AS INTEGER) as max_price
  FROM sales
  GROUP BY community, property_type
  ORDER BY community, property_type
`).all();

console.log("\nPrice stats by community and type:");
console.table(stats);

db.close();
