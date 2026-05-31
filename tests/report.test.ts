import { describe, it, expect, beforeEach } from "vitest";
import { buildReport, buildInsufficientCompsReport } from "@/lib/report";
import { createTestDb, insertSale } from "@/lib/db";
import type Database from "better-sqlite3";
import type { AgentOutput } from "@/lib/types";
import { BASE_SUBJECT, makeSale } from "./fixtures";

// Three known comps to seed into the test db.
const COMP_A = makeSale({
  id: "comp-a",
  gla_sqft: 1850,
  baths_full: 2,
  baths_half: 1,
  year_built: 2010,
  condition: 3,
  garage_spaces: 2,
  basement: "finished",
  sale_price: 710_000,
  sale_date: "2026-03-15",
});

const COMP_B = makeSale({
  id: "comp-b",
  gla_sqft: 1700,
  baths_full: 2,
  baths_half: 0,
  year_built: 2008,
  condition: 3,
  garage_spaces: 2,
  basement: "finished",
  sale_price: 680_000,
  sale_date: "2026-02-20",
});

const COMP_C = makeSale({
  id: "comp-c",
  gla_sqft: 1950,
  baths_full: 3,
  baths_half: 1,
  year_built: 2014,
  condition: 4,
  garage_spaces: 2,
  basement: "finished",
  sale_price: 760_000,
  sale_date: "2026-04-01",
});

// Mock agent output referencing the three comps above.
const MOCK_AGENT_OUTPUT: AgentOutput = {
  selected_comps: [
    { comp_id: "comp-a", weight: 0.4, note: "Closest match by GLA and year built" },
    { comp_id: "comp-b", weight: 0.35, note: "Similar size, slightly older" },
    { comp_id: "comp-c", weight: 0.25, note: "Larger and newer, requires downward adjustments" },
  ],
  rationale:
    "Three nearby detached homes provide a consistent value range. Comp A is the strongest indicator given its close GLA and identical year built. Comps B and C bracket the subject from below and above respectively.",
  confidence: "medium",
  flags: [],
};

let db: Database.Database;

beforeEach(() => {
  db = createTestDb();
  insertSale(db, COMP_A);
  insertSale(db, COMP_B);
  insertSale(db, COMP_C);
});

describe("buildReport: structure", () => {
  it("returns a report with the correct number of selected comps", () => {
    const report = buildReport(BASE_SUBJECT, MOCK_AGENT_OUTPUT, db);
    expect(report.selected_comps).toHaveLength(3);
  });

  it("carries agent confidence and rationale through unchanged", () => {
    const report = buildReport(BASE_SUBJECT, MOCK_AGENT_OUTPUT, db);
    expect(report.confidence).toBe("medium");
    expect(report.rationale).toBe(MOCK_AGENT_OUTPUT.rationale);
  });

  it("carries flags through unchanged", () => {
    const agentWithFlags: AgentOutput = {
      ...MOCK_AGENT_OUTPUT,
      flags: ["limited comps in radius"],
    };
    const report = buildReport(BASE_SUBJECT, agentWithFlags, db);
    expect(report.flags).toEqual(["limited comps in radius"]);
  });
});

describe("buildReport: adjustments", () => {
  it("computes adjustments for each selected comp", () => {
    const report = buildReport(BASE_SUBJECT, MOCK_AGENT_OUTPUT, db);
    for (const rc of report.selected_comps) {
      expect(rc.adjustments.length).toBeGreaterThan(0);
      expect(rc.adjusted_price).toBeTypeOf("number");
    }
  });

  it("adjusts comp-a upward because subject has less GLA (1800 vs 1850)", () => {
    const report = buildReport(BASE_SUBJECT, MOCK_AGENT_OUTPUT, db);
    const compA = report.selected_comps.find((c) => c.comp.id === "comp-a")!;
    const glaItem = compA.adjustments.find((a) => a.type === "GLA")!;
    // Subject 1800, comp-a 1850 => comp is bigger => adjust comp DOWN
    expect(glaItem.direction).toBe("down");
  });

  it("adjusts comp-b upward for half bath difference (subject 1, comp-b 0)", () => {
    const report = buildReport(BASE_SUBJECT, MOCK_AGENT_OUTPUT, db);
    const compB = report.selected_comps.find((c) => c.comp.id === "comp-b")!;
    const halfBathItem = compB.adjustments.find((a) => a.type === "Half baths")!;
    expect(halfBathItem.direction).toBe("up");
  });
});

describe("buildReport: reconciliation", () => {
  it("produces a numeric estimate", () => {
    const report = buildReport(BASE_SUBJECT, MOCK_AGENT_OUTPUT, db);
    expect(report.estimate).toBeTypeOf("number");
    expect(report.estimate).toBeGreaterThan(0);
  });

  it("range_low <= estimate <= range_high", () => {
    const report = buildReport(BASE_SUBJECT, MOCK_AGENT_OUTPUT, db);
    expect(report.range_low).toBeLessThanOrEqual(report.estimate);
    expect(report.estimate).toBeLessThanOrEqual(report.range_high);
  });

  it("weights heavier comps more in the estimate", () => {
    // Comp A is cheapest adjusted and has the highest weight (0.4).
    // Shifting all weight to comp A should produce a lower estimate.
    const allWeightOnA: AgentOutput = {
      ...MOCK_AGENT_OUTPUT,
      selected_comps: [{ comp_id: "comp-a", weight: 1, note: "only comp" }],
    };
    const allWeightOnC: AgentOutput = {
      ...MOCK_AGENT_OUTPUT,
      selected_comps: [{ comp_id: "comp-c", weight: 1, note: "only comp" }],
    };
    const reportA = buildReport(BASE_SUBJECT, allWeightOnA, db);
    const reportC = buildReport(BASE_SUBJECT, allWeightOnC, db);
    // Comp C has a higher sale price so its adjusted price should be higher.
    expect(reportC.estimate).toBeGreaterThan(reportA.estimate);
  });
});

describe("buildInsufficientCompsReport", () => {
  it("returns low confidence with zero estimate", () => {
    const report = buildInsufficientCompsReport("No comps found.");
    expect(report.confidence).toBe("low");
    expect(report.estimate).toBe(0);
    expect(report.selected_comps).toHaveLength(0);
    expect(report.flags.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Live smoke test (gated behind env flag to avoid accidental LLM calls)
// ---------------------------------------------------------------------------
const LIVE = process.env.RUN_LIVE_SMOKE === "true";

describe.skipIf(!LIVE)("live smoke test (RUN_LIVE_SMOKE=true)", () => {
  it("produces a valid report for a real subject property", async () => {
    const { runAgent } = await import("@/lib/agent");

    const agentOutput = await runAgent(BASE_SUBJECT);
    expect(agentOutput).not.toBeNull();

    const report = buildReport(BASE_SUBJECT, agentOutput!, db);
    expect(report.estimate).toBeGreaterThan(0);
    expect(report.confidence).toMatch(/low|medium|high/);
    expect(report.selected_comps.length).toBeGreaterThanOrEqual(1);
  }, 60_000);
});
