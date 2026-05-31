/*
 * End-to-end smoke test: runs the full pipeline against a real subject property
 * and prints the ValuationReport to stdout.
 *
 * Usage:
 *   npx tsx scripts/smoke-test.ts
 *
 * Requires ANTHROPIC_API_KEY in .env.local (or environment).
 */

// Load .env.local so ANTHROPIC_API_KEY is available when running via tsx.
import { readFileSync } from "fs";
try {
  const env = readFileSync(".env.local", "utf8");
  for (const line of env.split("\n")) {
    const [k, ...rest] = line.split("=");
    if (k && rest.length) process.env[k.trim()] = rest.join("=").trim();
  }
} catch { /* .env.local not present, rely on shell env */ }

import type { SubjectProperty } from "../src/lib/types";
import { runAgent } from "../src/lib/agent";
import { buildReport, buildInsufficientCompsReport } from "../src/lib/report";

const subject: SubjectProperty = {
  id: "smoke-subject-1",
  community: "Evanston",
  city: "Calgary",
  latitude: 51.1782,
  longitude: -114.1453,
  property_type: "detached",
  beds: 4,
  baths_full: 2,
  baths_half: 1,
  gla_sqft: 1800,
  lot_size_sqft: 5000,
  year_built: 2010,
  condition: 3,
  garage_spaces: 2,
  basement: "finished",
};

console.log("Subject property:");
console.log(JSON.stringify(subject, null, 2));
console.log("\nRunning agent...");

async function main() {
  const agentOutput = await runAgent(subject);

  if (!agentOutput) {
    console.log("\nAgent returned no selection. Building guardrail report.");
    const report = buildInsufficientCompsReport(
      "Agent could not find sufficient comparable sales."
    );
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log("\nAgent selection:");
  console.log(JSON.stringify(agentOutput, null, 2));

  console.log("\nBuilding report...");
  const report = buildReport(subject, agentOutput);

  console.log("\nValuation Report:");
  console.log("=================");
  console.log(`Estimate:   $${report.estimate.toLocaleString()}`);
  console.log(`Range:      $${report.range_low.toLocaleString()} - $${report.range_high.toLocaleString()}`);
  console.log(`Confidence: ${report.confidence}`);
  console.log(`Comps used: ${report.selected_comps.length}`);
  console.log(`Flags:      ${report.flags.length > 0 ? report.flags.join(", ") : "none"}`);
  console.log(`\nRationale:\n${report.rationale}`);
  console.log("\nFull report JSON:");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => { console.error(err); process.exit(1); });
