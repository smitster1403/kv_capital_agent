"use client";

import { useState, useEffect } from "react";
import type { ValuationReport, AdjustmentItem, CandidateComp } from "@/lib/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FormData = {
  address: string;
  property_type: string;
  beds: string;
  baths_full: string;
  baths_half: string;
  gla_sqft: string;
  lot_size_sqft: string;
  year_built: string;
  condition: string;
  garage_spaces: string;
  basement: string;
};

type GeocodeStatus = "idle" | "loading" | "ok" | "error";

type GeocodedCoords = {
  lat: number;
  lon: number;
  neighborhood: string | null;
  formatted_address: string;
};

type Status = "idle" | "loading" | "success" | "error";

// ---------------------------------------------------------------------------
// Pre-filled example (Evanston detached, matches smoke test)
// ---------------------------------------------------------------------------

const DEFAULT: FormData = {
  address: "",
  property_type: "detached",
  beds: "4",
  baths_full: "2",
  baths_half: "1",
  gla_sqft: "1800",
  lot_size_sqft: "5000",
  year_built: "2010",
  condition: "3",
  garage_spaces: "2",
  basement: "finished",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number) {
  return "$" + n.toLocaleString("en-CA");
}

function adjSign(item: AdjustmentItem): string {
  if (item.direction === "up") return `+${fmt(item.amount)}`;
  if (item.direction === "down") return `-${fmt(item.amount)}`;
  return "none";
}

function adjClass(direction: AdjustmentItem["direction"]): string {
  if (direction === "up") return "adj-up";
  if (direction === "down") return "adj-down";
  return "adj-none";
}

function netAdj(items: AdjustmentItem[]): number {
  return items.reduce((sum, i) => {
    if (i.direction === "up") return sum + i.amount;
    if (i.direction === "down") return sum - i.amount;
    return sum;
  }, 0);
}

function badgeClass(c: string) {
  if (c === "high") return "badge badge-high";
  if (c === "low") return "badge badge-low";
  return "badge badge-medium";
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}

