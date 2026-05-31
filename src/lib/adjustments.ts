import type { SubjectProperty, SaleRecord, AdjustmentItem } from "./types";

// Contributory value estimates for Calgary residential properties.
// Production values should be derived from paired sales regression on actual MLS data.
export const ADJUSTMENT_CONFIG = {
  gla_per_100sqft:     4_500,   // $ per 100 sqft difference in gross living area
  per_full_bath:       7_000,
  per_half_bath:       3_000,
  per_garage_stall:   15_000,
  finished_basement:  45_000,   // premium over "none"
  unfinished_basement:15_000,   // premium over "none"
  per_year_newer:      1_200,   // per year the subject is newer than the comp
  per_condition_step: 15_000,   // per point on the 1-5 condition scale
} as const;

const BASEMENT_VALUE: Record<string, number> = {
  none:       0,
  unfinished: ADJUSTMENT_CONFIG.unfinished_basement,
  finished:   ADJUSTMENT_CONFIG.finished_basement,
};

// Direction rule: adjustments are applied to the comp to make it equivalent to
// the subject. If the subject is superior, the comp price goes up. If the comp
// is superior, the comp price goes down.
function makeItem(type: string, netAmount: number): AdjustmentItem {
  if (netAmount === 0) return { type, direction: "none", amount: 0 };
  return {
    type,
    direction: netAmount > 0 ? "up" : "down",
    amount: Math.abs(netAmount),
  };
}

export interface AdjustmentResult {
  items: AdjustmentItem[];
  adjusted_price: number;
}

export function computeAdjustments(
  subject: SubjectProperty,
  comp: SaleRecord
): AdjustmentResult {
  const items: AdjustmentItem[] = [];
  let net = 0;

  // GLA
  const glaAdj = Math.round(
    ((subject.gla_sqft - comp.gla_sqft) / 100) * ADJUSTMENT_CONFIG.gla_per_100sqft
  );
  items.push(makeItem("GLA", glaAdj));
  net += glaAdj;

  // Full baths
  const fullBathAdj =
    (subject.baths_full - comp.baths_full) * ADJUSTMENT_CONFIG.per_full_bath;
  items.push(makeItem("Full baths", fullBathAdj));
  net += fullBathAdj;

  // Half baths
  const halfBathAdj =
    (subject.baths_half - comp.baths_half) * ADJUSTMENT_CONFIG.per_half_bath;
  items.push(makeItem("Half baths", halfBathAdj));
  net += halfBathAdj;

  // Garage
  const garageAdj =
    (subject.garage_spaces - comp.garage_spaces) * ADJUSTMENT_CONFIG.per_garage_stall;
  items.push(makeItem("Garage", garageAdj));
  net += garageAdj;

  // Basement
  const bsmtAdj =
    (BASEMENT_VALUE[subject.basement] ?? 0) - (BASEMENT_VALUE[comp.basement] ?? 0);
  items.push(makeItem("Basement", bsmtAdj));
  net += bsmtAdj;

  // Age (year built)
  const ageAdj =
    (subject.year_built - comp.year_built) * ADJUSTMENT_CONFIG.per_year_newer;
  items.push(makeItem("Age", ageAdj));
  net += ageAdj;

  // Condition
  const condAdj =
    (subject.condition - comp.condition) * ADJUSTMENT_CONFIG.per_condition_step;
  items.push(makeItem("Condition", condAdj));
  net += condAdj;

  return {
    items,
    adjusted_price: Math.round(comp.sale_price + net),
  };
}
