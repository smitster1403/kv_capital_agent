import { describe, it, expect } from "vitest";
import { computeAdjustments, ADJUSTMENT_CONFIG } from "@/lib/adjustments";
import { BASE_SUBJECT, makeSale } from "./fixtures";

// ---------------------------------------------------------------------------
// Direction: subject superior -> comp adjusts UP; comp superior -> comp adjusts DOWN
// ---------------------------------------------------------------------------

describe("computeAdjustments: GLA", () => {
  it("adjusts UP when subject has more GLA", () => {
    // Subject: 1800 sqft, comp: 1600 sqft => subject superior, comp goes up
    const comp = makeSale({ gla_sqft: 1600 });
    const { items } = computeAdjustments(BASE_SUBJECT, comp);
    const gla = items.find((i) => i.type === "GLA")!;
    expect(gla.direction).toBe("up");
    // 200 sqft diff: 200/100 * 4500 = $9000
    expect(gla.amount).toBe(9_000);
  });

  it("adjusts DOWN when subject has less GLA", () => {
    const comp = makeSale({ gla_sqft: 2000 });
    const { items } = computeAdjustments(BASE_SUBJECT, comp);
    const gla = items.find((i) => i.type === "GLA")!;
    expect(gla.direction).toBe("down");
    expect(gla.amount).toBe(9_000);
  });

  it("is none when GLA is identical", () => {
    const comp = makeSale({ gla_sqft: BASE_SUBJECT.gla_sqft });
    const { items } = computeAdjustments(BASE_SUBJECT, comp);
    const gla = items.find((i) => i.type === "GLA")!;
    expect(gla.direction).toBe("none");
    expect(gla.amount).toBe(0);
  });
});

describe("computeAdjustments: baths", () => {
  it("adjusts UP for each extra full bath on subject", () => {
    const comp = makeSale({ baths_full: 1 }); // subject has 2, comp has 1
    const { items } = computeAdjustments(BASE_SUBJECT, comp);
    const bath = items.find((i) => i.type === "Full baths")!;
    expect(bath.direction).toBe("up");
    expect(bath.amount).toBe(ADJUSTMENT_CONFIG.per_full_bath);
  });

  it("adjusts DOWN when comp has more full baths", () => {
    const comp = makeSale({ baths_full: 3 });
    const { items } = computeAdjustments(BASE_SUBJECT, comp);
    const bath = items.find((i) => i.type === "Full baths")!;
    expect(bath.direction).toBe("down");
    expect(bath.amount).toBe(ADJUSTMENT_CONFIG.per_full_bath);
  });

  it("adjusts half baths correctly", () => {
    // Subject has 1 half bath; comp has 0 => subject superior, comp UP
    const comp = makeSale({ baths_half: 0 });
    const { items } = computeAdjustments(BASE_SUBJECT, comp);
    const halfBath = items.find((i) => i.type === "Half baths")!;
    expect(halfBath.direction).toBe("up");
    expect(halfBath.amount).toBe(ADJUSTMENT_CONFIG.per_half_bath);
  });
});

describe("computeAdjustments: garage", () => {
  it("adjusts UP when subject has more garage stalls", () => {
    const comp = makeSale({ garage_spaces: 1 }); // subject has 2
    const { items } = computeAdjustments(BASE_SUBJECT, comp);
    const garage = items.find((i) => i.type === "Garage")!;
    expect(garage.direction).toBe("up");
    expect(garage.amount).toBe(ADJUSTMENT_CONFIG.per_garage_stall);
  });
});

describe("computeAdjustments: basement", () => {
  it("adjusts UP when subject is finished and comp is none", () => {
    const comp = makeSale({ basement: "none" });
    const { items } = computeAdjustments(BASE_SUBJECT, comp);
    const bsmt = items.find((i) => i.type === "Basement")!;
    expect(bsmt.direction).toBe("up");
    expect(bsmt.amount).toBe(ADJUSTMENT_CONFIG.finished_basement);
  });

  it("adjusts DOWN when comp is finished and subject is unfinished", () => {
    const subject = { ...BASE_SUBJECT, basement: "unfinished" as const };
    const comp = makeSale({ basement: "finished" });
    const { items } = computeAdjustments(subject, comp);
    const bsmt = items.find((i) => i.type === "Basement")!;
    expect(bsmt.direction).toBe("down");
    // finished(45k) - unfinished(15k) = 30k difference
    expect(bsmt.amount).toBe(30_000);
  });
});

