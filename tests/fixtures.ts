import type { SaleRecord, SubjectProperty } from "@/lib/types";

// Evanston community center, detached
export const BASE_SUBJECT: SubjectProperty = {
  id: "subject-1",
  community: "Evanston",
  city: "Calgary",
  latitude: 51.178,
  longitude: -114.145,
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

// Factory: merge overrides into a full SaleRecord.
let _seq = 1;
export function makeSale(overrides: Partial<SaleRecord> = {}): SaleRecord {
  const id = overrides.id ?? `sale-${_seq++}`;
  return {
    id,
    community: "Evanston",
    city: "Calgary",
    latitude: 51.178,
    longitude: -114.145,
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
    sale_date: "2026-03-01",
    sale_price: 700_000,
    ...overrides,
  };
}
