// Underwriting tab: shows derived financial outputs (base + stress
// scenarios), risk register, IC decision form, audit log, and impact ranking.

import { useState } from "react";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listFinancialOutputs, listRisks, listDecisions, listAudit, recordDecision, recomputeOutputs } from "@/lib/assumptions.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, ShieldAlert, Info, Calculator } from "lucide-react";
import { toast } from "sonner";

const outputsQ = (pid: string) => queryOptions({ queryKey: ["outputs", pid], queryFn: () => listFinancialOutputs({ data: { project_id: pid } }) });
const risksQ = (pid: string) => queryOptions({ queryKey: ["risks", pid], queryFn: () => listRisks({ data: { project_id: pid } }) });
const decisionsQ = (pid: string) => queryOptions({ queryKey: ["decisions", pid], queryFn: () => listDecisions({ data: { project_id: pid } }) });
const auditQ = (pid: string) => queryOptions({ queryKey: ["audit", pid], queryFn: () => listAudit({ data: { project_id: pid } }) });

const SCENARIO_LABELS: Record<string, string> = {
  base: "Base Case", revenue_down: "Revenue Downside (−10%)",
  cost_overrun: "Cost Overrun (+10%)", rate_shock: "Rate Shock (+150 bps)",
  cap_expansion: "Cap Expansion (+75 bps)", combined: "Combined Stress",
};
const SEV_STYLES: Record<string, string> = {
  info: "bg-muted text-muted-foreground border-border",
  yellow: "bg-chart-5/20 text-chart-5 border-chart-5/30",
  red: "bg-destructive/20 text-destructive border-destructive/30",
  critical: "bg-destructive text-destructive-foreground border-destructive",
};

function fmtValue(v: number, unit: string) {
  if (unit === "$") return new Intl.NumberFormat("en-US", { notation: "compact", style: "currency", currency: "USD", maximumFractionDigits: 1 }).format(v);
  if (unit === "%") return `${v.toFixed(2)}%`;
  if (unit === "x") return `${v.toFixed(2)}x`;
  if (unit === "bps") return `${v.toFixed(0)} bps`;
  return v.toLocaleString();
}

