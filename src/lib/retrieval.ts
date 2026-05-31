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
//   geographic distance 35%, recency 25%, GLA proximity 25%, beds/baths 15%
// Each component is normalized to [0, 1] relative to the filter thresholds.
export function scoreComp(
  subject: SubjectProperty,
  comp: SaleRecord,
  filters: CompSearchFilters,
  today: Date = new Date()
): number {
  const dist = haversineKm(
    subject.latitude,
    subject.longitude,
    comp.latitude,
    comp.longitude
  );
  const days = daysBetween(comp.sale_date, today);
  const glaDelta = Math.abs(comp.gla_sqft - subject.gla_sqft) / subject.gla_sqft;

  const distScore = dist / filters.radiusKm;
  const recencyScore = Math.min(days / filters.maxAgeDays, 1);
  const glaScore = Math.min(glaDelta / filters.glaTolerancePct, 1);
  const bedScore = Math.min(Math.abs(comp.beds - subject.beds) / 3, 1);
  const bathScore = Math.min(Math.abs(comp.baths_full - subject.baths_full) / 2, 1);

  return (
    0.35 * distScore +
    0.25 * recencyScore +
    0.25 * glaScore +
    0.075 * bedScore +
    0.075 * bathScore
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

  // Exact Haversine filter, then score and rank.
  const scored = candidates
    .filter(
      (c) =>
        haversineKm(
          subject.latitude,
          subject.longitude,
          c.latitude,
          c.longitude
        ) <= filters.radiusKm
    )
    .map((c) => ({ comp: c, score: scoreComp(subject, c, filters, today) }));

  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, filters.topN).map((s) => s.comp);
}
