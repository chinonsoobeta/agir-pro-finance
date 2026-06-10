import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { listProjects, listActivities } from "@/lib/projects.functions";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { computeMetrics, fmtCompact, fmtPct } from "@/lib/finance";
import { Plus, FileText, GitBranchPlus, Upload, TrendingUp, Building2, CheckCircle2, DollarSign } from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, PieChart, Pie, Cell, CartesianGrid } from "recharts";

const projectsQ = queryOptions({ queryKey: ["projects"], queryFn: () => listProjects() });
const activityQ = queryOptions({ queryKey: ["activities"], queryFn: () => listActivities() });

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Agir" }] }),
  loader: ({ context }) => Promise.all([
    context.queryClient.ensureQueryData(projectsQ),
    context.queryClient.ensureQueryData(activityQ),
  ]),
  component: Dashboard,
});

const STATUS_COLORS: Record<string, string> = {
  pipeline: "var(--color-chart-2)", underwriting: "var(--color-chart-5)",
  approved: "var(--color-chart-1)", active: "var(--color-chart-3)",
  completed: "var(--color-muted-foreground)", cancelled: "var(--color-destructive)",
};

function Dashboard() {
  const { data: projects } = useSuspenseQuery(projectsQ);
  const { data: activities } = useSuspenseQuery(activityQ);

  const total = projects.length;
  const active = projects.filter((p) => p.status === "active").length;
  const completed = projects.filter((p) => p.status === "completed").length;
  const totalValue = projects.reduce((a, p) => a + Number(p.revenue_forecast || 0), 0);
  const totalBudget = projects.reduce((a, p) => a + Number(p.acquisition_cost || 0) + Number(p.construction_cost || 0), 0);
  const totalRevenue = projects.reduce((a, p) => a + Number(p.revenue_forecast || 0), 0);
  const irrs = projects.map((p) => computeMetrics({
    acquisition_cost: +p.acquisition_cost, construction_cost: +p.construction_cost,
    revenue_forecast: +p.revenue_forecast, debt_amount: +p.debt_amount,
    equity_amount: +p.equity_amount, interest_rate: +p.interest_rate,
  }).irr).filter((v) => isFinite(v));
  const avgIRR = irrs.length ? irrs.reduce((a, b) => a + b, 0) / irrs.length : 0;

  const statusBreakdown = ["pipeline","underwriting","approved","active","completed","cancelled"].map((s) => ({
    name: s, value: projects.filter((p) => p.status === s).length,
  })).filter((x) => x.value > 0);

  const revVsBudget = projects.slice(0, 8).map((p) => ({
    name: p.name.slice(0, 12),
    Revenue: Number(p.revenue_forecast || 0),
    Cost: Number(p.acquisition_cost || 0) + Number(p.construction_cost || 0),
  }));

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Portfolio overview"
        actions={<Link to="/projects"><Button size="sm"><Plus className="size-4 mr-1" /> New project</Button></Link>} />
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi label="Total Projects" value={total.toString()} icon={Building2} />
          <Kpi label="Active" value={active.toString()} icon={TrendingUp} accent="success" />
          <Kpi label="Completed" value={completed.toString()} icon={CheckCircle2} />
          <Kpi label="Avg IRR" value={fmtPct(avgIRR)} icon={TrendingUp} accent="primary" />
          <Kpi label="Total Project Value" value={fmtCompact(totalValue)} icon={DollarSign} />
          <Kpi label="Total Budget" value={fmtCompact(totalBudget)} icon={DollarSign} />
          <Kpi label="Forecast Revenue" value={fmtCompact(totalRevenue)} icon={DollarSign} accent="primary" />
          <Kpi label="Avg Deal Size" value={fmtCompact(total ? totalBudget / total : 0)} icon={DollarSign} />
        </div>

        <div className="grid lg:grid-cols-3 gap-3">
          <Card className="lg:col-span-2 p-5">
            <SectionLabel>Revenue vs Cost · Top Projects</SectionLabel>
            <div className="h-64 mt-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revVsBudget} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--color-border)" strokeDasharray="2 4" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} />
                  <YAxis tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }} tickFormatter={(v) => fmtCompact(v)} />
                  <Tooltip contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", fontSize: 12 }} formatter={(v: number) => fmtCompact(v)} />
                  <Bar dataKey="Revenue" fill="var(--color-chart-1)" radius={[2,2,0,0]} />
                  <Bar dataKey="Cost" fill="var(--color-chart-2)" radius={[2,2,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card className="p-5">
            <SectionLabel>Project Status</SectionLabel>
            <div className="h-64 mt-3">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusBreakdown} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                    {statusBreakdown.map((s) => <Cell key={s.name} fill={STATUS_COLORS[s.name]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "var(--color-popover)", border: "1px solid var(--color-border)", fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-1 mt-2">
              {statusBreakdown.map((s) => (
                <div key={s.name} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2 capitalize text-muted-foreground">
                    <span className="size-2 rounded-sm" style={{ background: STATUS_COLORS[s.name] }} />{s.name}
                  </span>
                  <span className="num">{s.value}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="grid lg:grid-cols-3 gap-3">
          <Card className="lg:col-span-2 p-5">
            <SectionLabel>Quick Actions</SectionLabel>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
              <QuickAction to="/projects" icon={Plus} label="Create Project" />
              <QuickAction to="/projects" icon={FileText} label="Generate Memo" />
              <QuickAction to="/documents" icon={Upload} label="Upload Docs" />
              <QuickAction to="/scenarios" icon={GitBranchPlus} label="Run Scenario" />
            </div>
          </Card>
          <Card className="p-5">
            <SectionLabel>Recent Activity</SectionLabel>
            <div className="mt-3 space-y-2 max-h-64 overflow-auto">
              {activities.length === 0 && <p className="text-xs text-muted-foreground">No activity yet.</p>}
              {activities.map((a: any) => (
                <div key={a.id} className="text-xs border-l-2 border-primary/40 pl-2 py-1">
                  <div className="font-medium">{a.description}</div>
                  <div className="text-muted-foreground mt-0.5 font-mono text-[10px]">
                    {a.projects?.name || "—"} · {new Date(a.created_at).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

function Kpi({ label, value, icon: Icon, accent }: { label: string; value: string; icon: any; accent?: "primary" | "success" }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
        <Icon className={`size-3.5 ${accent === "primary" ? "text-primary" : accent === "success" ? "text-success" : "text-muted-foreground"}`} />
      </div>
      <div className={`num text-2xl mt-2 ${accent === "primary" ? "text-primary" : ""}`}>{value}</div>
    </Card>
  );
}
function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">{children}</div>;
}
function QuickAction({ to, icon: Icon, label }: { to: string; icon: any; label: string }) {
  return (
    <Link to={to as any} className="border border-border rounded-md p-4 hover:border-primary hover:bg-accent/30 transition-colors text-center">
      <Icon className="size-5 mx-auto text-primary" />
      <div className="text-xs mt-2">{label}</div>
    </Link>
  );
}
