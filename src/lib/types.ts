import { z } from "zod";

// ---------------------------------------------------------------------------
// Core enums
// ---------------------------------------------------------------------------

export const PropertyTypeSchema = z.enum([
  "detached",
  "semi_detached",
  "townhouse",
  "apartment_condo",
]);
export type PropertyType = z.infer<typeof PropertyTypeSchema>;

export const BasementSchema = z.enum(["none", "unfinished", "finished"]);
export type Basement = z.infer<typeof BasementSchema>;

export const ConditionSchema = z.number().int().min(1).max(5);

export const ConfidenceSchema = z.enum(["low", "medium", "high"]);
export type Confidence = z.infer<typeof ConfidenceSchema>;

// ---------------------------------------------------------------------------
// Sale record (what is stored in the database)
// ---------------------------------------------------------------------------

export const SaleRecordSchema = z.object({
  id: z.string(),
  community: z.string(),
  city: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  property_type: PropertyTypeSchema,
  beds: z.number().int().min(0),
  baths_full: z.number().int().min(0),
  baths_half: z.number().int().min(0),
  gla_sqft: z.number().positive(),
  lot_size_sqft: z.number().positive().nullable(),
  year_built: z.number().int(),
  condition: ConditionSchema,
  garage_spaces: z.number().int().min(0),
  basement: BasementSchema,
  sale_date: z.string(), // ISO date string YYYY-MM-DD
  sale_price: z.number().positive(),
});
export type SaleRecord = z.infer<typeof SaleRecordSchema>;

// ---------------------------------------------------------------------------
// Subject property (same shape minus sale_date and sale_price)
// ---------------------------------------------------------------------------

export const SubjectPropertySchema = SaleRecordSchema.omit({
  sale_date: true,
  sale_price: true,
});
export type SubjectProperty = z.infer<typeof SubjectPropertySchema>;

// ---------------------------------------------------------------------------
// Comp search filters (passed to searchComps, with relaxable thresholds)
// ---------------------------------------------------------------------------

export const CompSearchFiltersSchema = z.object({
  maxAgeDays: z.number().int().positive().default(180),
  glaTolerancePct: z.number().min(0).max(1).default(0.30),
  radiusKm: z.number().positive().default(5),
  topN: z.number().int().positive().default(12),
});
export type CompSearchFilters = z.infer<typeof CompSearchFiltersSchema>;

// ---------------------------------------------------------------------------
// Adjustment line item
// ---------------------------------------------------------------------------

export const AdjustmentItemSchema = z.object({
  type: z.string(),
  direction: z.enum(["up", "down", "none"]),
  amount: z.number(), // always positive; direction indicates sign
});
export type AdjustmentItem = z.infer<typeof AdjustmentItemSchema>;

// ---------------------------------------------------------------------------
// Agent output (what the LLM returns, no computed prices)
// ---------------------------------------------------------------------------

export const AgentCompSelectionSchema = z.object({
  comp_id: z.string(),
  weight: z.number().min(0).max(1),
  note: z.string(),
});
export type AgentCompSelection = z.infer<typeof AgentCompSelectionSchema>;

export const AgentOutputSchema = z.object({
  // Weights are normalized to 1.0 in agent.ts after parsing, so no refine here.
  selected_comps: z.array(AgentCompSelectionSchema).min(1).max(5),
  rationale: z.string().min(1),
  confidence: ConfidenceSchema,
  flags: z.array(z.string()),
});
export type AgentOutput = z.infer<typeof AgentOutputSchema>;

// ---------------------------------------------------------------------------
// Selected comp in the final report (comp data + adjustments + adjusted price)
// ---------------------------------------------------------------------------

export const ReportCompSchema = z.object({
  comp: SaleRecordSchema,
  weight: z.number(),
  adjustments: z.array(AdjustmentItemSchema),
  adjusted_price: z.number(),
  note: z.string(),
});
export type ReportComp = z.infer<typeof ReportCompSchema>;

// ---------------------------------------------------------------------------
// Final valuation report
// ---------------------------------------------------------------------------

export const ValuationReportSchema = z.object({
  estimate: z.number(),
  range_low: z.number(),
  range_high: z.number(),
  confidence: ConfidenceSchema,
  selected_comps: z.array(ReportCompSchema),
  rationale: z.string(),
  flags: z.array(z.string()),
});
export type ValuationReport = z.infer<typeof ValuationReportSchema>;

// ---------------------------------------------------------------------------
// API request/response shapes
// ---------------------------------------------------------------------------

export const ValueRequestSchema = z.object({
  subject: SubjectPropertySchema,
});
export type ValueRequest = z.infer<typeof ValueRequestSchema>;
