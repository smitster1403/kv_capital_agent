import { generateText, tool } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import type { SubjectProperty, SaleRecord, AgentOutput } from "./types";
import { AgentOutputSchema } from "./types";
import { searchComps as searchCompsLib, haversineKm } from "./retrieval";

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const BASE_SYSTEM_PROMPT = `You are an experienced residential property appraiser working in Calgary, Alberta, Canada. Your task is to select the best comparable sales and write a defensible appraisal rationale.

WORKFLOW:
1. Call searchComps to retrieve candidates using default filters.
2. If you receive fewer than 3 candidates, relax the filters and call searchComps again. Relaxation order: first increase radiusKm (try 8, then 12), then increase glaTolerancePct (try 0.40, then 0.50), then increase maxAgeDays (try 270, then 365).
3. Once you have enough candidates, call submitSelection with your analysis.

SELECTION CRITERIA (prefer comps that):
- Are geographically closest to the subject
- Sold most recently
- Are most similar in GLA, beds, baths, year built, and condition
- Would require the fewest and smallest adjustments to match the subject

RULES (critical):
- Select 3 to 5 comps. Do NOT select fewer than 3 unless no others exist.
- Assign weights that sum to exactly 1.0. Higher weight means more similar and more reliable.
- Do NOT compute or output any dollar amounts, adjusted prices, or value estimates. The arithmetic is handled by code after you submit.
- Explain why you included each selected comp and why you excluded notable candidates.
- Flag low confidence honestly. If comps are sparse, distant, or require large adjustments, say so rather than forcing a high-confidence conclusion.
- If even after relaxing filters you cannot find 3 viable comps, call submitSelection with confidence "low" and document the situation in the rationale and flags.`;

function formatSubject(subject: SubjectProperty): string {
  return `SUBJECT PROPERTY:
Community: ${subject.community}, ${subject.city}
Type: ${subject.property_type.replace(/_/g, " ")}
Beds: ${subject.beds} | Full Baths: ${subject.baths_full} | Half Baths: ${subject.baths_half}
GLA: ${subject.gla_sqft.toLocaleString()} sqft${subject.lot_size_sqft ? ` | Lot: ${subject.lot_size_sqft.toLocaleString()} sqft` : " | Lot: n/a (condo)"}
Year Built: ${subject.year_built} | Condition: ${subject.condition}/5
Garage Stalls: ${subject.garage_spaces} | Basement: ${subject.basement}
Coordinates: ${subject.latitude.toFixed(4)}, ${subject.longitude.toFixed(4)}`;
}

// ---------------------------------------------------------------------------
// Candidate formatting (what the model sees per comp)
// ---------------------------------------------------------------------------

interface CandidateSummary {
  id: string;
  community: string;
  distance_km: number;
  days_since_sale: number;
  sale_date: string;
  property_type: string;
  beds: number;
  baths_full: number;
  baths_half: number;
  gla_sqft: number;
  lot_size_sqft: number | null;
  year_built: number;
  condition: number;
  garage_spaces: number;
  basement: string;
  sale_price: number;
}

function formatCandidates(
  comps: SaleRecord[],
  subject: SubjectProperty,
  today: Date
): CandidateSummary[] {
  return comps.map((c) => ({
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
    lot_size_sqft: c.lot_size_sqft,
    year_built: c.year_built,
    condition: c.condition,
    garage_spaces: c.garage_spaces,
    basement: c.basement,
    sale_price: c.sale_price,
  }));
}

// ---------------------------------------------------------------------------
// Main agent function
// ---------------------------------------------------------------------------

