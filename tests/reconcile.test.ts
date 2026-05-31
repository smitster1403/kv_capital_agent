import { describe, it, expect } from "vitest";
import { reconcile } from "@/lib/reconcile";

describe("reconcile", () => {
  it("throws on empty input", () => {
    expect(() => reconcile([])).toThrow();
  });

  it("returns the single comp price when only one comp is given", () => {
    const result = reconcile([{ weight: 1, adjusted_price: 800_000 }]);
    expect(result.estimate).toBe(800_000);
    expect(result.range_low).toBe(800_000);
    expect(result.range_high).toBe(800_000);
  });

  it("computes a simple average when weights are equal", () => {
    const result = reconcile([
      { weight: 1, adjusted_price: 700_000 },
      { weight: 1, adjusted_price: 800_000 },
      { weight: 1, adjusted_price: 900_000 },
    ]);
    expect(result.estimate).toBe(800_000);
  });

  it("weights the estimate toward the higher-weight comp", () => {
    const result = reconcile([
      { weight: 3, adjusted_price: 900_000 }, // 75%
      { weight: 1, adjusted_price: 700_000 }, // 25%
    ]);
    // 0.75*900k + 0.25*700k = 675k + 175k = 850k
    expect(result.estimate).toBe(850_000);
  });

  it("normalizes weights that do not sum to 1.0", () => {
    // Weights 2 and 2 should produce same result as 1 and 1 (equal weight).
    const unnormalized = reconcile([
      { weight: 2, adjusted_price: 600_000 },
      { weight: 2, adjusted_price: 800_000 },
    ]);
    expect(unnormalized.estimate).toBe(700_000);
  });

  it("sets range_low to the minimum adjusted price", () => {
    const result = reconcile([
      { weight: 1, adjusted_price: 850_000 },
      { weight: 1, adjusted_price: 750_000 },
      { weight: 1, adjusted_price: 800_000 },
    ]);
    expect(result.range_low).toBe(750_000);
  });

  it("sets range_high to the maximum adjusted price", () => {
    const result = reconcile([
      { weight: 1, adjusted_price: 850_000 },
      { weight: 1, adjusted_price: 750_000 },
      { weight: 1, adjusted_price: 800_000 },
    ]);
    expect(result.range_high).toBe(850_000);
  });

  it("handles fractional weights correctly", () => {
    // 0.4 + 0.35 + 0.25 = 1.0 (agent-style weights)
    const result = reconcile([
      { weight: 0.4,  adjusted_price: 750_000 },
      { weight: 0.35, adjusted_price: 800_000 },
      { weight: 0.25, adjusted_price: 820_000 },
    ]);
    // 0.4*750k + 0.35*800k + 0.25*820k = 300k + 280k + 205k = 785k
    expect(result.estimate).toBe(785_000);
  });
});
