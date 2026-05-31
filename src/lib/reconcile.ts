export interface ReconcileInput {
  weight: number;
  adjusted_price: number;
}

export interface ReconcileResult {
  estimate: number;
  range_low: number;
  range_high: number;
}

// Weighted average of adjusted prices; range is min/max of the selected comps.
// Weights are normalized so they don't need to sum to exactly 1.0 here
// (the agent is asked to sum them to 1, but we normalize defensively).
export function reconcile(comps: ReconcileInput[]): ReconcileResult {
  if (comps.length === 0) throw new Error("Cannot reconcile with zero comps");

  const totalWeight = comps.reduce((sum, c) => sum + c.weight, 0);
  if (totalWeight === 0) throw new Error("Total weight must be greater than zero");

  const estimate =
    comps.reduce((sum, c) => sum + c.adjusted_price * (c.weight / totalWeight), 0);

  const prices = comps.map((c) => c.adjusted_price);

  return {
    estimate: Math.round(estimate),
    range_low: Math.min(...prices),
    range_high: Math.max(...prices),
  };
}
