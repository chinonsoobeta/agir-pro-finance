// Cross-project Assumption Review Center. Lists every pending / low-confidence
// / missing assumption across projects so reviewers have a single queue.

import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { listAssumptionsAcrossProjects } from "@/lib/assumptions.functions";
import { listProjects } from "@/lib/projects.functions";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";

const allAssumptionsQ = queryOptions({ queryKey: ["assumptions", "all"], queryFn: () => listAssumptionsAcrossProjects() });
const projectsQ = queryOptions({ queryKey: ["projects"], queryFn: () => listProjects() });

export const Route = createFileRoute("/_authenticated/assumptions")({
  head: () => ({ meta: [{ title: "Assumption Review Center — Agir" }] }),
  loader: ({ context }) => Promise.all([
    context.queryClient.ensureQueryData(allAssumptionsQ),
    context.queryClient.ensureQueryData(projectsQ),
  ]),
  component: AssumptionsReviewCenter,
});

const STATUS_STYLES: Record<string, string> = {
  approved: "bg-success/20 text-success border-success/30",
  modified: "bg-primary/20 text-primary border-primary/30",
  pending: "bg-chart-5/20 text-chart-5 border-chart-5/30",
  needs_review: "bg-chart-2/20 text-chart-2 border-chart-2/30",
  rejected: "bg-destructive/20 text-destructive border-destructive/30",
  missing: "bg-muted text-muted-foreground border-border",
};

function AssumptionsReviewCenter() {
  const { data: rows } = useSuspenseQuery(allAssumptionsQ);
  const { data: projects } = useSuspenseQuery(projectsQ);
  const [filter, setFilter] = useState<string>("queue");

  const queue = rows.filter((r) => ["pending","needs_review","missing"].includes(r.status));
  const visible = filter === "all" ? rows : filter === "queue" ? queue
    : rows.filter((r) => r.status === filter);

  const stats = {
    total: rows.length,
    approved: rows.filter((r) => r.status === "approved" || r.status === "modified").length,
    pending: queue.length,
    rejected: rows.filter((r) => r.status === "rejected").length,
  };

  return (
    <>
      <PageHeader
        title="Assumption Review Center"
        subtitle={`${stats.total} assumptions across ${projects.length} projects · ${stats.approved} approved · ${stats.pending} in queue`}
      />
      <div className="p-6 space-y-4">
        <div className="flex gap-2 flex-wrap">
          {[
            ["queue", `Review queue (${queue.length})`],
            ["all", `All (${stats.total})`],
            ["approved", "Approved"],
            ["modified", "Modified"],
            ["pending", "Pending"],
            ["missing", "Missing"],
            ["rejected", "Rejected"],
          ].map(([k, label]) => (
            <button key={k} onClick={() => setFilter(k)}
              className={`text-[11px] uppercase tracking-widest px-3 py-1.5 rounded border ${filter === k ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
              {label}
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <Card className="p-12 text-center text-sm text-muted-foreground">
            Nothing here. Try the <strong>Try Harbour Centre demo</strong> button on the Projects page to seed a live deal.
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <table className="data-grid w-full">
              <thead><tr className="bg-muted/30">
                <th className="text-left">Project</th>
                <th className="text-left">Assumption</th>
                <th className="text-left">Category</th>
                <th className="text-right">Value</th>
                <th className="text-center">Confidence</th>
                <th className="text-center">Status</th>
                <th className="text-left">Source</th>
              </tr></thead>
              <tbody>
                {visible.map((a: any) => (
                  <tr key={a.id} className="hover:bg-accent/30">
                    <td>
                      <Link to="/projects/$id" params={{ id: a.project_id }} className="font-medium hover:text-primary">
                        {a.projects?.name ?? "—"}
                      </Link>
                    </td>
                    <td>{a.field_label}</td>
                    <td className="text-xs text-muted-foreground">{a.category}</td>
                    <td className="text-right num">
                      {a.value_numeric != null ? Number(a.value_numeric).toLocaleString() : a.value_text ?? "—"} {a.unit && a.unit !== "text" ? a.unit : ""}
                    </td>
                    <td className="text-center font-mono text-xs">{a.confidence_score}%</td>
                    <td className="text-center"><Badge variant="outline" className={`${STATUS_STYLES[a.status]} text-[10px] capitalize`}>{a.status.replace("_"," ")}</Badge></td>
                    <td className="text-xs text-muted-foreground max-w-[220px] truncate">{a.source_location || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </>
  );
}
