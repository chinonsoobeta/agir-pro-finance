import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { getProject } from "@/lib/projects.functions";
import { listDocuments } from "@/lib/documents.functions";
import { listAssumptions, listFinancialOutputs } from "@/lib/assumptions.functions";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, FileText } from "lucide-react";
import { computeMetrics, fmtCompact, fmtPct } from "@/lib/finance";
import { useState } from "react";
import { AssumptionReviewCenter } from "@/components/assumption-review";
import { UnderwritingPanel, ICPanel, AuditPanel } from "@/components/underwriting-panel";

const projectQ = (id: string) => queryOptions({ queryKey: ["project", id], queryFn: () => getProject({ data: { id } }) });
const docsQ = (id: string) => queryOptions({ queryKey: ["docs", id], queryFn: () => listDocuments({ data: { project_id: id } }) });
const assumptionsQ = (id: string) => queryOptions({ queryKey: ["assumptions", id], queryFn: () => listAssumptions({ data: { project_id: id } }) });
const outputsQ = (id: string) => queryOptions({ queryKey: ["outputs", id], queryFn: () => listFinancialOutputs({ data: { project_id: id } }) });

const PROJECT_TABS = [
  { value: "overview", label: "Overview" },
  { value: "documents", label: "Documents" },
  { value: "assumptions", label: "Assumptions" },
  { value: "underwriting", label: "Underwriting" },
  { value: "ic_decision", label: "IC Decision" },
  { value: "audit", label: "Audit" },
] as const;

export const Route = createFileRoute("/_authenticated/projects/$id")({
  head: () => ({ meta: [{ title: "Project — Agir" }] }),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(projectQ(params.id)),
  component: ProjectDetail,
});

function ProjectDetail() {
  const { id } = Route.useParams();
  const currentRoute = useRouterState({ select: (s) => s.location.pathname });
  const [currentTab, setCurrentTab] = useState<(typeof PROJECT_TABS)[number]["value"]>("overview");
  const { data: project } = useSuspenseQuery(projectQ(id));
  const { data: documents = [] } = useSuspenseQuery(docsQ(id));
  const { data: assumptions = [] } = useSuspenseQuery(assumptionsQ(id));
  const { data: outputs = [] } = useSuspenseQuery(outputsQ(id));
  const m = computeMetrics(project);
  const underwritingStatus = outputs.length > 0 ? "Generated" : "Not started";

  return (
    <>
      <PageHeader
        title={project.name}
        subtitle={`${project.location || "—"} · ${project.type.replace("_"," ")} · ${project.status}`}
        actions={
          <Link to="/projects"><Button variant="ghost" size="sm"><ArrowLeft className="size-4 mr-1" />Back</Button></Link>
        } />
      <div className="p-6">
        <ProjectNavigationDebugPanel
          projectId={id}
          currentRoute={currentRoute}
          currentTab={currentTab}
          documentsCount={documents.length}
          assumptionsCount={assumptions.length}
          underwritingStatus={underwritingStatus}
        />
        <Tabs value={currentTab} onValueChange={(value) => setCurrentTab(value as typeof currentTab)}>
          <TabsList className="flex flex-wrap h-auto w-full justify-start gap-1">
            {PROJECT_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>{tab.label}</TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="overview" className="mt-4 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Metric label="Total Cost" value={fmtCompact(m.totalCost)} />
              <Metric label="Revenue" value={fmtCompact(m.projectedRevenue)} />
              <Metric label="Profit" value={fmtCompact(m.projectedProfit)} accent={m.projectedProfit >= 0 ? "success" : "destructive"} />
              <Metric label="Margin" value={fmtPct(m.profitMargin)} accent="primary" />
              <Metric label="Equity Req." value={fmtCompact(m.equityRequirement)} />
              <Metric label="LTC" value={fmtPct(m.ltc)} />
              <Metric label="DSCR" value={m.dscr.toFixed(2) + "x"} />
              <Metric label="IRR Est." value={fmtPct(m.irr)} accent="primary" />
            </div>
            <Card className="p-5">
              <SectionLabel>Notes</SectionLabel>
              <p className="text-sm mt-2 whitespace-pre-wrap">{project.notes || "No notes."}</p>
            </Card>
          </TabsContent>

          <TabsContent value="assumptions" className="mt-4"><AssumptionReviewCenter projectId={id} /></TabsContent>
          <TabsContent value="underwriting" className="mt-4"><UnderwritingPanel projectId={id} /></TabsContent>
          <TabsContent value="ic_decision" className="mt-4"><ICPanel projectId={id} /></TabsContent>
          <TabsContent value="audit" className="mt-4"><AuditPanel projectId={id} /></TabsContent>
          <TabsContent value="documents" className="mt-4"><DocumentsTab projectId={id} /></TabsContent>
        </Tabs>
      </div>
    </>
  );
}

function ProjectNavigationDebugPanel({
  projectId,
  currentRoute,
  currentTab,
  documentsCount,
  assumptionsCount,
  underwritingStatus,
}: {
  projectId: string;
  currentRoute: string;
  currentTab: string;
  documentsCount: number;
  assumptionsCount: number;
  underwritingStatus: string;
}) {
  return (
    <Card className="p-4 mb-4">
      <SectionLabel>Project Navigation Debug</SectionLabel>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3 text-sm">
        <DebugItem label="Current Project ID" value={projectId} />
        <DebugItem label="Current Route" value={currentRoute} />
        <DebugItem label="Current Tab" value={currentTab} />
        <DebugItem label="Documents Count" value={String(documentsCount)} />
        <DebugItem label="Assumptions Count" value={String(assumptionsCount)} />
        <DebugItem label="Underwriting Status" value={underwritingStatus} />
      </div>
    </Card>
  );
}

function DebugItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="font-mono text-xs mt-1 break-all">{value}</div>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: "primary"|"success"|"destructive" }) {
  const color = accent === "primary" ? "text-primary" : accent === "success" ? "text-success" : accent === "destructive" ? "text-destructive" : "";
  return (
    <Card className="p-4">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`num text-xl mt-1 ${color}`}>{value}</div>
    </Card>
  );
}
function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">{children}</div>;
}

function DocumentsTab({ projectId }: { projectId: string }) {
  const { data: docs = [] } = useSuspenseQuery(docsQ(projectId));
  return (
    <Card className="p-5">
      <SectionLabel>Documents</SectionLabel>
      {docs.length === 0 ? (
        <p className="text-sm text-muted-foreground mt-3">No documents. Upload from the Documents tab.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center justify-between text-sm border-b border-border pb-2">
              <span className="flex items-center gap-2"><FileText className="size-4 text-primary" />{d.name}</span>
              <span className="text-xs text-muted-foreground">{d.category || "—"}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
