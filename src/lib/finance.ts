export type ProjectInput = {
  acquisition_cost: number;
  construction_cost: number;
  revenue_forecast: number;
  debt_amount: number;
  equity_amount: number;
  interest_rate: number;
};

export function computeMetrics(p: ProjectInput, scenario?: {
  revenue_change?: number; cost_change?: number; interest_rate_change?: number;
}) {
  const rev = (p.revenue_forecast || 0) * (1 + (scenario?.revenue_change ?? 0) / 100);
  const cost = ((p.acquisition_cost || 0) + (p.construction_cost || 0)) *
    (1 + (scenario?.cost_change ?? 0) / 100);
  const rate = (p.interest_rate || 0) + (scenario?.interest_rate_change ?? 0);
  const totalCost = cost;
  const profit = rev - totalCost;
  const margin = rev > 0 ? (profit / rev) * 100 : 0;
  const equityReq = Math.max(totalCost - (p.debt_amount || 0), 0);
  const ltc = totalCost > 0 ? ((p.debt_amount || 0) / totalCost) * 100 : 0;
  const annualDebtService = (p.debt_amount || 0) * (rate / 100);
  // Simple NOI proxy = profit / 5yr (placeholder)
  const noi = profit / 5;
  const dscr = annualDebtService > 0 ? noi / annualDebtService : 0;
  // Rough IRR estimate: profit / equity over assumed 3yr hold
  const irr = (p.equity_amount || equityReq) > 0
    ? (Math.pow(1 + profit / (p.equity_amount || equityReq), 1 / 3) - 1) * 100
    : 0;
  const coc = (p.equity_amount || equityReq) > 0
    ? ((noi - annualDebtService) / (p.equity_amount || equityReq)) * 100
    : 0;
  return { totalCost, projectedRevenue: rev, projectedProfit: profit, profitMargin: margin,
    equityRequirement: equityReq, ltc, dscr, irr, coc };
}

export const fmtCurrency = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n || 0);
export const fmtPct = (n: number) => `${(n || 0).toFixed(2)}%`;
export const fmtCompact = (n: number) =>
  new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1, style: "currency", currency: "USD" }).format(n || 0);
