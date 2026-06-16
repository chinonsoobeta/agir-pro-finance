// Canonical Assumption Dictionary (Engine 3).
// Every extracted value must map into a single canonical key here.
// 8 categories: ACQUISITION, CONSTRUCTION, FINANCING, REVENUE,
// OPERATING, EXIT, MARKET, RISK.

export type AssumptionCategory =
  | "ACQUISITION"
  | "CONSTRUCTION"
  | "FINANCING"
  | "REVENUE"
  | "OPERATING"
  | "EXIT"
  | "MARKET"
  | "RISK";

export type AssumptionDef = {
  key: string;
  label: string;
  category: AssumptionCategory;
  unit: string; // $, %, x, mo, yr, units, SF, date, text
  numeric: boolean;
  required: boolean;
  aliases: string[];
};

// Required set per spec:
// land_cost, hard_costs, soft_costs, debt_amount, equity_amount,
// interest_rate, occupancy, expense_ratio, exit_cap_rate, hold_period.

export const ASSUMPTION_DEFS: AssumptionDef[] = [
  // ===== ACQUISITION =====
  { key: "land_cost", label: "Land Cost", category: "ACQUISITION", unit: "$", numeric: true, required: true,
    aliases: ["land cost","purchase price","site acquisition","site cost","land acquisition","land basis","land purchase","acquisition price"] },
  { key: "acquisition_costs", label: "Acquisition Costs", category: "ACQUISITION", unit: "$", numeric: true, required: false,
    aliases: ["acquisition costs","acquisition fees","transfer tax"] },
  { key: "closing_costs", label: "Closing Costs", category: "ACQUISITION", unit: "$", numeric: true, required: false,
    aliases: ["closing costs","title costs","escrow fees","recording fees"] },
  { key: "due_diligence_costs", label: "Due Diligence Costs", category: "ACQUISITION", unit: "$", numeric: true, required: false,
    aliases: ["due diligence","dd costs","inspection costs","environmental reports","phase i","phase ii"] },

  // ===== CONSTRUCTION =====
  { key: "hard_costs", label: "Hard Costs", category: "CONSTRUCTION", unit: "$", numeric: true, required: true,
    aliases: ["hard cost","hard costs","construction cost","construction costs","building costs","gmp","guaranteed maximum price","trade costs","direct costs"] },
  { key: "soft_costs", label: "Soft Costs", category: "CONSTRUCTION", unit: "$", numeric: true, required: true,
    aliases: ["soft cost","soft costs","professional fees","architect fees","engineering fees","permits","ffe","indirect costs"] },
  { key: "financing_costs", label: "Financing Costs", category: "CONSTRUCTION", unit: "$", numeric: true, required: false,
    aliases: ["financing cost","loan fees","origination fee","interest reserve","carry cost","construction interest"] },
  { key: "contingency", label: "Contingency", category: "CONSTRUCTION", unit: "$", numeric: true, required: false,
    aliases: ["contingency","construction contingency","cost contingency","hard cost contingency"] },
  { key: "construction_duration", label: "Construction Duration", category: "CONSTRUCTION", unit: "mo", numeric: true, required: false,
    aliases: ["construction duration","construction period","build duration","construction months"] },
  { key: "construction_start", label: "Construction Start", category: "CONSTRUCTION", unit: "date", numeric: false, required: false,
    aliases: ["construction start","ground breaking","groundbreak","start of construction","commencement date"] },
  { key: "construction_completion", label: "Construction Completion", category: "CONSTRUCTION", unit: "date", numeric: false, required: false,
    aliases: ["construction completion","completion date","substantial completion","certificate of occupancy","co date"] },

  // ===== FINANCING =====
  { key: "debt_amount", label: "Debt Amount", category: "FINANCING", unit: "$", numeric: true, required: true,
    aliases: ["debt amount","loan amount","senior loan","construction loan","mortgage amount","facility size","total debt"] },
  { key: "preferred_equity", label: "Preferred Equity", category: "FINANCING", unit: "$", numeric: true, required: false,
    aliases: ["preferred equity","pref equity","preferred capital","mezzanine"] },
  { key: "common_equity", label: "Common Equity", category: "FINANCING", unit: "$", numeric: true, required: false,
    aliases: ["common equity","sponsor equity","jv equity","limited partner equity","lp equity"] },
  { key: "equity_amount", label: "Total Equity", category: "FINANCING", unit: "$", numeric: true, required: true,
    aliases: ["equity amount","total equity","equity contribution","equity check","total equity required"] },
  { key: "interest_rate", label: "Interest Rate", category: "FINANCING", unit: "%", numeric: true, required: true,
    aliases: ["interest rate","coupon","loan rate","sofr spread","all-in rate","note rate","stated rate"] },
  { key: "loan_term", label: "Loan Term", category: "FINANCING", unit: "yr", numeric: true, required: false,
    aliases: ["loan term","term of loan","maturity","loan maturity"] },
  { key: "amortization", label: "Amortization", category: "FINANCING", unit: "yr", numeric: true, required: false,
    aliases: ["amortization","amort","amortization period","amort term"] },
  { key: "ltc", label: "Loan-to-Cost", category: "FINANCING", unit: "%", numeric: true, required: false,
    aliases: ["loan to cost","ltc","loan-to-cost ratio"] },
  { key: "ltv", label: "Loan-to-Value", category: "FINANCING", unit: "%", numeric: true, required: false,
    aliases: ["loan to value","ltv","loan-to-value ratio"] },
  { key: "dscr_requirement", label: "DSCR Requirement", category: "FINANCING", unit: "x", numeric: true, required: false,
    aliases: ["dscr requirement","minimum dscr","required dscr","dscr covenant"] },

  // ===== REVENUE =====
  { key: "unit_count", label: "Unit Count", category: "REVENUE", unit: "units", numeric: true, required: false,
    aliases: ["unit count","total units","residential units","apartment units","number of units","multifamily units"] },
  { key: "unit_mix", label: "Unit Mix", category: "REVENUE", unit: "text", numeric: false, required: false,
    aliases: ["unit mix","mix of units","bedroom mix"] },
  { key: "average_rent", label: "Average Rent (per unit / mo)", category: "REVENUE", unit: "$", numeric: true, required: false,
    aliases: ["average rent","rent per unit","monthly rent","asking rent","average monthly rent"] },
  { key: "occupancy", label: "Stabilized Occupancy", category: "REVENUE", unit: "%", numeric: true, required: true,
    aliases: ["occupancy","stabilized occupancy","economic occupancy","physical occupancy","target occupancy"] },
  { key: "rent_growth", label: "Annual Rent Growth", category: "REVENUE", unit: "%", numeric: true, required: false,
    aliases: ["rent growth","annual rent growth","rent escalation","rent inflation"] },
  { key: "lease_up_period", label: "Lease-Up Period", category: "REVENUE", unit: "mo", numeric: true, required: false,
    aliases: ["lease-up","lease up","lease-up period","lease-up schedule","absorption period"] },

  // ===== OPERATING =====
  { key: "expense_ratio", label: "Operating Expense Ratio", category: "OPERATING", unit: "%", numeric: true, required: true,
    aliases: ["operating expense ratio","opex ratio","oer","expense ratio","opex %"] },
  { key: "property_taxes", label: "Property Taxes", category: "OPERATING", unit: "$", numeric: true, required: false,
    aliases: ["property taxes","real estate taxes","property tax expense","re taxes"] },
  { key: "insurance", label: "Insurance", category: "OPERATING", unit: "$", numeric: true, required: false,
    aliases: ["insurance","insurance expense","property insurance"] },
  { key: "utilities", label: "Utilities", category: "OPERATING", unit: "$", numeric: true, required: false,
    aliases: ["utilities","utility expense"] },
  { key: "maintenance", label: "Maintenance", category: "OPERATING", unit: "$", numeric: true, required: false,
    aliases: ["maintenance","repairs and maintenance","r&m"] },
  { key: "management_fee", label: "Management Fee", category: "OPERATING", unit: "%", numeric: true, required: false,
    aliases: ["management fee","property management fee","mgmt fee"] },
  { key: "replacement_reserve", label: "Replacement Reserve", category: "OPERATING", unit: "$", numeric: true, required: false,
    aliases: ["replacement reserve","capex reserve","reserves for replacement"] },

  // ===== EXIT =====
  { key: "exit_cap_rate", label: "Exit Cap Rate", category: "EXIT", unit: "%", numeric: true, required: true,
    aliases: ["exit cap","exit cap rate","disposition cap","reversion cap rate","terminal cap","exit yield"] },
  { key: "hold_period", label: "Hold Period", category: "EXIT", unit: "yr", numeric: true, required: true,
    aliases: ["hold period","investment horizon","hold term","holding period"] },
  { key: "disposition_costs", label: "Disposition Costs", category: "EXIT", unit: "%", numeric: true, required: false,
    aliases: ["disposition cost","disposition costs","selling costs","broker fee","sale costs"] },
  { key: "terminal_value", label: "Terminal Value", category: "EXIT", unit: "$", numeric: true, required: false,
    aliases: ["terminal value","exit value","disposition value","sale price"] },

  // ===== MARKET =====
  { key: "vacancy_rate", label: "Market Vacancy Rate", category: "MARKET", unit: "%", numeric: true, required: false,
    aliases: ["vacancy rate","market vacancy","submarket vacancy"] },
  { key: "population_growth", label: "Population Growth", category: "MARKET", unit: "%", numeric: true, required: false,
    aliases: ["population growth","demographic growth"] },
  { key: "employment_growth", label: "Employment Growth", category: "MARKET", unit: "%", numeric: true, required: false,
    aliases: ["employment growth","job growth","payroll growth"] },
  { key: "market_rent_growth", label: "Market Rent Growth", category: "MARKET", unit: "%", numeric: true, required: false,
    aliases: ["market rent growth","submarket rent growth"] },

  // ===== RISK =====
  { key: "environmental_reserve", label: "Environmental Reserve", category: "RISK", unit: "$", numeric: true, required: false,
    aliases: ["environmental reserve","environmental remediation","phase ii reserve","esa reserve"] },
  { key: "delay_contingency", label: "Delay Contingency", category: "RISK", unit: "mo", numeric: true, required: false,
    aliases: ["delay contingency","schedule contingency","delay buffer"] },
  { key: "tax_reassessment", label: "Tax Reassessment", category: "RISK", unit: "$", numeric: true, required: false,
    aliases: ["tax reassessment","property tax reassessment","reassessed taxes","mill rate change"] },
  { key: "capex_reserve", label: "CapEx Reserve", category: "RISK", unit: "$", numeric: true, required: false,
    aliases: ["capex reserve","capital expenditure reserve","capital reserve"] },
];

export const ASSUMPTION_KEYS = ASSUMPTION_DEFS.map((d) => d.key);
export const ASSUMPTION_BY_KEY: Record<string, AssumptionDef> =
  Object.fromEntries(ASSUMPTION_DEFS.map((d) => [d.key, d]));
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
