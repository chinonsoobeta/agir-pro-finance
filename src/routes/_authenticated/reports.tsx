import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { BarChart3, FileText, TrendingUp, Shield } from "lucide-react";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({ meta: [{ title: "Reports — Agir" }] }),
  component: ReportsPage,
});

function ReportsPage() {
  const types = [
    { icon: FileText, name: "Investor Report", desc: "Project summary, financial metrics, scenario results" },
    { icon: Shield, name: "Lender Package", desc: "DSCR, LTC, sources & uses, risk analysis" },
    { icon: BarChart3, name: "Executive Summary", desc: "Portfolio KPIs, pipeline, performance trends" },
    { icon: TrendingUp, name: "Internal Team Report", desc: "Budget vs actual, milestone tracking, action items" },
  ];
  return (
    <>
      <PageHeader title="Reports" subtitle="Generate stakeholder-ready PDF & Excel reports" />
      <div className="p-6">
        <div className="grid md:grid-cols-2 gap-3">
          {types.map((t) => (
            <Card key={t.name} className="p-5 hover:border-primary transition-colors">
              <div className="flex items-start gap-3">
                <div className="size-10 rounded-md bg-primary/10 flex items-center justify-center"><t.icon className="size-5 text-primary" /></div>
                <div className="flex-1">
                  <h3 className="font-semibold">{t.name}</h3>
                  <p className="text-xs text-muted-foreground mt-1">{t.desc}</p>
                  <div className="mt-3 text-[10px] uppercase tracking-widest text-muted-foreground">Coming in next release</div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}