export function UnderwritingPanel({ projectId }: { projectId: string }) {
  const { data: outputs } = useSuspenseQuery(outputsQ(projectId));
  const { data: risks } = useSuspenseQuery(risksQ(projectId));
  const qc = useQueryClient();
  const recomputeFn = useServerFn(recomputeOutputs);
  const recompute = useMutation({
    mutationFn: () => recomputeFn({ data: { project_id: projectId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["outputs", projectId] });
      qc.invalidateQueries({ queryKey: ["risks", projectId] });
      toast.success("Underwriting generated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const byScenario = outputs.reduce<Record<string, any[]>>((acc, o) => {
    (acc[o.scenario_key] ||= []).push(o); return acc;
  }, {});
  const base = byScenario.base ?? [];
  const metricKeys = base.map((m) => m.metric_key);
  const scenarioKeys = Object.keys(byScenario).filter((k) => k !== "base");
  const metric = (key: string) => base.find((b) => b.metric_key === key);
  const riskScore = risks.length ? Math.min(100, risks.length * 20) : 0;

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => recompute.mutate()} disabled={recompute.isPending}>Generate Base Case</Button>
          <Button variant="outline" onClick={() => recompute.mutate()} disabled={recompute.isPending}>Generate Stress Test</Button>
          <Button variant="outline" onClick={() => recompute.mutate()} disabled={recompute.isPending}>Run Full Underwriting</Button>
        </div>
      </Card>

      {/* Headline metrics */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <UnderwritingMetric label="Project Value" row={metric("exit_value")} />
        <UnderwritingMetric label="IRR" row={metric("irr")} />
        <UnderwritingMetric label="DSCR" row={metric("dscr")} />
        <UnderwritingMetric label="Equity Multiple" row={metric("equity_multiple")} />
        <Card className="p-4">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Risk Score</div>
          <div className="num text-2xl mt-1 text-primary">{outputs.length ? riskScore : "—"}</div>
          <div className="text-[10px] text-muted-foreground mt-1 font-mono">Automated risk flags × 20</div>
        </Card>
      </div>

      {!outputs.length && (
        <Card className="p-12 text-center text-sm text-muted-foreground">
          No financial outputs yet. Approve or modify assumptions, then run underwriting.
        </Card>
      )}

      {/* Full metric table with scenarios */}
      {outputs.length > 0 && <Card className="overflow-hidden">
        <div className="px-4 py-2 border-b border-border bg-muted/20 text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
          Pro Forma — Base & Stress
        </div>
        <div className="overflow-x-auto">
          <table className="data-grid w-full">
            <thead><tr className="bg-muted/10">
              <th className="text-left">Metric</th>
              <th className="text-right text-primary">{SCENARIO_LABELS.base}</th>
              {scenarioKeys.map((k) => <th key={k} className="text-right">{SCENARIO_LABELS[k] ?? k}</th>)}
              <th className="text-left">Formula</th>
            </tr></thead>
            <tbody>
              {metricKeys.map((mk) => {
                const baseRow = base.find((b) => b.metric_key === mk);
                return (
                  <tr key={mk}>
                    <td className="font-medium">{baseRow?.metric_label}</td>
                    <td className="text-right num text-primary">{fmtValue(Number(baseRow?.value_numeric ?? 0), baseRow?.unit ?? "")}</td>
                    {scenarioKeys.map((sk) => {
                      const r = byScenario[sk].find((b) => b.metric_key === mk);
                      return <td key={sk} className="text-right num">{r ? fmtValue(Number(r.value_numeric), r.unit) : "—"}</td>;
                    })}
                    <td className="text-xs text-muted-foreground font-mono">{baseRow?.formula_text}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>}

      {/* Risk register */}
      <Card className="p-5">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-3">Risk Register</div>
        {risks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No automated flags. Approve more assumptions to populate.</p>
        ) : (
          <ul className="space-y-2">
            {risks.map((r) => {
              const Icon = r.severity === "red" || r.severity === "critical" ? ShieldAlert : r.severity === "yellow" ? AlertTriangle : Info;
              return (
                <li key={r.id} className="flex items-start gap-3 p-3 rounded border border-border bg-muted/10">
                  <Icon className="size-4 mt-0.5 text-chart-5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{r.title}</span>
                      <Badge variant="outline" className={`${SEV_STYLES[r.severity]} text-[10px] uppercase`}>{r.severity}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{r.description}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

function UnderwritingMetric({ label, row }: { label: string; row?: any }) {
  return (
    <Card className="p-4">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="num text-2xl mt-1 text-primary">{row ? fmtValue(Number(row.value_numeric), row.unit) : "—"}</div>
      <div className="text-[10px] text-muted-foreground mt-1 font-mono">{row?.formula_text ?? "Pending underwriting run"}</div>
    </Card>
  );
}

export function ICPanel({ projectId }: { projectId: string }) {
  const { data: decisions } = useSuspenseQuery(decisionsQ(projectId));
  const qc = useQueryClient();
  const fn = useServerFn(recordDecision);
  const [decision, setDecision] = useState<"approve" | "approve_with_conditions" | "reject">("approve_with_conditions");
  const [rationale, setRationale] = useState("");
  const [conditions, setConditions] = useState("");

  const submit = useMutation({
    mutationFn: () => fn({ data: { project_id: projectId, decision, rationale, conditions: conditions || undefined } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["decisions", projectId] });
      qc.invalidateQueries({ queryKey: ["audit", projectId] });
      toast.success("IC decision recorded");
      setRationale(""); setConditions("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <Card className="p-5 space-y-3">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">New IC decision</div>
        <div className="flex flex-wrap gap-2">
          <Button variant={decision === "approve" ? "default" : "outline"} onClick={() => setDecision("approve")}>Approve</Button>
          <Button variant={decision === "approve_with_conditions" ? "default" : "outline"} onClick={() => setDecision("approve_with_conditions")}>Approve with Conditions</Button>
          <Button variant={decision === "reject" ? "default" : "outline"} onClick={() => setDecision("reject")}>Reject</Button>
        </div>
        <Textarea rows={3} placeholder="Comment / rationale (cite approved assumptions, IRR/EM, DSCR, market guidance)" value={rationale} onChange={(e) => setRationale(e.target.value)} />
        {decision === "approve_with_conditions" && (
          <Textarea rows={3} placeholder="Conditions (e.g. cap hard cost re-bid ≤ +5%, confirm rate ≤ 6.5%, OpEx ratio ≤ 38%)" value={conditions} onChange={(e) => setConditions(e.target.value)} />
        )}
        <Button onClick={() => submit.mutate()} disabled={!rationale || submit.isPending}>
          <Calculator className="size-4 mr-1" />Record decision
        </Button>
      </Card>

      <Card className="overflow-hidden">
        <div className="px-4 py-2 border-b border-border bg-muted/20 text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Decision History</div>
        {decisions.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No decisions recorded yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {decisions.map((d: any) => (
              <li key={d.id} className="p-4 text-sm">
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="text-[10px] uppercase">{d.decision.replace(/_/g, " ")}</Badge>
                  <span className="text-xs text-muted-foreground">{new Date(d.created_at).toLocaleString()} · {d.user_name}</span>
                </div>
                <p className="mt-2 text-sm whitespace-pre-wrap">{d.rationale}</p>
                {d.conditions && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    <span className="font-semibold uppercase tracking-widest text-chart-5">Conditions: </span>
                    <span className="whitespace-pre-wrap">{d.conditions}</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export function AuditPanel({ projectId }: { projectId: string }) {
  const { data: audit } = useSuspenseQuery(auditQ(projectId));
  const groups = [
    { label: "Assumption Changes", rows: audit.filter((a: any) => a.entity_type === "assumption" || String(a.action).startsWith("assumption_")) },
    { label: "Decision Changes", rows: audit.filter((a: any) => a.entity_type === "decision" || a.action === "ic_decision") },
    { label: "User Activity", rows: audit.filter((a: any) => a.entity_type !== "assumption" && a.entity_type !== "decision") },
    { label: "Version History", rows: audit.filter((a: any) => a.action === "extract_assumptions" || a.action === "recompute_outputs") },
  ];
  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <Card key={group.label} className="overflow-hidden">
          <div className="px-4 py-2 border-b border-border bg-muted/20 text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">{group.label}</div>
          {group.rows.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No {group.label.toLowerCase()} yet.</p>
          ) : (
            <table className="data-grid w-full">
              <thead><tr className="bg-muted/10">
                <th className="text-left">Time</th>
                <th className="text-left">Action</th>
                <th className="text-left">Entity</th>
                <th className="text-left">Payload</th>
              </tr></thead>
              <tbody>
                {group.rows.map((a: any) => (
                  <tr key={a.id} className="hover:bg-accent/20">
                    <td className="text-xs font-mono text-muted-foreground whitespace-nowrap">{new Date(a.created_at).toLocaleString()}</td>
                    <td className="font-medium">{a.action}</td>
                    <td className="text-xs text-muted-foreground">{a.entity_type}</td>
                    <td className="text-[10px] font-mono text-muted-foreground max-w-md truncate">{JSON.stringify(a.payload)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      ))}
    </div>
  );
}
