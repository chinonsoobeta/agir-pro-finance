// Canonical underwriting assumption taxonomy. Every project assumption MUST
// originate from one of these field_keys so calculations remain traceable.
// Each definition includes alias terms so Stage-3 alias mapping can resolve
// free-text labels lifted from documents into canonical keys.

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
  aliases: string[];
};

// Required set per product spec:
//   Land Cost, Hard Cost, Debt Amount, Equity Amount, Interest Rate,
//   Stabilized Occupancy, Exit Cap Rate.
// Optional set includes Environmental Reserve, Delay Contingency,
// Lease-Up Schedule, Tax Reassessment.

export const ASSUMPTION_DEFS: AssumptionDef[] = [
  { key: "land_cost", label: "Land Cost", category: "Costs", unit: "$", numeric: true, required: true,
    aliases: ["land cost","acquisition cost","acquisition price","purchase price","site acquisition","site cost","land basis","land purchase"] },
  { key: "hard_costs", label: "Hard / Construction Costs", category: "Costs", unit: "$", numeric: true, required: true,
    aliases: ["hard cost","hard costs","construction cost","construction costs","building costs","gmp","guaranteed maximum price","trade costs","direct costs"] },
  { key: "soft_costs", label: "Soft Costs", category: "Costs", unit: "$", numeric: true, required: false,
    aliases: ["soft cost","soft costs","professional fees","architect fees","permits","ffe","indirect costs"] },
  { key: "financing_costs", label: "Financing Costs", category: "Costs", unit: "$", numeric: true, required: false,
    aliases: ["financing cost","loan fees","origination fee","interest reserve","carry cost"] },
  { key: "contingency", label: "Contingency", category: "Costs", unit: "$", numeric: true, required: false,
    aliases: ["contingency","construction contingency","delay contingency","cost contingency"] },
  { key: "environmental_reserve", label: "Environmental Reserve", category: "Costs", unit: "$", numeric: true, required: false,
    aliases: ["environmental reserve","environmental remediation","phase ii reserve","esa reserve"] },
  { key: "tax_reassessment", label: "Tax Reassessment", category: "Costs", unit: "$", numeric: true, required: false,
    aliases: ["tax reassessment","property tax reassessment","reassessed taxes","mill rate change"] },
  { key: "total_project_cost", label: "Total Project Cost", category: "Costs", unit: "$", numeric: true, required: false,
    aliases: ["total project cost","tpc","total development cost","tdc","total cost"] },

  { key: "residential_units", label: "Residential Units", category: "Revenue", unit: "units", numeric: true, required: false,
    aliases: ["residential units","apartment units","unit count","multifamily units","rental units"] },
  { key: "residential_rent_monthly", label: "Residential Rent (per unit / mo)", category: "Revenue", unit: "$", numeric: true, required: false,
    aliases: ["residential rent","average rent","rent per unit","monthly rent","asking rent"] },
  { key: "retail_sf", label: "Retail SF", category: "Revenue", unit: "SF", numeric: true, required: false,
    aliases: ["retail sf","retail square feet","retail area","ground floor retail"] },
  { key: "retail_rent_psf", label: "Retail Rent ($/SF)", category: "Revenue", unit: "$/SF", numeric: true, required: false,
    aliases: ["retail rent","retail rent psf","retail $/sf"] },
  { key: "office_sf", label: "Office SF", category: "Revenue", unit: "SF", numeric: true, required: false,
    aliases: ["office sf","office square feet","office area","rentable office area"] },
  { key: "office_rent_psf", label: "Office Rent ($/SF)", category: "Revenue", unit: "$/SF", numeric: true, required: false,
    aliases: ["office rent","office rent psf","office $/sf"] },
  { key: "stabilized_occupancy", label: "Stabilized Occupancy", category: "Operations", unit: "%", numeric: true, required: true,
    aliases: ["stabilized occupancy","occupancy","economic occupancy","physical occupancy"] },
  { key: "rent_growth", label: "Annual Rent Growth", category: "Operations", unit: "%", numeric: true, required: false,
    aliases: ["rent growth","annual rent growth","rent escalation","rent inflation"] },
  { key: "opex_ratio", label: "Operating Expense Ratio", category: "Operations", unit: "%", numeric: true, required: false,
    aliases: ["operating expense ratio","opex ratio","oer","expense ratio","opex %"] },
  { key: "lease_up_months", label: "Lease-Up Period", category: "Operations", unit: "mo", numeric: true, required: false,
    aliases: ["lease-up","lease up","lease-up period","lease-up schedule","absorption period"] },

  { key: "debt_amount", label: "Debt Amount", category: "Capital Stack", unit: "$", numeric: true, required: true,
    aliases: ["debt amount","loan amount","senior loan","construction loan","mortgage amount","facility size"] },
  { key: "equity_amount", label: "Equity Amount", category: "Capital Stack", unit: "$", numeric: true, required: true,
    aliases: ["equity amount","sponsor equity","total equity","equity contribution","equity check"] },
  { key: "interest_rate", label: "Interest Rate", category: "Capital Stack", unit: "%", numeric: true, required: true,
    aliases: ["interest rate","coupon","loan rate","sofr spread","all-in rate","note rate"] },
  { key: "ltc", label: "Loan-to-Cost", category: "Capital Stack", unit: "%", numeric: true, required: false,
    aliases: ["loan to cost","ltc","loan-to-cost ratio"] },
  { key: "amortization_years", label: "Amortization Period", category: "Capital Stack", unit: "yr", numeric: true, required: false,
    aliases: ["amortization","amortization period","amort term"] },
  { key: "min_dscr", label: "Minimum DSCR Covenant", category: "Capital Stack", unit: "x", numeric: true, required: false,
    aliases: ["minimum dscr","dscr covenant","required dscr"] },

  { key: "exit_cap_rate", label: "Exit Cap Rate", category: "Exit", unit: "%", numeric: true, required: true,
    aliases: ["exit cap","exit cap rate","disposition cap","reversion cap rate","terminal cap"] },
  { key: "hold_period_years", label: "Hold Period", category: "Exit", unit: "yr", numeric: true, required: false,
    aliases: ["hold period","investment horizon","hold term"] },
  { key: "disposition_cost_pct", label: "Disposition Costs", category: "Exit", unit: "%", numeric: true, required: false,
    aliases: ["disposition cost","disposition costs","selling costs","broker fee"] },

  { key: "sponsor_track_record", label: "Sponsor Track Record", category: "Sponsor", unit: "text", numeric: false, required: false,
    aliases: ["sponsor track record","sponsor experience","sponsor history"] },
];