export async function runAgent(subject: SubjectProperty): Promise<AgentOutput | null> {
  const modelId = process.env.AI_MODEL ?? "claude-sonnet-4-5";
  const model = anthropic(modelId);
  const today = new Date();

  // Capture the model's submitSelection call via closure.
  let captured: unknown = null;

  await generateText({
    model,
    system: `${BASE_SYSTEM_PROMPT}\n\n${formatSubject(subject)}`,
    messages: [
      {
        role: "user",
        content:
          "Search for comparable sales for this subject property and submit your appraisal analysis.",
      },
    ],
    tools: {
      searchComps: tool({
        description:
          "Search for comparable sales near the subject property. Returns ranked candidates sorted by similarity. Call again with relaxed filters if you receive fewer than 3 results.",
        parameters: z.object({
          maxAgeDays: z
            .number()
            .int()
            .positive()
            .optional()
            .describe("Max days since sale date. Default 180, relax to 270 or 365."),
          glaTolerancePct: z
            .number()
            .min(0.1)
            .max(0.6)
            .optional()
            .describe("GLA tolerance as a fraction of subject GLA. Default 0.30, relax to 0.40 or 0.50."),
          radiusKm: z
            .number()
            .positive()
            .optional()
            .describe("Search radius in km. Default 5, relax to 8 or 12."),
        }),
        execute: async ({ maxAgeDays, glaTolerancePct, radiusKm } = {}) => {
          const comps = searchCompsLib(subject, {
            maxAgeDays: maxAgeDays ?? 180,
            glaTolerancePct: glaTolerancePct ?? 0.3,
            radiusKm: radiusKm ?? 5,
          });
          const candidates = formatCandidates(comps, subject, today);
          return {
            count: comps.length,
            filters_used: {
              maxAgeDays: maxAgeDays ?? 180,
              glaTolerancePct: glaTolerancePct ?? 0.3,
              radiusKm: radiusKm ?? 5,
            },
            advice:
              comps.length < 3
                ? "Fewer than 3 results. Relax filters and search again before submitting."
                : "Sufficient candidates found. Review and select the best 3-5.",
            candidates,
          };
        },
      }),

      submitSelection: tool({
        description:
          "Submit your final comp selection and appraisal analysis. Call this exactly once after reviewing candidates. Do not include any dollar amounts in your rationale or notes.",
        parameters: z.object({
          selected_comps: z
            .array(
              z.object({
                comp_id: z
                  .string()
                  .describe("The id field of the selected comparable sale"),
                weight: z
                  .number()
                  .min(0)
                  .max(1)
                  .describe(
                    "Weight for this comp in the reconciliation. All weights must sum to 1.0."
                  ),
                note: z
                  .string()
                  .describe(
                    "Why this comp was selected: similarity strengths, any caveats. No dollar amounts."
                  ),
              })
            )
            .min(1)
            .max(5)
            .describe("3 to 5 comps with weights summing to 1.0"),
          rationale: z
            .string()
            .describe(
              "Overall appraisal rationale: why these comps support the conclusion, any market observations. No dollar amounts."
            ),
          confidence: z
            .enum(["low", "medium", "high"])
            .describe(
              "high: 3+ very similar comps, small adjustments. medium: some adjustments or limited comps. low: sparse comps, large adjustments, or unusual property."
            ),
          flags: z
            .array(z.string())
            .describe("Concerns or caveats (empty array if none)"),
        }),
        execute: async (selection) => {
          captured = selection;
          return { acknowledged: true };
        },
      }),
    },
    maxSteps: 8,
  });

  if (!captured) return null;

  const parsed = AgentOutputSchema.safeParse(captured);
  if (!parsed.success) {
    console.error("Agent output failed validation:", parsed.error.flatten());
    return null;
  }

  // Normalize weights to sum exactly to 1.0 (model rounding may cause drift).
  const totalWeight = parsed.data.selected_comps.reduce((s, c) => s + c.weight, 0);
  if (totalWeight === 0) return null;

  return {
    ...parsed.data,
    selected_comps: parsed.data.selected_comps.map((c) => ({
      ...c,
      weight: parseFloat((c.weight / totalWeight).toFixed(6)),
    })),
  };
}
