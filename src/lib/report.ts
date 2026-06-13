import type Database from "better-sqlite3";
import { getSaleById, getSaleByIdFromDb } from "./db";
import { computeAdjustments } from "./adjustments";
import { reconcile } from "./reconcile";
import { haversineKm } from "./retrieval";
import type {
  SubjectProperty,
  AgentOutput,
  ValuationReport,
  ReportComp,
  CandidateComp,
  SaleRecord,
} from "./types";

// Guardrail response when no viable comps could be found.
export function buildInsufficientCompsReport(reason: string): ValuationReport {
  return {
    estimate: 0,
    range_low: 0,
    range_high: 0,
    confidence: "low",
    selected_comps: [],
    all_candidates: [],
    rationale: reason,
    flags: ["Insufficient comparable sales to produce a reliable estimate"],
  };
}

// Assemble the final ValuationReport from agent selections.
// db overrides the singleton (useful in tests).
// candidates is the full pool the agent saw -- included in the report for UI display.
export function buildReport(
  subject: SubjectProperty,
  agentOutput: AgentOutput,
  db?: Database.Database,
  candidates?: SaleRecord[]
): ValuationReport {
  const lookup = (id: string) =>
    db ? getSaleByIdFromDb(db, id) : getSaleById(id);

  const reportComps: ReportComp[] = [];
  const reconcileInputs: { weight: number; adjusted_price: number }[] = [];

  for (const selection of agentOutput.selected_comps) {
    const comp = lookup(selection.comp_id);
    if (!comp) {
      console.warn(`Comp ID not found in database: ${selection.comp_id}`);
      continue;
    }

    const { items, adjusted_price } = computeAdjustments(subject, comp);

    reportComps.push({
      comp,
      weight: selection.weight,
      adjustments: items,
      adjusted_price,
      note: selection.note,
    });

    reconcileInputs.push({ weight: selection.weight, adjusted_price });
  }

  if (reconcileInputs.length === 0) {
    return buildInsufficientCompsReport(
      "Agent selected comp IDs that could not be located in the database."
    );
  }

  const { estimate, range_low, range_high } = reconcile(reconcileInputs);

  const selectedIds = new Set(agentOutput.selected_comps.map((s) => s.comp_id));
  const today = new Date();

  const all_candidates: CandidateComp[] = (candidates ?? []).map((c) => ({
    id: c.id,
    community: c.community,
    distance_km: parseFloat(
      haversineKm(subject.latitude, subject.longitude, c.latitude, c.longitude).toFixed(2)
    ),
    days_since_sale: Math.floor(
      (today.getTime() - new Date(c.sale_date).getTime()) / 86_400_000
    ),
    sale_date: c.sale_date,
    property_type: c.property_type,
    beds: c.beds,
    baths_full: c.baths_full,
    baths_half: c.baths_half,
    gla_sqft: c.gla_sqft,
    year_built: c.year_built,
    condition: c.condition,
    garage_spaces: c.garage_spaces,
    basement: c.basement,
    sale_price: c.sale_price,
    price_per_sqft: Math.round(c.sale_price / c.gla_sqft),
    selected: selectedIds.has(c.id),
  }));

  return {
    estimate,
    range_low,
    range_high,
    confidence: agentOutput.confidence,
    selected_comps: reportComps,
    all_candidates,
    rationale: agentOutput.rationale,
    flags: agentOutput.flags,
  };
}
