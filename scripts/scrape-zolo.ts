/**
 * Zolo.ca Calgary sold-listings scraper.
 *
 * Launches a VISIBLE browser. Navigate to the sold listings yourself if
 * needed (the scraper tries automatically), then press Enter.
 *
 * Installation (one-time):
 *   npm install -D playwright playwright-extra puppeteer-extra-plugin-stealth
 *   npx playwright install chromium
 *
 * Usage:
 *   npm run scrape
 *   npx tsx scripts/scrape-zolo.ts --pages=10 --out=data/zolo-sold.csv
 *
 * Import the output:
 *   npm run import data/zolo-sold.csv
 */

import { chromium } from "playwright-extra";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import { randomUUID } from "crypto";

chromium.use(StealthPlugin());

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"];
  })
);

const MAX_PAGES = parseInt(String(args.pages ?? 5));
const OUT_PATH  = String(args.out ?? "data/zolo-sold.csv");
const HEADLESS  = args.headless === "true";

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

const CSV_HEADERS = [
  "id", "community", "city",
  "latitude", "longitude",
  "property_type",
  "beds", "baths_full", "baths_half",
  "gla_sqft", "lot_size_sqft",
  "year_built", "condition", "garage_spaces", "basement",
  "sale_date", "sale_price",
];

type Row = Record<string, string>;

function toCSVLine(row: Row): string {
  return CSV_HEADERS.map((h) => {
    const v = String(row[h] ?? "");
    return v.includes(",") ? `"${v}"` : v;
  }).join(",");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function waitForEnter(prompt: string): Promise<void> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, () => { rl.close(); resolve(); });
  });
}

function normalizePropertyType(raw: string): string {
  const s = raw.toLowerCase();
  if (s.includes("semi") || s.includes("duplex"))  return "semi_detached";
  if (s.includes("town") || s.includes("row"))      return "townhouse";
  if (s.includes("condo") || s.includes("apt"))     return "apartment_condo";
  return "detached";
}

// Parse "$850,000" or attribute value="850000"
function parsePrice(raw: string): number {
  return parseInt(raw.replace(/[^0-9]/g, "")) || 0;
}

