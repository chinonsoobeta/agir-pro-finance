import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { listProjects } from "@/lib/projects.functions";
import { listScenarios } from "@/lib/scenarios.functions";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { computeMetrics, fmtCompact, fmtPct } from "@/lib/finance";
import { Link } from "@tanstack/react-router";

const projectsQ = queryOptions({ queryKey: ["projects"], queryFn: () => listProjects() });
const scenariosQ = queryOptions({ queryKey: ["scenarios", "all"], queryFn: () => listScenarios({ data: {} }) });

export const Route = createFileRoute("/_authenticated/scenarios")({
  head: () => ({ meta: [{ title: "Scenarios — Agir" }] }),
  loader: ({ context }) => Promise.all([
    context.queryClient.ensureQueryData(projectsQ),
    context.queryClient.ensureQueryData(scenariosQ),
  ]),
  component: ScenariosPage,
});

function ScenariosPage() {
  const { data: projects } = useSuspenseQuery(projectsQ);
  const { data: scenarios } = useSuspenseQuery(scenariosQ);

  return (
    <>
      <PageHeader title="Scenarios" subtitle="Compare best, base, and worst cases across deals" />
      <div className="p-6 space-y-4">
        {projects.length === 0 && <Card className="p-12 text-center text-sm text-muted-foreground">Create a project to run scenarios.</Card>}
        {projects.map((p) => {
          const projScenarios = scenarios.filter((s) => s.project_id === p.id);
          const base = computeMetrics(p);
          const best = computeMetrics(p, { revenue_change: 10, cost_change: -5, interest_rate_change: -0.5 });
          const worst = computeMetrics(p, { revenue_change: -15, cost_change: 10, interest_rate_change: 1 });
          return (
            <Card key={p.id} className="p-5">
              <div className="flex items-center justify-between">
                <Link to="/projects/$id" params={{ id: p.id }} className="font-semibold hover:text-primary">{p.name}</Link>
                <span className="text-xs text-muted-foreground capitalize">{p.status}</span>
              </div>
              <table className="data-grid w-full mt-3">
                <thead><tr className="bg-muted/20">
                  <th className="text-left">Scenario</th>
                  <th className="text-right">Revenue</th><th className="text-right">Profit</th>
                  <th className="text-right">Margin</th><th className="text-right">IRR</th><th className="text-right">DSCR</th>
                </tr></thead>
                <tbody>
                  <ScRow name="Worst Case" m={worst} tone="destructive" />
                  <ScRow name="Base Case" m={base} tone="primary" bold />
                  <ScRow name="Best Case" m={best} tone="success" />
                  {projScenarios.map((s) => {
                    const ms = computeMetrics(p, { revenue_change: Number(s.revenue_change), cost_change: Number(s.cost_change), interest_rate_change: Number(s.interest_rate_change) });
                    return <ScRow key={s.id} name={s.name} m={ms} />;
                  })}
                </tbody>
              </table>
            </Card>
          );
        })}
      </div>
    </>
  );
}

function ScRow({ name, m, tone, bold }: { name: string; m: any; tone?: "primary"|"success"|"destructive"; bold?: boolean }) {
  const c = tone === "primary" ? "text-primary" : tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : "";
  return (
    <tr className={bold ? "font-semibold" : ""}>
      <td className={c}>{name}</td>
      <td className="text-right num">{fmtCompact(m.projectedRevenue)}</td>
      <td className={`text-right num ${m.projectedProfit >= 0 ? "text-success" : "text-destructive"}`}>{fmtCompact(m.projectedProfit)}</td>
      <td className="text-right num">{fmtPct(m.profitMargin)}</td>
      <td className="text-right num">{fmtPct(m.irr)}</td>
      <td className="text-right num">{m.dscr.toFixed(2)}x</td>
    </tr>
  );
}
