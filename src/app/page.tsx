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

// ---------------------------------------------------------------------------
// Candidate cards (expandable, replaces both the table and the comp cards)
// ---------------------------------------------------------------------------

function CandidateCards({
  candidates,
  selectedComps,
}: {
  candidates: CandidateComp[];
  selectedComps: ValuationReport["selected_comps"];
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (candidates.length === 0) return null;

  const sorted = [...candidates].sort((a, b) => {
    if (a.selected && !b.selected) return -1;
    if (!a.selected && b.selected) return 1;
    return a.distance_km - b.distance_km;
  });

  return (
    <div className="cand-cards-wrap">
      <div className="pool-header">
        <span className="section-heading">Candidate Pool</span>
        <span className="pool-count">{candidates.length} properties (click to expand)</span>
      </div>
      {sorted.map((c) => {
        const isOpen = openId === c.id;
        const sel = selectedComps.find((s) => s.comp.id === c.id);
        const nonZero = (sel?.adjustments ?? []).filter((a) => a.direction !== "none");
        const net = netAdj(sel?.adjustments ?? []);

        return (
          <div
            key={c.id}
            className={`cand-card2${c.selected ? " cand-card2-selected" : ""}`}
            onClick={() => setOpenId(isOpen ? null : c.id)}
          >
            {/* Always-visible row */}
            <div className="cand-card2-header">
              <div className="cand-card2-main">
                <div className="cand-card2-top">
                  <span className="cand-card2-community">{c.community}</span>
                  {c.selected && sel && (
                    <span className="cand-card2-badge">
                      {Math.round(sel.weight * 100)}% weight
                    </span>
                  )}
                </div>
                <div className="cand-card2-meta">
                  {c.distance_km} km &middot;{" "}
                  {c.property_type.replace(/_/g, " ")} &middot;{" "}
                  {new Date(c.sale_date).toLocaleDateString("en-CA", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </div>
                <div className="cand-card2-specs">
                  {c.beds}bd &middot; {c.baths_full}f {c.baths_half}h &middot;{" "}
                  {c.gla_sqft.toLocaleString()} sqft &middot; {c.year_built}
                </div>
              </div>
              <div className="cand-card2-prices">
                <span className="cand-card2-psf">${c.price_per_sqft.toLocaleString()}<span style={{ fontWeight: 400, fontSize: 10 }}>/sqft</span></span>
                <span className="cand-card2-price">{fmt(c.sale_price)}</span>
              </div>
              <svg
                width="14" height="14" viewBox="0 0 14 14" fill="none"
                className="cand-card2-chevron"
                style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
              >
                <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>

            {/* Expanded body */}
            {isOpen && (
              <div className="cand-card2-body">
                <div className="cand-card2-detail-grid">
                  <div><span className="cand-card2-detail-label">Condition</span> {c.condition}/5</div>
                  <div><span className="cand-card2-detail-label">Garage</span> {c.garage_spaces} stall{c.garage_spaces !== 1 ? "s" : ""}</div>
                  <div><span className="cand-card2-detail-label">Basement</span> {c.basement}</div>
                  <div><span className="cand-card2-detail-label">Type</span> {c.property_type.replace(/_/g, " ")}</div>
                </div>

                {c.selected && nonZero.length > 0 && (
                  <table className="adj-table" style={{ marginTop: 10 }}>
                    <thead>
                      <tr><th>Adjustment</th><th>Amount</th></tr>
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
                          {net >= 0 ? "+" : ""}{fmt(Math.abs(net))}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                )}

                {c.selected && sel && (
                  <div className="cand-card2-adj-price">
                    <span className="adj-price-label">Adjusted price</span>
                    <span className="adj-price-value">{fmt(sel.adjusted_price)}</span>
                  </div>
                )}

                {sel?.note && (
                  <div className="comp-note" style={{ margin: "10px 0 0" }}>{sel.note}</div>
                )}
              </div>
            )}
          </div>
        );
      })}
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
        <div className="header-brand">
          <div className="header-logo">KV</div>
          <div>
            <div className="header-name">KV Capital</div>
            <div className="header-sub">Residential Comp Analysis</div>
          </div>
        </div>
        <div className="header-tag">Calgary, AB</div>
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
                <input
                  className="addr-input"
                  type="text"
                  value={form.address}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, address: e.target.value }));
                    setGeocodeStatus("idle");
                    setGeocodedCoords(null);
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleLookup(); } }}
                  placeholder="708 Alexander Crescent NW, Calgary"
                />
                <button
                  type="button"
                  className="addr-lookup-btn"
                  onClick={handleLookup}
                  disabled={geocodeStatus === "loading" || !form.address.trim()}
                >
                  {geocodeStatus === "loading" ? "Looking up..." : "Look Up Address"}
                </button>
                {geocodeStatus === "ok" && (
                  <div className="addr-status addr-ok">{geocodeMsg}</div>
                )}
                {geocodeStatus === "error" && (
                  <div className="addr-status addr-err">{geocodeMsg}</div>
                )}
                {geocodeStatus === "idle" && !geocodedCoords && (
                  <div className="addr-status addr-hint">
                    Enter the full street address to get precise coordinates.
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
                {geocodedCoords && (
                  <div className="summary-address">
                    {geocodedCoords.neighborhood && (
                      <span className="summary-neighborhood">{geocodedCoords.neighborhood}</span>
                    )}
                    {geocodedCoords.formatted_address}
                  </div>
                )}

                <div className="estimate-label">Estimated Market Value</div>
                <div className="estimate-value">
                  {report.estimate > 0 ? fmt(report.estimate) : "Insufficient data"}
                </div>
                {report.estimate > 0 && (
                  <div className="estimate-range">
                    {fmt(report.range_low)} to {fmt(report.range_high)}
                  </div>
                )}

                {report.estimate > 0 && (() => {
                  const gla = parseFloat(form.gla_sqft);
                  const psf = gla > 0 ? Math.round(report.estimate / gla) : null;
                  return (
                    <>
                      <div className="summary-divider" />
                      <div className="summary-metrics">
                        <div className="summary-metric">
                          <span className="summary-metric-val">
                            {psf ? `$${psf.toLocaleString()}` : "N/A"}
                          </span>
                          <span className="summary-metric-lbl">Per sqft</span>
                        </div>
                        <div className="summary-metric">
                          <span className="summary-metric-val" data-conf={report.confidence}>
                            {report.confidence.charAt(0).toUpperCase() + report.confidence.slice(1)}
                          </span>
                          <span className="summary-metric-lbl">Confidence</span>
                        </div>
                        <div className="summary-metric">
                          <span className="summary-metric-val">{report.selected_comps.length}</span>
                          <span className="summary-metric-lbl">Comps used</span>
                        </div>
                      </div>
                    </>
                  );
                })()}

                {report.flags.length > 0 && (
                  <div className="flags-list">
                    {report.flags.map((f, i) => (
                      <div key={i} className="flag-item">{f}</div>
                    ))}
                  </div>
                )}
              </div>

              {/* Candidate cards */}
              {report.all_candidates.length > 0 && (
                <CandidateCards
                  candidates={report.all_candidates}
                  selectedComps={report.selected_comps}
                />
              )}

              {/* Rationale */}
              {report.rationale && (
                <>
                  <div style={{ marginTop: 20, marginBottom: 10 }}>
                    <span className="section-heading">Appraisal Rationale</span>
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