// Parse various date formats Zolo uses on sold cards.
const MONTH_MAP: Record<string, string> = {
  jan:"01", feb:"02", mar:"03", apr:"04", may:"05", jun:"06",
  jul:"07", aug:"08", sep:"09", oct:"10", nov:"11", dec:"12",
};
function parseSaleDate(raw: string): string | null {
  if (!raw) return null;
  const s = raw.replace(/^sold\s*/i, "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\w{3,9})\s+(\d{1,2}),?\s+(\d{4})$/i);
  if (m) {
    const mon = MONTH_MAP[m[1].toLowerCase().slice(0, 3)];
    if (mon) return `${m[3]}-${mon}-${m[2].padStart(2, "0")}`;
  }
  // "15/01/2026" or "01/15/2026" -- assume MM/DD/YYYY
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) return `${slash[3]}-${slash[1].padStart(2,"0")}-${slash[2].padStart(2,"0")}`;
  return null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  fs.mkdirSync(path.dirname(path.resolve(OUT_PATH)), { recursive: true });

  const csvExists = fs.existsSync(OUT_PATH);
  const fd = fs.openSync(OUT_PATH, "a");
  if (!csvExists) fs.writeSync(fd, CSV_HEADERS.join(",") + "\n");

  const browser = await chromium.launch({
    headless: HEADLESS,
    args: ["--no-sandbox", "--disable-blink-features=AutomationControlled"],
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 900 },
    locale: "en-CA",
  });

  const page = await context.newPage();

  // ---- Navigate to sold listings ----------------------------------------
  // Zolo's sold listings are at /calgary-real-estate/sold
  // Pagination follows the pattern /sold/page-N
  const SOLD_BASE = "https://www.zolo.ca/calgary-real-estate/sold";

  console.log(`\nNavigating to: ${SOLD_BASE}`);
  console.log("Steps:");
  console.log("  1. If Cloudflare challenge appears, solve it.");
  console.log("  2. If prompted to log in, log in to your Zolo account.");
  console.log("  3. Wait until sold listing cards are fully loaded.");
  console.log("  4. Come back here and press Enter.\n");

  await page.goto(SOLD_BASE, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForTimeout(3_000);

  await waitForEnter("Press Enter once sold listings are visible in the browser...");

  // Confirm we're on the sold page; if not, try clicking the Sold tab.
  const currentUrl = page.url();
  if (!currentUrl.includes("/sold")) {
    console.log("  Not on sold page -- trying to click Sold tab...");
    const soldTab = await page.$("a:has-text('Sold'), button:has-text('Sold'), [href*='/sold']");
    if (soldTab) {
      await soldTab.click();
      await page.waitForTimeout(2_500);
    } else {
      console.warn("  Could not find Sold tab. Scraping whatever is visible.");
    }
  }

  // ---- Scrape pages -------------------------------------------------------
  let totalWritten = 0;
  let pageNum = 1;
  const skipReasons: Record<string, number> = {};

  while (pageNum <= MAX_PAGES) {
    console.log(`\nScraping page ${pageNum} of ${MAX_PAGES} (${page.url()})...`);

    // Wait for cards
    try {
      await page.waitForSelector("article.card-listing", { timeout: 15_000 });
    } catch {
      console.warn("  No cards found. Dumping HTML for inspection.");
      fs.writeFileSync(`data/zolo-debug-p${pageNum}.html`, await page.content());
      break;
    }

    const cards = await page.$$("article.card-listing");
    console.log(`  ${cards.length} cards`);

    // Save a sample card on page 1 for debugging selectors.
    if (pageNum === 1 && cards.length > 0) {
      const sampleHtml = await cards[0].innerHTML().catch(() => "");
      fs.writeFileSync("data/zolo-card-sample.html", sampleHtml);
    }

    for (const card of cards) {
      try {
        // --- Get all pill/badge text to look for sold indicators ---
        const pillText = (await card.$eval(
          "[class*='pill'], [class*='badge'], [class*='tag']",
          (el) => el.textContent ?? ""
        ).catch(() => "")).toLowerCase();

        // --- Address & neighbourhood ---
        const street = await card.$eval(
          "span[itemprop='streetAddress']",
          (el) => el.textContent?.trim() ?? ""
        ).catch(() => "");

        const neighbourhood = await card.$eval(
          "span.neighbourhood",
          (el) => el.textContent?.replace(/[•\s]+/g, " ").trim() ?? ""
        ).catch(() => "");

        if (!street) {
          skipReasons["no street"] = (skipReasons["no street"] ?? 0) + 1;
          continue;
        }

        // --- Coordinates (embedded in card as schema.org microdata) ---
        const latStr = await card.$eval(
          "meta[itemprop='latitude']",
          (el) => el.getAttribute("content") ?? ""
        ).catch(() => "");
        const lonStr = await card.$eval(
          "meta[itemprop='longitude']",
          (el) => el.getAttribute("content") ?? ""
        ).catch(() => "");

        // --- Price ---
        // Try the value attribute first (most reliable), fall back to text.
        const priceAttr = await card.$eval(
          "span[itemprop='price']",
          (el) => el.getAttribute("value") ?? el.textContent ?? ""
        ).catch(() => "");
        const salePrice = parsePrice(priceAttr);
        if (!salePrice || salePrice < 50_000) {
          skipReasons["no/low price"] = (skipReasons["no/low price"] ?? 0) + 1;
          continue;
        }

        // --- Property type (from SVG title in the pill) ---
        const propTypeRaw = await card.$eval(
          ".fill-green svg title, .fill-red svg title, .fill-orange svg title, [class*='pill'] svg title",
          (el) => el.textContent?.trim() ?? ""
        ).catch(() => "detached");
        const propertyType = normalizePropertyType(propTypeRaw || "detached");

        // --- Specs: parse the <li> items in card-listing--values ---
        // Expected: "2 bed", "2 bath", "1164 sqft", "Built in 2006"
        // Sold cards may also have "Sold Jan 15, 2026"
        const liItems = await card.$$eval(
          "ul.card-listing--values li",
          (els) => els.map((el) => el.textContent?.trim() ?? "")
        ).catch(() => [] as string[]);

        let beds = 0, bathsFull = 0, bathsHalf = 0, sqft = 0, yearBuilt = 0;
        let soldDateRaw = "";

        for (const item of liItems) {
          const lower = item.toLowerCase();
          if (lower.includes("bed")) {
            beds = parseInt(item) || 0;
          } else if (lower.includes("bath")) {
            const n = parseFloat(item) || 0;
            bathsFull = Math.floor(n);
            bathsHalf = n % 1 > 0 ? 1 : 0;
          } else if (lower.includes("sqft")) {
            sqft = parseInt(item.replace(/\D/g, "")) || 0;
          } else if (lower.includes("built")) {
            yearBuilt = parseInt(item.replace(/\D/g, "")) || 0;
          } else if (lower.startsWith("sold")) {
            soldDateRaw = item;
          }
        }

        // Also check the pill div for "Sold <date>"
        if (!soldDateRaw && pillText.startsWith("sold")) {
          soldDateRaw = pillText;
        }

        if (beds === 0 || sqft === 0) {
          skipReasons[`no beds(${beds})/sqft(${sqft})`] = (skipReasons[`no beds(${beds})/sqft(${sqft})`] ?? 0) + 1;
          continue;
        }

        const saleDate = parseSaleDate(soldDateRaw);
        // For sold listings without a parsed date, use today as a fallback
        // so the record still gets imported (will score low on recency).
        const finalDate = saleDate ?? new Date().toISOString().slice(0, 10);

        const row: Row = {
          id:            randomUUID(),
          community:     neighbourhood || "Calgary",
          city:          "Calgary",
          latitude:      latStr,
          longitude:     lonStr,
          property_type: propertyType,
          beds:          String(beds),
          baths_full:    String(bathsFull),
          baths_half:    String(bathsHalf),
          gla_sqft:      String(sqft),
          lot_size_sqft: "",
          year_built:    String(yearBuilt || ""),
          condition:     "3",
          garage_spaces: "1",
          basement:      "unfinished",
          sale_date:     finalDate,
          sale_price:    String(salePrice),
        };

        fs.writeSync(fd, toCSVLine(row) + "\n");
        totalWritten++;
      } catch {
        // skip malformed card
      }
    }

    console.log(`  Running total: ${totalWritten} records`);

    // ---- Paginate ----------------------------------------------------------
    if (pageNum < MAX_PAGES) {
      // Try the next page URL directly (most reliable).
      const nextUrl = page.url().replace(/\/page-\d+/, "") + `/page-${pageNum + 1}`;
      try {
        await page.goto(nextUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });
        await page.waitForTimeout(2_000 + Math.random() * 1_000);
      } catch {
        console.log("  Failed to load next page -- stopping.");
        break;
      }
    }

    pageNum++;
  }

  fs.closeSync(fd);
  await browser.close();

  console.log(`\nDone. Wrote ${totalWritten} records to ${OUT_PATH}`);

  if (Object.keys(skipReasons).length > 0) {
    console.log("\nSkip reasons:");
    for (const [r, n] of Object.entries(skipReasons)) console.log(`  ${n}x  ${r}`);
  }

  if (totalWritten > 0) {
    console.log(`\nNext step:\n  npm run import ${OUT_PATH}`);
  } else {
    console.log(`\nNo records written. Check data/zolo-card-sample.html to inspect`);
    console.log(`the actual card HTML and verify the selectors match.`);
  }
}

main().catch((err) => {
  console.error("Scraper error:", err);
  process.exit(1);
});
