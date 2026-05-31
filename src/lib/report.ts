import type Database from "better-sqlite3";
import { getSaleById, getSaleByIdFromDb } from "./db";
import { computeAdjustments } from "./adjustments";
import { reconcile } from "./reconcile";
import type { SubjectProperty, AgentOutput, ValuationReport, ReportComp } from "./types";

// Guardrail response when no viable comps could be found.
export function buildInsufficientCompsReport(reason: string): ValuationReport {
  return {
    estimate: 0,
    range_low: 0,
    range_high: 0,
    confidence: "low",
    selected_comps: [],
    rationale: reason,
    flags: ["Insufficient comparable sales to produce a reliable estimate"],
  };
}

// Assemble the final ValuationReport from agent selections.
// Pass a db instance to override the singleton (useful in tests).
export function buildReport(
  subject: SubjectProperty,
  agentOutput: AgentOutput,
  db?: Database.Database
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

  return {
    estimate,
    range_low,
    range_high,
    confidence: agentOutput.confidence,
    selected_comps: reportComps,
    rationale: agentOutput.rationale,
    flags: agentOutput.flags,
  };
}
