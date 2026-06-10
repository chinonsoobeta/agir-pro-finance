export type ProjectInput = {
  acquisition_cost?: number | string | null;
  construction_cost?: number | string | null;
  revenue_forecast?: number | string | null;
  debt_amount?: number | string | null;
  equity_amount?: number | string | null;
  interest_rate?: number | string | null;
};

const num = (v: number | string | null | undefined) => Number(v ?? 0) || 0;

export function computeMetrics(p: ProjectInput, scenario?: {
  revenue_change?: number; cost_change?: number; interest_rate_change?: number;
}) {
  const acq = num(p.acquisition_cost);
  const con = num(p.construction_cost);
  const revF = num(p.revenue_forecast);
  const debt = num(p.debt_amount);
  const eq = num(p.equity_amount);
  const rateBase = num(p.interest_rate);

  const rev = revF * (1 + (scenario?.revenue_change ?? 0) / 100);
  const cost = (acq + con) * (1 + (scenario?.cost_change ?? 0) / 100);
  const rate = rateBase + (scenario?.interest_rate_change ?? 0);
  const totalCost = cost;
  const profit = rev - totalCost;
  const margin = rev > 0 ? (profit / rev) * 100 : 0;
  const equityReq = Math.max(totalCost - debt, 0);
  const ltc = totalCost > 0 ? (debt / totalCost) * 100 : 0;
  const annualDebtService = debt * (rate / 100);
  const noi = profit / 5;
  const dscr = annualDebtService > 0 ? noi / annualDebtService : 0;
  const equityBase = eq || equityReq;
  const irr = equityBase > 0 ? (Math.pow(1 + profit / equityBase, 1 / 3) - 1) * 100 : 0;
  const coc = equityBase > 0 ? ((noi - annualDebtService) / equityBase) * 100 : 0;
  return { totalCost, projectedRevenue: rev, projectedProfit: profit, profitMargin: margin,
    equityRequirement: equityReq, ltc, dscr, irr, coc };
}

export const fmtCurrency = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n || 0);
export const fmtPct = (n: number) => `${(n || 0).toFixed(2)}%`;
export const fmtCompact = (n: number) =>
  new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1, style: "currency", currency: "USD" }).format(n || 0);
