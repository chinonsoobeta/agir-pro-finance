import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { listProjects } from "@/lib/projects.functions";
import { listScenarios } from "@/lib/scenarios.functions";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
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
      <PageHeader title="Scenarios" subtitle="Stress, downside and upside scenarios are computed by the deterministic finance engine per project." />
      <div className="p-6 space-y-4">
        <Card className="p-4 border-dashed text-sm text-muted-foreground">
          Phase 3 (Scenario Engine) will publish downside/shock/stress results here. Until then, open a project → Underwriting to inspect the base-case audit.
        </Card>
        {projects.length === 0 && <Card className="p-12 text-center text-sm text-muted-foreground">Create a project to manage scenarios.</Card>}
        {projects.map((p) => {
          const projScenarios = scenarios.filter((s) => s.project_id === p.id);
          return (
            <Card key={p.id} className="p-5">
              <div className="flex items-center justify-between">
                <Link to="/projects/$id" params={{ id: p.id }} className="font-semibold hover:text-primary">{p.name}</Link>
                <span className="text-xs text-muted-foreground capitalize">{p.status}</span>
              </div>
              {projScenarios.length === 0 ? (
                <p className="text-xs text-muted-foreground mt-3">No scenarios saved.</p>
              ) : (
                <ul className="mt-3 text-sm space-y-1">
                  {projScenarios.map((s) => (
                    <li key={s.id} className="flex justify-between border-b border-border pb-1">
                      <span>{s.name}</span>
                      <span className="text-muted-foreground font-mono text-xs">
                        rev {s.revenue_change}% · cost {s.cost_change}% · rate {s.interest_rate_change}bps
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}
