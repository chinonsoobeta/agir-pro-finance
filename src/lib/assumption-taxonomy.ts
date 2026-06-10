// Canonical underwriting assumption taxonomy. Every project assumption MUST
// originate from one of these field_keys so calculations remain traceable.

export type AssumptionDef = {
  key: string;
  label: string;
  category:
    | "Costs"
    | "Revenue"
    | "Capital Stack"
    | "Operations"
    | "Exit"
    | "Schedule"
    | "Sponsor";
  unit: string; // $, %, x, mo, yr, units, count, text
  numeric: boolean;
  required: boolean;
};

export const ASSUMPTION_DEFS: AssumptionDef[] = [
  { key: "land_cost", label: "Land Cost", category: "Costs", unit: "$", numeric: true, required: true },
  { key: "hard_costs", label: "Hard / Construction Costs", category: "Costs", unit: "$", numeric: true, required: true },
  { key: "soft_costs", label: "Soft Costs", category: "Costs", unit: "$", numeric: true, required: true },
  { key: "financing_costs", label: "Financing Costs", category: "Costs", unit: "$", numeric: true, required: false },
  { key: "contingency", label: "Contingency", category: "Costs", unit: "$", numeric: true, required: false },
  { key: "total_project_cost", label: "Total Project Cost", category: "Costs", unit: "$", numeric: true, required: true },

  { key: "residential_units", label: "Residential Units", category: "Revenue", unit: "units", numeric: true, required: false },
  { key: "residential_rent_monthly", label: "Residential Rent (per unit / mo)", category: "Revenue", unit: "$", numeric: true, required: false },
  { key: "retail_sf", label: "Retail SF", category: "Revenue", unit: "SF", numeric: true, required: false },
  { key: "retail_rent_psf", label: "Retail Rent ($/SF)", category: "Revenue", unit: "$/SF", numeric: true, required: false },
  { key: "office_sf", label: "Office SF", category: "Revenue", unit: "SF", numeric: true, required: false },
  { key: "office_rent_psf", label: "Office Rent ($/SF)", category: "Revenue", unit: "$/SF", numeric: true, required: false },
  { key: "stabilized_occupancy", label: "Stabilized Occupancy", category: "Operations", unit: "%", numeric: true, required: true },
  { key: "rent_growth", label: "Annual Rent Growth", category: "Operations", unit: "%", numeric: true, required: false },
  { key: "opex_ratio", label: "Operating Expense Ratio", category: "Operations", unit: "%", numeric: true, required: true },
  { key: "lease_up_months", label: "Lease-Up Period", category: "Operations", unit: "mo", numeric: true, required: false },

  { key: "debt_amount", label: "Debt Amount", category: "Capital Stack", unit: "$", numeric: true, required: true },
  { key: "equity_amount", label: "Equity Amount", category: "Capital Stack", unit: "$", numeric: true, required: true },
  { key: "interest_rate", label: "Interest Rate", category: "Capital Stack", unit: "%", numeric: true, required: true },
  { key: "ltc", label: "Loan-to-Cost", category: "Capital Stack", unit: "%", numeric: true, required: false },
  { key: "amortization_years", label: "Amortization Period", category: "Capital Stack", unit: "yr", numeric: true, required: false },
  { key: "min_dscr", label: "Minimum DSCR Covenant", category: "Capital Stack", unit: "x", numeric: true, required: false },

  { key: "exit_cap_rate", label: "Exit Cap Rate", category: "Exit", unit: "%", numeric: true, required: true },
  { key: "hold_period_years", label: "Hold Period", category: "Exit", unit: "yr", numeric: true, required: false },
  { key: "disposition_cost_pct", label: "Disposition Costs", category: "Exit", unit: "%", numeric: true, required: false },

  { key: "sponsor_track_record", label: "Sponsor Track Record", category: "Sponsor", unit: "text", numeric: false, required: false },
];

export const ASSUMPTION_KEYS = ASSUMPTION_DEFS.map((d) => d.key);
export const ASSUMPTION_BY_KEY = Object.fromEntries(ASSUMPTION_DEFS.map((d) => [d.key, d]));

export function bandFor(score: number): "high" | "medium" | "low" | "missing" {
  if (score >= 85) return "high";
  if (score >= 60) return "medium";
  if (score > 0) return "low";
  return "missing";
}
