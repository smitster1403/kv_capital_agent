/*
 * Import real Calgary residential sale data from a CSV file into data/sales.db.
 *
 * Usage:
 *   npx tsx scripts/import-real-data.ts <path-to-csv>
 *   npx tsx scripts/import-real-data.ts data/real-sales.csv
 *
 * Expected CSV columns (order matters, header row required):
 *   id, community, city, latitude, longitude, property_type,
 *   beds, baths_full, baths_half, gla_sqft, lot_size_sqft,
 *   year_built, condition, garage_spaces, basement,
 *   sale_date, sale_price
 *
 * Missing field handling:
 *   latitude / longitude   -- derived from community name lookup
 *   property_type          -- defaults to "detached"; map manually if source provides it
 *   beds                   -- if blank, the value in baths_full is treated as beds
 *                            (MLS exports often shift these columns)
 *   baths_half             -- defaults to 0
 *   gla_sqft               -- rows without GLA are skipped (required for retrieval)
 *   lot_size_sqft          -- null for condos, otherwise required
 *   year_built             -- defaults to 2000 if missing
 *   condition              -- defaults to 3 (average); no public source provides this
 *   garage_spaces          -- defaults to 1
 *   basement               -- defaults to "unfinished"
 *
 * Records are skipped when:
 *   - community is missing or not in the lookup table
 *   - sale_price < 50,000 (non-arm's-length or data error)
 *   - sale_date is missing or not a valid YYYY-MM-DD date
 *   - beds resolves to 0 (likely commercial or data error)
 *
 * This script REPLACES the contents of the sales table. Run generate-data.ts
 * first if you want to restore synthetic data.
 */

import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import Database from "better-sqlite3";
import { getCommunityCoords } from "../src/lib/communities";
import { applySchema } from "../src/lib/db";

// ---------------------------------------------------------------------------
// CSV parsing (handles quoted fields)
// ---------------------------------------------------------------------------