export const ASSUMPTION_KEYS = ASSUMPTION_DEFS.map((d) => d.key);
export const ASSUMPTION_BY_KEY = Object.fromEntries(ASSUMPTION_DEFS.map((d) => [d.key, d]));
export const REQUIRED_KEYS = ASSUMPTION_DEFS.filter((d) => d.required).map((d) => d.key);
export const OPTIONAL_KEYS = ASSUMPTION_DEFS.filter((d) => !d.required).map((d) => d.key);

// Flat alias → canonical key index (lowercase, trimmed).
export const ALIAS_INDEX: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const d of ASSUMPTION_DEFS) {
    out[d.label.toLowerCase()] = d.key;
    out[d.key.toLowerCase()] = d.key;
    for (const a of d.aliases) out[a.toLowerCase()] = d.key;
  }
  return out;
})();

export function resolveAlias(term: string): string | null {
  if (!term) return null;
  const t = term.toLowerCase().trim().replace(/\s+/g, " ");
  if (ALIAS_INDEX[t]) return ALIAS_INDEX[t];
  // Loose match: contains any alias as a substring
  for (const [alias, key] of Object.entries(ALIAS_INDEX)) {
    if (alias.length >= 6 && t.includes(alias)) return key;
  }
  return null;
}

export function bandFor(score: number): "high" | "medium" | "low" | "missing" {
  if (score >= 85) return "high";
  if (score >= 60) return "medium";
  if (score > 0) return "low";
  return "missing";
}