describe("computeAdjustments: age", () => {
  it("adjusts UP when subject is newer", () => {
    // Subject built 2010, comp built 2000 => subject 10 years newer, comp UP
    const comp = makeSale({ year_built: 2000 });
    const { items } = computeAdjustments(BASE_SUBJECT, comp);
    const age = items.find((i) => i.type === "Age")!;
    expect(age.direction).toBe("up");
    expect(age.amount).toBe(10 * ADJUSTMENT_CONFIG.per_year_newer);
  });

  it("adjusts DOWN when comp is newer", () => {
    const comp = makeSale({ year_built: 2020 });
    const { items } = computeAdjustments(BASE_SUBJECT, comp);
    const age = items.find((i) => i.type === "Age")!;
    expect(age.direction).toBe("down");
    expect(age.amount).toBe(10 * ADJUSTMENT_CONFIG.per_year_newer);
  });
});

describe("computeAdjustments: condition", () => {
  it("adjusts UP when subject has higher condition", () => {
    const comp = makeSale({ condition: 2 }); // subject is condition 3
    const { items } = computeAdjustments(BASE_SUBJECT, comp);
    const cond = items.find((i) => i.type === "Condition")!;
    expect(cond.direction).toBe("up");
    expect(cond.amount).toBe(ADJUSTMENT_CONFIG.per_condition_step);
  });

  it("adjusts DOWN when comp has higher condition", () => {
    const comp = makeSale({ condition: 5 }); // subject is 3
    const { items } = computeAdjustments(BASE_SUBJECT, comp);
    const cond = items.find((i) => i.type === "Condition")!;
    expect(cond.direction).toBe("down");
    expect(cond.amount).toBe(2 * ADJUSTMENT_CONFIG.per_condition_step);
  });
});

// ---------------------------------------------------------------------------
// Adjusted price arithmetic
// ---------------------------------------------------------------------------

describe("computeAdjustments: adjusted_price", () => {
  it("returns sale_price unchanged when subject and comp are identical", () => {
    const comp = makeSale({
      gla_sqft:      BASE_SUBJECT.gla_sqft,
      baths_full:    BASE_SUBJECT.baths_full,
      baths_half:    BASE_SUBJECT.baths_half,
      garage_spaces: BASE_SUBJECT.garage_spaces,
      basement:      BASE_SUBJECT.basement,
      year_built:    BASE_SUBJECT.year_built,
      condition:     BASE_SUBJECT.condition,
      sale_price:    600_000,
    });
    const { adjusted_price, items } = computeAdjustments(BASE_SUBJECT, comp);
    expect(items.every((i) => i.direction === "none")).toBe(true);
    expect(adjusted_price).toBe(600_000);
  });

  it("correctly totals multiple up and down adjustments", () => {
    // Subject: bigger GLA (+$9000 up), one more full bath (+$7000 up),
    // comp 10 years newer (-$12000 down), same everything else.
    const comp = makeSale({
      gla_sqft:   1600,        // 200 sqft less => comp down by $9000, so comp goes UP $9000
      baths_full: 1,           // subject has 2 => comp goes UP $7000
      year_built: 2020,        // comp 10 years newer => comp goes DOWN $12000
      baths_half:    BASE_SUBJECT.baths_half,
      garage_spaces: BASE_SUBJECT.garage_spaces,
      basement:      BASE_SUBJECT.basement,
      condition:     BASE_SUBJECT.condition,
      sale_price:    700_000,
    });
    const { adjusted_price } = computeAdjustments(BASE_SUBJECT, comp);
    // net = +9000 + 7000 - 12000 = +4000
    expect(adjusted_price).toBe(704_000);
  });
});