function CompCard({
  rc,
  index,
  total,
}: {
  rc: ValuationReport["selected_comps"][number];
  index: number;
  total: number;
}) {
  const { comp, weight, adjustments, adjusted_price, note } = rc;
  const net = netAdj(adjustments);
  const nonZero = adjustments.filter((a) => a.direction !== "none");

  return (
    <div className="comp-card">
      <div className="comp-header">
        <div>
          <span className="comp-title">
            Comp {index + 1} of {total}: {comp.community}, {comp.city}
          </span>
          <div className="comp-meta">
            {comp.property_type.replace(/_/g, " ")} sold{" "}
            {new Date(comp.sale_date).toLocaleDateString("en-CA", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}{" "}
            for {fmt(comp.sale_price)}
          </div>
        </div>
        <span className="comp-weight">{Math.round(weight * 100)}% weight</span>
      </div>

      <div className="comp-specs">
        <div className="spec-item">
          <span className="spec-label">Beds / Baths</span>
          <span className="spec-value">
            {comp.beds}bd / {comp.baths_full}f {comp.baths_half}h
          </span>
        </div>
        <div className="spec-item">
          <span className="spec-label">GLA</span>
          <span className="spec-value">
            {comp.gla_sqft.toLocaleString()} sqft
          </span>
        </div>
        <div className="spec-item">
          <span className="spec-label">Year / Cond</span>
          <span className="spec-value">
            {comp.year_built} / {comp.condition}/5
          </span>
        </div>
        <div className="spec-item">
          <span className="spec-label">Garage / Bsmt</span>
          <span className="spec-value">
            {comp.garage_spaces}stl / {comp.basement}
          </span>
        </div>
      </div>

      {nonZero.length > 0 && (
        <table className="adj-table">
          <thead>
            <tr>
              <th>Adjustment</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {nonZero.map((a) => (
              <tr key={a.type}>
                <td>{a.type}</td>
                <td className={adjClass(a.direction)}>{adjSign(a)}</td>
              </tr>
            ))}
            <tr style={{ borderTop: "1px solid #e2e8f0" }}>
              <td style={{ fontWeight: 600, color: "#475569" }}>Net adjustment</td>
              <td className={net >= 0 ? "adj-up" : "adj-down"}>
                {net >= 0 ? "+" : ""}
                {fmt(Math.abs(net))}
              </td>
            </tr>
          </tbody>
        </table>
      )}

      <div className="comp-footer">
        <div>
          <span className="adj-price-label">Adjusted price</span>
          <span className="adj-price-value">{fmt(adjusted_price)}</span>
        </div>
        <div className="comp-psf">
          <span className="adj-price-label">Sale $/sqft</span>
          <span className="comp-psf-value">
            ${Math.round(comp.sale_price / comp.gla_sqft).toLocaleString()}
          </span>
        </div>
      </div>

      {note && <div className="comp-note">{note}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Candidate pool table
// ---------------------------------------------------------------------------

function CandidateTable({ candidates }: { candidates: CandidateComp[] }) {
  const [open, setOpen] = useState(true);
  if (candidates.length === 0) return null;

  return (
    <div className="cand-wrap">
      <button className="cand-toggle" onClick={() => setOpen((o) => !o)}>
        <span>Full Candidate Pool ({candidates.length})</span>
        <svg
          width="14" height="14" viewBox="0 0 14 14" fill="none"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}
        >
          <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="cand-table-scroll">
          <table className="cand-table">
            <thead>
              <tr>
                <th></th>
                <th>Community</th>
                <th>Dist</th>
                <th>Sold</th>
                <th>Type</th>
                <th>Bed/Bath</th>
                <th>GLA</th>
                <th>Year</th>
                <th>$/sqft</th>
                <th>Price</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => (
                <tr key={c.id} className={c.selected ? "cand-row-selected" : ""}>
                  <td className="cand-sel-cell">
                    {c.selected && <span className="cand-sel-dot" title="Selected by agent" />}
                  </td>
                  <td>{c.community}</td>
                  <td>{c.distance_km} km</td>
                  <td>{new Date(c.sale_date).toLocaleDateString("en-CA", { year: "numeric", month: "short" })}</td>
                  <td>{c.property_type.replace(/_/g, " ")}</td>
                  <td>{c.beds}bd / {c.baths_full}f {c.baths_half}h</td>
                  <td>{c.gla_sqft.toLocaleString()}</td>
                  <td>{c.year_built}</td>
                  <td className="cand-psf">${c.price_per_sqft.toLocaleString()}</td>
                  <td>{fmt(c.sale_price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function Home() {
  const [form, setForm] = useState<FormData>(DEFAULT);
  const [status, setStatus] = useState<Status>("idle");
  const [report, setReport] = useState<ValuationReport | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [geocodeStatus, setGeocodeStatus] = useState<GeocodeStatus>("idle");
  const [geocodeMsg, setGeocodeMsg] = useState("");
  const [geocodedCoords, setGeocodedCoords] = useState<GeocodedCoords | null>(null);

  async function handleLookup() {
    const address = form.address.trim();
    if (!address) return;
    setGeocodeStatus("loading");
    setGeocodedCoords(null);
    setGeocodeMsg("");
    try {
      const res = await fetch(`/api/geocode?address=${encodeURIComponent(address)}`);
      const data = await res.json();
      if (!res.ok) {
        setGeocodeStatus("error");
        setGeocodeMsg(data.error ?? "Address not found");
        return;
      }
      const { lat, lon, neighborhood, formatted_address } = data as {
        lat: number; lon: number; neighborhood: string | null; formatted_address: string;
      };
      setGeocodedCoords({ lat, lon, neighborhood, formatted_address });
      setGeocodeStatus("ok");
      setGeocodeMsg(
        `${formatted_address} · ${lat.toFixed(5)}, ${lon.toFixed(5)}`
      );
    } catch {
      setGeocodeStatus("error");
      setGeocodeMsg("Lookup failed — check your connection");
    }
  }

  function set(key: keyof FormData) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setReport(null);
    setErrorMsg("");

    if (!geocodedCoords) {
      setErrorMsg("Enter a property address and click Lookup to get coordinates before analyzing.");
      setStatus("error");
      return;
    }

    const community = geocodedCoords.neighborhood ?? "Calgary";

    const subject = {
      id: `subject-${Date.now()}`,
      community,
      city: "Calgary",
      latitude: geocodedCoords.lat,
      longitude: geocodedCoords.lon,
      property_type: form.property_type,
      beds: parseInt(form.beds, 10),
      baths_full: parseInt(form.baths_full, 10),
      baths_half: parseInt(form.baths_half, 10),
      gla_sqft: parseFloat(form.gla_sqft),
      lot_size_sqft:
        form.lot_size_sqft.trim() === "" ? null : parseFloat(form.lot_size_sqft),
      year_built: parseInt(form.year_built, 10),
      condition: parseInt(form.condition, 10),
      garage_spaces: parseInt(form.garage_spaces, 10),
      basement: form.basement,
    };

    try {
      const res = await fetch("/api/value", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error ?? `Server error ${res.status}`);
        setStatus("error");
        return;
      }
      setReport(data as ValuationReport);
      setStatus("success");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Request failed");
      setStatus("error");
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="shell">
      <header className="header">
        <h1>KV Capital Comp Analysis</h1>
        <p>Sales comparison valuation for residential properties in Calgary</p>
      </header>

      <div className="body">
        {/* Form panel */}
        <aside className="form-panel">
          <form onSubmit={handleSubmit}>
            {/* Location */}
            <div className="form-section">
              <h2>Location</h2>

              <div className="field">
                <label>Property Address</label>
                <div className="addr-row">
                  <input
                    type="text"
                    value={form.address}
                    onChange={(e) => {
                      setForm((f) => ({ ...f, address: e.target.value }));
                      setGeocodeStatus("idle");
                      setGeocodedCoords(null);
                    }}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleLookup(); } }}
                    placeholder="123 Main St NW, Calgary, AB"
                  />
                  <button
                    type="button"
                    className="addr-lookup-btn"
                    onClick={handleLookup}
                    disabled={geocodeStatus === "loading" || !form.address.trim()}
                  >
                    {geocodeStatus === "loading" ? "..." : "Lookup"}
                  </button>
                </div>
                {geocodeStatus === "ok" && (
                  <div className="addr-status addr-ok">{geocodeMsg}</div>
                )}
                {geocodeStatus === "error" && (
                  <div className="addr-status addr-err">{geocodeMsg}</div>
                )}
                {geocodeStatus === "idle" && !geocodedCoords && (
                  <div className="addr-status addr-hint">
                    Enter an address for precise coordinates, or select community below.
                  </div>
                )}
              </div>

            </div>

            {/* Property */}
            <div className="form-section">
              <h2>Property</h2>
              <Field label="Type">
                <select value={form.property_type} onChange={set("property_type")}>
                  <option value="detached">Detached</option>
                  <option value="semi_detached">Semi-Detached</option>
                  <option value="townhouse">Townhouse</option>
                  <option value="apartment_condo">Apartment / Condo</option>
                </select>
              </Field>
              <div className="field-row">
                <Field label="Beds">
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={form.beds}
                    onChange={set("beds")}
                    required
                  />
                </Field>
                <Field label="Full Baths">
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={form.baths_full}
                    onChange={set("baths_full")}
                    required
                  />
                </Field>
              </div>
              <div className="field-row">
                <Field label="Half Baths">
                  <input
                    type="number"
                    min="0"
                    max="5"
                    value={form.baths_half}
                    onChange={set("baths_half")}
                    required
                  />
                </Field>
                <Field label="GLA (sqft)">
                  <input
                    type="number"
                    min="200"
                    value={form.gla_sqft}
                    onChange={set("gla_sqft")}
                    required
                  />
                </Field>
              </div>
              <div className="field-row">
                <Field label="Lot Size (sqft)">
                  <input
                    type="number"
                    min="0"
                    placeholder="leave blank for condo"
                    value={form.lot_size_sqft}
                    onChange={set("lot_size_sqft")}
                  />
                </Field>
                <Field label="Year Built">
                  <input
                    type="number"
                    min="1900"
                    max="2030"
                    value={form.year_built}
                    onChange={set("year_built")}
                    required
                  />
                </Field>
              </div>
            </div>

            {/* Features */}
            <div className="form-section">
              <h2>Features</h2>
              <Field label="Condition (1 poor - 5 excellent)">
                <select value={form.condition} onChange={set("condition")}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n} {["(poor)", "(fair)", "(average)", "(good)", "(excellent)"][n - 1]}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="field-row">
                <Field label="Garage Stalls">
                  <input
                    type="number"
                    min="0"
                    max="5"
                    value={form.garage_spaces}
                    onChange={set("garage_spaces")}
                    required
                  />
                </Field>
                <Field label="Basement">
                  <select value={form.basement} onChange={set("basement")}>
                    <option value="none">None</option>
                    <option value="unfinished">Unfinished</option>
                    <option value="finished">Finished</option>
                  </select>
                </Field>
              </div>
            </div>

            <button
              type="submit"
              className="run-btn"
              disabled={status === "loading"}
            >
              {status === "loading" ? "Analyzing..." : "Analyze Property"}
            </button>
          </form>
        </aside>

        {/* Results panel */}
        <main className="results-panel">
          {status === "idle" && (
            <div className="state-box">
              <h2>Ready to analyze</h2>
              <p>Fill in the subject property on the left and click Analyze Property.</p>
              <p style={{ marginTop: 8, fontSize: 12 }}>
                The form is pre-filled with an example Evanston detached home.
              </p>
            </div>
          )}

          {status === "loading" && (
            <div className="state-box">
              <div className="spinner" />
              <h2>Analyzing property</h2>
              <p>Searching for comparable sales and running appraisal analysis.</p>
              <p style={{ marginTop: 8, fontSize: 12, color: "#94a3b8" }}>
                This usually takes 15 to 30 seconds.
              </p>
            </div>
          )}

          {status === "error" && (
            <div className="error-box">
              <strong>Analysis failed:</strong> {errorMsg}
            </div>
          )}

          {status === "success" && report && (
            <>
              {/* Summary card */}
              <div className="summary-card">
                <div>
                  {geocodedCoords && (
                    <div className="subject-address">
                      {geocodedCoords.neighborhood
                        ? `${geocodedCoords.neighborhood} · `
                        : ""}
                      {geocodedCoords.formatted_address}
                    </div>
                  )}
                  <div className="estimate-label">Estimated Value</div>
                  <div className="estimate-value">
                    {report.estimate > 0 ? fmt(report.estimate) : "Insufficient data"}
                  </div>
                  {report.estimate > 0 && (() => {
                    const gla = parseFloat(form.gla_sqft);
                    const psf = gla > 0 ? Math.round(report.estimate / gla) : null;
                    return (
                      <>
                        <div className="estimate-range">
                          Range: {fmt(report.range_low)} to {fmt(report.range_high)}
                        </div>
                        {psf && (
                          <div className="estimate-psf">
                            ${psf.toLocaleString()} / sqft (implied)
                          </div>
                        )}
                      </>
                    );
                  })()}

                  {report.flags.length > 0 && (
                    <div className="flags-list">
                      {report.flags.map((f, i) => (
                        <div key={i} className="flag-item">
                          {f}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ textAlign: "right" }}>
                  <span className={badgeClass(report.confidence)}>
                    {report.confidence} confidence
                  </span>
                  <div
                    style={{ fontSize: 12, color: "#94a3b8", marginTop: 8 }}
                  >
                    {report.selected_comps.length} comp
                    {report.selected_comps.length !== 1 ? "s" : ""} selected
                  </div>
                </div>
              </div>

              {/* Candidate pool table */}
              {report.all_candidates.length > 0 && (
                <CandidateTable candidates={report.all_candidates} />
              )}

              {/* Comp cards */}
              {report.selected_comps.length > 0 && (
                <>
                  <div className="section-heading" style={{ marginTop: 20 }}>Selected Comparables</div>
                  {report.selected_comps.map((rc, i) => (
                    <CompCard
                      key={rc.comp.id}
                      rc={rc}
                      index={i}
                      total={report.selected_comps.length}
                    />
                  ))}
                </>
              )}

              {/* Rationale */}
              {report.rationale && (
                <>
                  <div className="section-heading" style={{ marginTop: 20 }}>
                    Appraisal Rationale
                  </div>
                  <div className="rationale-card">
                    <p className="rationale-text">{report.rationale}</p>
                  </div>
                </>
              )}
            </>
          )}
          <div className="osm-attribution">
            Geocoding: Data &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors
          </div>
        </main>
      </div>
    </div>
  );
}
