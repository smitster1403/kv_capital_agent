import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, insertSale } from "@/lib/db";
import { searchComps, haversineKm, scoreComp } from "@/lib/retrieval";
import { CompSearchFiltersSchema } from "@/lib/types";
import type Database from "better-sqlite3";
import { BASE_SUBJECT, makeSale } from "./fixtures";

// ---------------------------------------------------------------------------
// haversineKm unit tests
// ---------------------------------------------------------------------------

describe("haversineKm", () => {
  it("returns 0 for identical coords", () => {
    expect(haversineKm(51.0, -114.0, 51.0, -114.0)).toBe(0);
  });

  it("returns ~111 km per degree of latitude", () => {
    const dist = haversineKm(51.0, -114.0, 52.0, -114.0);
    expect(dist).toBeGreaterThan(110);
    expect(dist).toBeLessThan(112);
  });

  it("is symmetric", () => {
    const a = haversineKm(51.0, -114.0, 51.05, -114.1);
    const b = haversineKm(51.05, -114.1, 51.0, -114.0);
    expect(Math.abs(a - b)).toBeLessThan(0.001);
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let db: Database.Database;

beforeEach(() => {
  db = createTestDb();
});

function seed(...sales: ReturnType<typeof makeSale>[]) {
  for (const s of sales) insertSale(db, s);
}

const DEFAULT_FILTERS = CompSearchFiltersSchema.parse({});

// ---------------------------------------------------------------------------
// Property type filter
// ---------------------------------------------------------------------------

describe("searchComps: property_type filter", () => {
  it("excludes comps of a different property type", () => {
    seed(
      makeSale({ id: "condo-1", property_type: "apartment_condo", sale_date: "2026-03-01" }),
      makeSale({ id: "det-1",   property_type: "detached",         sale_date: "2026-03-01" })
    );
    const results = searchComps(BASE_SUBJECT, {}, db);
    expect(results.every((c) => c.property_type === "detached")).toBe(true);
    expect(results.map((c) => c.id)).not.toContain("condo-1");
  });
});

// ---------------------------------------------------------------------------
// Date filter
// ---------------------------------------------------------------------------

describe("searchComps: date filter", () => {
  it("excludes comps sold before the cutoff (default 180 days)", () => {
    seed(
      makeSale({ id: "old-sale",    sale_date: "2020-01-01" }),
      makeSale({ id: "recent-sale", sale_date: "2026-04-01" })
    );
    const results = searchComps(BASE_SUBJECT, {}, db);
    expect(results.map((c) => c.id)).not.toContain("old-sale");
    expect(results.map((c) => c.id)).toContain("recent-sale");
  });

  it("includes comps within a relaxed date window", () => {
    // ~270 days ago: outside 180-day tight window, inside 365-day relaxed window.
    const cutoffSale = makeSale({ id: "one-year", sale_date: "2025-09-15" });
    seed(cutoffSale);
    const tight = searchComps(BASE_SUBJECT, { maxAgeDays: 180 }, db);
    const relaxed = searchComps(BASE_SUBJECT, { maxAgeDays: 365 }, db);
    expect(tight.map((c) => c.id)).not.toContain("one-year");
    expect(relaxed.map((c) => c.id)).toContain("one-year");
  });
});

// ---------------------------------------------------------------------------
// GLA filter
// ---------------------------------------------------------------------------

describe("searchComps: GLA filter", () => {
  it("excludes comps outside the ±20% GLA tolerance", () => {
    // Subject GLA = 1800. 20% tolerance: 1440 - 2160.
    seed(
      makeSale({ id: "too-small", gla_sqft: 1000, sale_date: "2026-04-01" }),
      makeSale({ id: "too-large", gla_sqft: 3000, sale_date: "2026-04-01" }),
      makeSale({ id: "just-right",gla_sqft: 1900, sale_date: "2026-04-01" })
    );
    const results = searchComps(BASE_SUBJECT, {}, db);
    const ids = results.map((c) => c.id);
    expect(ids).not.toContain("too-small");
    expect(ids).not.toContain("too-large");
    expect(ids).toContain("just-right");
  });
});

// ---------------------------------------------------------------------------
// Radius filter
// ---------------------------------------------------------------------------

describe("searchComps: radius filter", () => {
  it("excludes comps beyond the radius", () => {
    // ~15 km from subject center (51.178, -114.145)
    seed(
      makeSale({ id: "far-away", latitude: 51.310, longitude: -114.145, sale_date: "2026-04-01" }),
      makeSale({ id: "nearby",   latitude: 51.180, longitude: -114.148, sale_date: "2026-04-01" })
    );
    const results = searchComps(BASE_SUBJECT, { radiusKm: 5 }, db);
    const ids = results.map((c) => c.id);
    expect(ids).not.toContain("far-away");
    expect(ids).toContain("nearby");
  });

  it("includes the far comp when radius is relaxed", () => {
    seed(
      makeSale({ id: "far-away", latitude: 51.310, longitude: -114.145, sale_date: "2026-04-01" })
    );
    const tight   = searchComps(BASE_SUBJECT, { radiusKm: 5 }, db);
    const relaxed = searchComps(BASE_SUBJECT, { radiusKm: 20 }, db);
    expect(tight.map((c) => c.id)).not.toContain("far-away");
    expect(relaxed.map((c) => c.id)).toContain("far-away");
  });
});

// ---------------------------------------------------------------------------
// Ranking: closer and more recent should score lower (rank higher)
// ---------------------------------------------------------------------------

describe("searchComps: ranking", () => {
  it("ranks the closer comp above the distant comp", () => {
    // Both comps are identical except distance.
    const close  = makeSale({ id: "close",   latitude: 51.1782, longitude: -114.1451, sale_date: "2026-04-01" });
    const farish = makeSale({ id: "farish",  latitude: 51.2000, longitude: -114.1600, sale_date: "2026-04-01" });
    seed(close, farish);
    const results = searchComps(BASE_SUBJECT, {}, db);
    const ids = results.map((c) => c.id);
    expect(ids.indexOf("close")).toBeLessThan(ids.indexOf("farish"));
  });

  it("ranks the more recent comp above the older comp at the same location", () => {
    // Use dates well inside the 180-day window to avoid boundary sensitivity.
    const newer = makeSale({ id: "newer", sale_date: "2026-04-15" });
    const older = makeSale({ id: "older", sale_date: "2026-01-15" });
    seed(newer, older);
    const results = searchComps(BASE_SUBJECT, {}, db);
    const ids = results.map((c) => c.id);
    expect(ids.indexOf("newer")).toBeLessThan(ids.indexOf("older"));
  });

  it("ranks the comp with matching GLA above one with bigger GLA delta", () => {
    // 2100 is 16.7% delta -- within the 20% tolerance but further than 1800.
    const exact   = makeSale({ id: "exact-gla",  gla_sqft: 1800, sale_date: "2026-04-01" });
    const further = makeSale({ id: "further-gla", gla_sqft: 2100, sale_date: "2026-04-01" });
    seed(exact, further);
    const results = searchComps(BASE_SUBJECT, {}, db);
    const ids = results.map((c) => c.id);
    expect(ids.indexOf("exact-gla")).toBeLessThan(ids.indexOf("further-gla"));
  });

  it("respects topN limit", () => {
    for (let i = 0; i < 20; i++) {
      seed(makeSale({ sale_date: "2026-04-01" }));
    }
    const results = searchComps(BASE_SUBJECT, { topN: 5 }, db);
    expect(results.length).toBeLessThanOrEqual(5);
  });
});

// ---------------------------------------------------------------------------
// scoreComp: unit test the scoring function directly
// ---------------------------------------------------------------------------

describe("scoreComp", () => {
  it("scores an identical comp near-zero", () => {
    const comp = makeSale({ latitude: 51.178, longitude: -114.145, sale_date: "2026-05-25" });
    const score = scoreComp(BASE_SUBJECT, comp, DEFAULT_FILTERS);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThan(0.1);
  });

  it("closer comp scores lower than distant comp, all else equal", () => {
    const refDate = new Date("2026-05-30");
    const close = makeSale({ id: "c", latitude: 51.179, longitude: -114.146, sale_date: "2026-04-01" });
    const far   = makeSale({ id: "f", latitude: 51.210, longitude: -114.200, sale_date: "2026-04-01" });
    const scoreClose = scoreComp(BASE_SUBJECT, close, DEFAULT_FILTERS, refDate);
    const scoreFar   = scoreComp(BASE_SUBJECT, far,   DEFAULT_FILTERS, refDate);
    expect(scoreClose).toBeLessThan(scoreFar);
  });
});