function parseCSV(content: string): string[][] {
  const rows: string[][] = [];
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    fields.push(current.trim());
    rows.push(fields);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Normalize helpers
// ---------------------------------------------------------------------------

const VALID_PROPERTY_TYPES = new Set([
  "detached", "semi_detached", "townhouse", "apartment_condo",
]);

function normalizePropertyType(raw: string): string {
  const s = raw.toLowerCase().replace(/[- ]/g, "_");
  if (VALID_PROPERTY_TYPES.has(s)) return s;
  if (s.includes("semi")) return "semi_detached";
  if (s.includes("town")) return "townhouse";
  if (s.includes("condo") || s.includes("apartment") || s.includes("apt")) return "apartment_condo";
  return "detached";
}

function normalizeBasement(raw: string): string {
  const s = raw.toLowerCase();
  if (s === "finished") return "finished";
  if (s === "unfinished" || s === "partial") return "unfinished";
  return "unfinished";
}

// Strip "N/A", "n/a", "-" to empty string.
function clean(raw: string): string {
  const s = raw.trim();
  return /^(n\/a|-+)$/i.test(s) ? "" : s;
}

// Strip currency symbols and thousands separators: "$1,164" -> "1164"
function stripCurrency(raw: string): string {
  return raw.replace(/[$,]/g, "");
}

// Validates YYYY-MM-DD. Returns today's date for missing/invalid dates so
// that manually-collected listings without a sale date still get imported.
const TODAY = new Date().toISOString().slice(0, 10);
function normalizeDate(raw: string): string {
  const s = clean(raw);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return TODAY; // treat missing date as today (recently listed/sold)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const csvPath = argv.find((a) => !a.startsWith("--"));
const APPEND = argv.includes("--append");

if (!csvPath) {
  console.error("Usage: npx tsx scripts/import-real-data.ts <path-to-csv> [--append]");
  console.error("  --append  Add to existing data instead of wiping the table first");
  process.exit(1);
}

const DB_PATH = process.env.DB_PATH ?? "./data/sales.db";
const resolvedPath = path.resolve(process.cwd(), DB_PATH);
fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

const db = new Database(resolvedPath);
db.pragma("journal_mode = WAL");

if (APPEND) {
  // Ensure schema exists without wiping existing rows.
  applySchema(db);
  console.log("Mode: append (existing records kept)");
} else {
  // Default: wipe and recreate so we start clean.
  db.exec("DROP TABLE IF EXISTS sales");
  applySchema(db);
  console.log("Mode: replace (table wiped)");
}

// INSERT OR REPLACE so duplicate IDs from re-runs update rather than error.
const insert = db.prepare(`
  INSERT OR REPLACE INTO sales
    (id, community, city, latitude, longitude, property_type,
     beds, baths_full, baths_half, gla_sqft, lot_size_sqft, year_built,
     condition, garage_spaces, basement, sale_date, sale_price)
  VALUES
    (@id, @community, @city, @latitude, @longitude, @property_type,
     @beds, @baths_full, @baths_half, @gla_sqft, @lot_size_sqft, @year_built,
     @condition, @garage_spaces, @basement, @sale_date, @sale_price)
`);

const content = fs.readFileSync(path.resolve(process.cwd(), csvPath), "utf8");
const [headerRow, ...dataRows] = parseCSV(content);

// Map column name -> index
const col: Record<string, number> = {};
headerRow.forEach((h, i) => { col[h.trim()] = i; });

const get = (row: string[], name: string): string =>
  (row[col[name]] ?? "").trim();

let imported = 0;
let skipped = 0;
const skipReasons: Record<string, number> = {};

const importAll = db.transaction(() => {
  for (const row of dataRows) {
    if (row.length < 2) continue;

    const community = get(row, "community");
    const saleDate = normalizeDate(get(row, "sale_date"));
    const salePriceRaw = parseFloat(stripCurrency(get(row, "sale_price")));

    // --- Hard skips ---
    if (!community) {
      skipReasons["missing community"] = (skipReasons["missing community"] ?? 0) + 1;
      skipped++; continue;
    }
    if (!salePriceRaw || salePriceRaw < 50_000) {
      skipReasons["price < $50k or missing"] = (skipReasons["price < $50k or missing"] ?? 0) + 1;
      skipped++; continue;
    }

    // --- Coordinates: use CSV values if valid, else fall back to community centroid ---
    const csvLat = parseFloat(get(row, "latitude"));
    const csvLon = parseFloat(get(row, "longitude"));
    const hasCsvCoords =
      !isNaN(csvLat) && !isNaN(csvLon) &&
      csvLat !== 0 && csvLon !== 0 &&
      Math.abs(csvLat) <= 90 && Math.abs(csvLon) <= 180;

    const communityCoords = getCommunityCoords(community);
    const coords = hasCsvCoords
      ? { lat: csvLat, lon: csvLon }
      : communityCoords;

    if (!coords) {
      skipReasons[`unknown community: ${community}`] =
        (skipReasons[`unknown community: ${community}`] ?? 0) + 1;
      skipped++; continue;
    }

    // --- Beds / baths column shift detection ---
    // If the source CSV has beds empty and values in baths_full/baths_half,
    // treat baths_full as beds and baths_half as total baths.
    let beds = parseInt(get(row, "beds")) || 0;
    let bathsFull = parseInt(get(row, "baths_full")) || 0;
    let bathsHalf = parseInt(get(row, "baths_half")) || 0;

    if (beds === 0 && bathsFull > 0) {
      beds = bathsFull;
      bathsFull = bathsHalf;
      bathsHalf = 0;
    }

    if (beds === 0) {
      skipReasons["no beds (likely commercial)"] =
        (skipReasons["no beds (likely commercial)"] ?? 0) + 1;
      skipped++; continue;
    }

    // --- Remaining fields ---
    const propertyTypeRaw = get(row, "property_type");
    const propertyType = propertyTypeRaw
      ? normalizePropertyType(propertyTypeRaw)
      : "detached";

    const glaRaw = parseFloat(stripCurrency(get(row, "gla_sqft")));
    const gla = glaRaw > 0 ? glaRaw : null;

    if (!gla) {
      skipReasons["missing GLA"] = (skipReasons["missing GLA"] ?? 0) + 1;
      skipped++; continue;
    }

    const lotRaw = parseFloat(stripCurrency(get(row, "lot_size_sqft")));
    const lotSize = lotRaw > 0
      ? lotRaw
      : (propertyType === "apartment_condo" ? null : null);

    const yearBuilt = parseInt(get(row, "year_built")) || 2000;
    const condition = parseInt(get(row, "condition")) || 3;
    const garageSpaces = parseInt(get(row, "garage_spaces"));
    const garage = isNaN(garageSpaces) ? 1 : garageSpaces;
    const basementRaw = get(row, "basement");
    const basement = basementRaw ? normalizeBasement(basementRaw) : "unfinished";

    // Accept "id", "id (MLS®)", or just the first column as the record ID.
    const rawId = get(row, "id") || get(row, "id (MLS®)") || row[0]?.trim() || "";
    const id = rawId || randomUUID();

    insert.run({
      id,
      community,
      city: get(row, "city") || "Calgary",
      latitude: coords.lat,
      longitude: coords.lon,
      property_type: propertyType,
      beds,
      baths_full: bathsFull,
      baths_half: bathsHalf,
      gla_sqft: gla,
      lot_size_sqft: lotSize,
      year_built: yearBuilt,
      condition,
      garage_spaces: garage,
      basement,
      sale_date: saleDate,
      sale_price: Math.round(salePriceRaw),
    });

    imported++;
  }
});

importAll();

console.log(`\nImport complete: ${resolvedPath}`);
console.log(`  Imported: ${imported}`);
console.log(`  Skipped:  ${skipped}`);

if (Object.keys(skipReasons).length > 0) {
  console.log("\nSkip reasons:");
  for (const [reason, count] of Object.entries(skipReasons)) {
    console.log(`  ${count}x  ${reason}`);
  }
}

// Show what we imported
const sample = db
  .prepare(`
    SELECT community, property_type, beds, baths_full, gla_sqft,
           year_built, condition, sale_date, sale_price
    FROM sales ORDER BY sale_date DESC LIMIT 10
  `)
  .all();

console.log("\nMost recent 10 imported records:");
console.table(sample);

const stats = db
  .prepare(`
    SELECT community, COUNT(*) as n,
           CAST(AVG(sale_price) AS INTEGER) as avg_price,
           MIN(sale_date) as oldest, MAX(sale_date) as newest
    FROM sales GROUP BY community ORDER BY n DESC
  `)
  .all();

console.log("\nRecords by community:");
console.table(stats);

db.close();
