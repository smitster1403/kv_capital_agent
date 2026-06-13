import type Database from "better-sqlite3";
import { getDb, querySalesFromDb } from "./db";
import type { SubjectProperty, SaleRecord, CompSearchFilters } from "./types";
import { CompSearchFiltersSchema } from "./types";

// Haversine great-circle distance in km.
export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function subtractDays(ref: Date, days: number): string {
  // Use UTC getters/setters to stay consistent with toISOString() output.
  const d = new Date(ref);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(dateStr: string, ref: Date): number {
  return Math.floor((ref.getTime() - new Date(dateStr).getTime()) / 86_400_000);
}

// Composite similarity score (lower = better). Weights:
//   distance 30%, recency 20%, GLA 20%, year_built 10%, beds 5%, baths 5%, $/sqft 10%
// medianPsf is the pool median -- pass 0 to skip the $/sqft component.
export function scoreComp(
  subject: SubjectProperty,
  comp: SaleRecord,
  filters: CompSearchFilters,
  today: Date = new Date(),
  medianPsf: number = 0
): number {
  const dist = haversineKm(
    subject.latitude,
    subject.longitude,
    comp.latitude,
    comp.longitude
  );
  const days = daysBetween(comp.sale_date, today);
  const glaDelta = Math.abs(comp.gla_sqft - subject.gla_sqft) / subject.gla_sqft;
  const yearDelta = Math.abs(comp.year_built - subject.year_built);

  const distScore    = Math.min(dist / filters.radiusKm, 1);
  const recencyScore = Math.min(days / filters.maxAgeDays, 1);
  const glaScore     = Math.min(glaDelta / filters.glaTolerancePct, 1);
  const yearScore    = Math.min(yearDelta / filters.yearBuiltToleranceYears, 1);
  const bedScore     = Math.min(Math.abs(comp.beds - subject.beds) / 3, 1);
  const bathScore    = Math.min(Math.abs(comp.baths_full - subject.baths_full) / 2, 1);

  let psfScore = 0;
  if (medianPsf > 0) {
    const compPsf = comp.sale_price / comp.gla_sqft;
    // Normalize: 30%+ deviation from median = max penalty
    psfScore = Math.min(Math.abs(compPsf - medianPsf) / (medianPsf * 0.30), 1);
  }

  return (
    0.30 * distScore +
    0.20 * recencyScore +
    0.20 * glaScore +
    0.10 * yearScore +
    0.05 * bedScore +
    0.05 * bathScore +
    0.10 * psfScore
  );
}

// Search for comparable sales and return up to filters.topN ranked by similarity.
// Pass a db instance to use a specific database (useful for tests); omit to use
// the singleton production database.
export function searchComps(
  subject: SubjectProperty,
  rawFilters: Partial<CompSearchFilters> = {},
  db?: Database.Database
): SaleRecord[] {
  const filters = CompSearchFiltersSchema.parse(rawFilters);
  const today = new Date();
  const cutoff = subtractDays(today, filters.maxAgeDays);

  // Bounding box pre-filter in SQL to avoid full-table Haversine scan.
  // 1 degree latitude ~= 111 km; longitude degree varies with cos(lat).
  const latDelta = filters.radiusKm / 111;
  const lonDelta =
    filters.radiusKm / (111 * Math.cos((subject.latitude * Math.PI) / 180));

  const glaMin = subject.gla_sqft * (1 - filters.glaTolerancePct);
  const glaMax = subject.gla_sqft * (1 + filters.glaTolerancePct);

  const dbInstance = db ?? getDb();
  const candidates = querySalesFromDb(dbInstance, {
    property_type: subject.property_type,
    saleDateAfter: cutoff,
    glaMin,
    glaMax,
    latMin: subject.latitude - latDelta,
    latMax: subject.latitude + latDelta,
    lonMin: subject.longitude - lonDelta,
    lonMax: subject.longitude + lonDelta,
  });

  // Exact Haversine filter (SQL bounding box is an approximation).
  // year_built is NOT a hard cut -- it's already a scoring factor in scoreComp,
  // so comps outside the age range are deprioritised, not rejected.
  const withinRange = candidates.filter(
    (c) =>
      haversineKm(subject.latitude, subject.longitude, c.latitude, c.longitude) <=
        filters.radiusKm
  );

  // Compute pool median $/sqft for the scoring component.
  const psfValues = withinRange
    .map((c) => c.sale_price / c.gla_sqft)
    .sort((a, b) => a - b);
  const medianPsf =
    psfValues.length > 0 ? psfValues[Math.floor(psfValues.length / 2)] : 0;

  const scored = withinRange.map((c) => ({
    comp: c,
    score: scoreComp(subject, c, filters, today, medianPsf),
  }));

  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, filters.topN).map((s) => s.comp);
}
