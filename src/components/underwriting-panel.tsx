// Underwriting tab: shows derived financial outputs (base + stress
// scenarios), risk register, IC decision form, audit log, and a
// Validation Dashboard. Strict mode — no fabricated values.

import { useState } from "react";
import { queryOptions, useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listFinancialOutputs, listRisks, listDecisions, listAudit, listAssumptions,
  recordDecision, recomputeOutputs, getValidationDashboard, getReadiness,
} from "@/lib/assumptions.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, ShieldAlert, Info, Calculator, ChevronDown, ChevronRight, Ban } from "lucide-react";
import { toast } from "sonner";

const outputsQ = (pid: string) => queryOptions({ queryKey: ["outputs", pid], queryFn: () => listFinancialOutputs({ data: { project_id: pid } }) });
const risksQ = (pid: string) => queryOptions({ queryKey: ["risks", pid], queryFn: () => listRisks({ data: { project_id: pid } }) });
const decisionsQ = (pid: string) => queryOptions({ queryKey: ["decisions", pid], queryFn: () => listDecisions({ data: { project_id: pid } }) });
const auditQ = (pid: string) => queryOptions({ queryKey: ["audit", pid], queryFn: () => listAudit({ data: { project_id: pid } }) });
const validationQ = (pid: string) => queryOptions({ queryKey: ["validation", pid], queryFn: () => getValidationDashboard({ data: { project_id: pid } }) });
const readinessQ = (pid: string) => queryOptions({ queryKey: ["readiness", pid], queryFn: () => getReadiness({ data: { project_id: pid } }) });
const assumptionsQ = (pid: string) => queryOptions({ queryKey: ["assumptions", pid], queryFn: () => listAssumptions({ data: { project_id: pid } }) });

const SCENARIO_LABELS: Record<string, string> = {
  base: "Base Case", revenue_down: "Revenue Downside",
  cost_overrun: "Cost Overrun (+10%)", rate_shock: "Rate Shock (+150 bps)",
  cap_expansion: "Cap Expansion (+75 bps)",
};
const SEV_STYLES: Record<string, string> = {
  info: "bg-muted text-muted-foreground border-border",
  yellow: "bg-chart-5/20 text-chart-5 border-chart-5/30",
  red: "bg-destructive/20 text-destructive border-destructive/30",
  critical: "bg-destructive text-destructive-foreground border-destructive",
};

function fmtValue(v: number | null | undefined, unit: string) {
  if (v == null || isNaN(Number(v))) return "—";
  const n = Number(v);
  if (unit === "$") return new Intl.NumberFormat("en-US", { notation: "compact", style: "currency", currency: "USD", maximumFractionDigits: 1 }).format(n);
  if (unit === "%") return `${n.toFixed(2)}%`;
  if (unit === "x") return `${n.toFixed(2)}x`;
  if (unit === "bps") return `${n.toFixed(0)} bps`;
  return n.toLocaleString();
}

function fmtInput(v: any, unit?: string) {
  if (v == null) return "Missing";
  if (typeof v === "number") return fmtValue(v, unit ?? "");
  if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
  return String(v);
}

export function UnderwritingPanel({ projectId }: { projectId: string }) {
  const { data: outputs } = useSuspenseQuery(outputsQ(projectId));
  const { data: risks } = useSuspenseQuery(risksQ(projectId));
  const { data: validation } = useSuspenseQuery(validationQ(projectId));
  const { data: readiness } = useSuspenseQuery(readinessQ(projectId));
  const { data: assumptions } = useSuspenseQuery(assumptionsQ(projectId));
  const qc = useQueryClient();
  const recomputeFn = useServerFn(recomputeOutputs);
  const [blocked, setBlocked] = useState<{ missing: string[]; conflicting: string[] } | null>(null);

  const recompute = useMutation({
    mutationFn: () => recomputeFn({ data: { project_id: projectId } }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["outputs", projectId] });
      qc.invalidateQueries({ queryKey: ["risks", projectId] });
      qc.invalidateQueries({ queryKey: ["validation", projectId] });
      setBlocked(null);
      toast.success(`Underwriting complete — ${r.ok} metrics generated, ${r.blocked} blocked`);
    },
    onError: (e: any) => {
      const b = e?.cause?.blocked || e?.blocked;
      if (b) setBlocked(b);
      else setBlocked({ missing: [e?.message ?? "Unknown error"], conflicting: [] });
      toast.error("Underwriting blocked — see details below");
    },
  });

  const byScenario = outputs.reduce<Record<string, any[]>>((acc, o) => {
    (acc[o.scenario_key] ||= []).push(o); return acc;
  }, {});
  const base = byScenario.base ?? [];
  const metricKeys = base.map((m) => m.metric_key);
  const scenarioKeys = Object.keys(byScenario).filter((k) => k !== "base");
  const metric = (key: string) => base.find((b) => b.metric_key === key);

  const assumptionLabel = (k: string) => assumptions.find((a: any) => a.field_key === k)?.field_label ?? k;
  const assumptionValue = (k: string) => {
    const a = assumptions.find((x: any) => x.field_key === k);
    if (!a) return null;
    return a.value_numeric ?? a.value_text ?? null;
  };

  return (
    <div className="space-y-4">
      {/* Action bar */}
      <Card className="p-5">
        <div className="flex flex-wrap gap-2 items-center">
          <Button onClick={() => recompute.mutate()} disabled={recompute.isPending}>
            <Calculator className="size-4 mr-1" />Run Underwriting
          </Button>
          <div className="text-xs text-muted-foreground ml-2">
            Deterministic formula engine. Requires all gate assumptions to be approved.
          </div>
        </div>
      </Card>

      {/* Gatekeeper / blocked state */}
      {(blocked || (!recompute.isPending && !outputs.length && readiness.missing_required.length > 0)) && (
        <Alert variant="destructive">
          <Ban className="size-4" />
          <AlertTitle>UNDERWRITING BLOCKED</AlertTitle>
          <AlertDescription>
            <p className="mt-1">Agir does not fabricate financial inputs. Resolve the items below, then run underwriting again.</p>
            <div className="mt-3 grid md:grid-cols-2 gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-widest font-semibold mb-1">Missing required assumptions</div>
                <ul className="text-sm space-y-1">
                  {(blocked?.missing ?? readiness.missing_required).map((m) => <li key={m}>• {m}</li>)}
                  {!(blocked?.missing?.length || readiness.missing_required.length) && <li className="text-muted-foreground">None</li>}
                </ul>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest font-semibold mb-1">Conflicting required assumptions</div>
                <ul className="text-sm space-y-1">
                  {(blocked?.conflicting ?? readiness.conflicts.map((c: any) => c.label)).map((m) => <li key={m}>• {m}</li>)}
                  {!(blocked?.conflicting?.length || readiness.conflict_count) && <li className="text-muted-foreground">None</li>}
                </ul>
              </div>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Validation dashboard */}
      <Card className="p-5">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-3">Validation Dashboard</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <DashStat label="Required Coverage" value={`${readiness.required_pct}%`} sub={`${readiness.required_covered}/${readiness.required_total} approved`} />
          <DashStat label="Optional Coverage" value={`${readiness.optional_pct}%`} sub={`${readiness.optional_covered}/${readiness.optional_total} approved`} />
          <DashStat label="Conflicts" value={String(readiness.conflict_count)} sub={readiness.conflict_count ? "User review required" : "None"} tone={readiness.conflict_count ? "destructive" : undefined} />
          <DashStat label="Data Confidence" value={`${readiness.avg_confidence}%`} sub="Avg across extracted values" />
          <DashStat label="Assumptions Extracted" value={String(validation.assumptions_extracted)} />
          <DashStat label="Assumptions Missing" value={String(validation.assumptions_missing)} tone={validation.assumptions_missing ? "destructive" : undefined} />
          <DashStat label="Formulas Executed" value={String(validation.formulas_executed)} tone="success" />
          <DashStat label="Formulas Blocked" value={String(validation.formulas_blocked)} tone={validation.formulas_blocked ? "destructive" : undefined} />
        </div>
      </Card>

      {/* Headline metrics with formula audit */}
      {outputs.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <MetricCard label="Project Value" row={metric("exit_value")} assumptionLabel={assumptionLabel} assumptionValue={assumptionValue} />
          <MetricCard label="Stabilized NOI" row={metric("noi")} assumptionLabel={assumptionLabel} assumptionValue={assumptionValue} />
          <MetricCard label="DSCR" row={metric("dscr")} assumptionLabel={assumptionLabel} assumptionValue={assumptionValue} />
          <MetricCard label="Equity Required" row={metric("equity_required")} assumptionLabel={assumptionLabel} assumptionValue={assumptionValue} />
        </div>
      )}

      {/* Full metric table with scenarios */}
      {outputs.length > 0 && (
        <Card className="overflow-hidden">
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
                      <td className="text-right num text-primary">
                        {baseRow?.value_numeric == null
                          ? <span className="text-muted-foreground italic">Missing</span>
                          : fmtValue(Number(baseRow.value_numeric), baseRow.unit)}
                      </td>
                      {scenarioKeys.map((sk) => {
                        const r = byScenario[sk].find((b) => b.metric_key === mk);
                        return (
                          <td key={sk} className="text-right num">
                            {r?.value_numeric == null
                              ? <span className="text-muted-foreground italic">—</span>
                              : fmtValue(Number(r.value_numeric), r.unit)}
                          </td>
                        );
                      })}
                      <td className="text-xs text-muted-foreground font-mono">{baseRow?.formula_text}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Risk register */}
      <Card className="p-5">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-3">Risk Register</div>
        {risks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No automated flags. Risks are derived only from approved values — never fabricated.</p>
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

function DashStat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "success" | "destructive" }) {
  const color = tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : "text-primary";
  return (
    <div className="border border-border rounded p-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`num text-xl mt-1 ${color}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-1 font-mono">{sub}</div>}
    </div>
  );
}

function MetricCard({
  label, row, assumptionLabel, assumptionValue,
}: {
  label: string; row?: any;
  assumptionLabel: (k: string) => string;
  assumptionValue: (k: string) => any;
}) {
  const [open, setOpen] = useState(false);
  const blocked = !row || row.value_numeric == null;
  const inputs = (row?.inputs ?? {}) as Record<string, any>;
  const missing: string[] = Array.isArray(inputs._missing) ? inputs._missing : [];
  const citations: Record<string, any> = (inputs._citations ?? {}) as Record<string, any>;
  const inputKeys = Object.keys(inputs).filter((k) => !k.startsWith("_"));

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
          <div className={`num text-2xl mt-1 ${blocked ? "text-muted-foreground" : "text-primary"}`}>
            {blocked ? "Missing assumption" : fmtValue(Number(row.value_numeric), row.unit)}
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)} className="shrink-0">
          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />} Show calc
        </Button>
      </div>
      {open && (
        <div className="mt-3 border-t border-border pt-3 space-y-2 text-xs">
          <div><span className="font-semibold uppercase tracking-widest text-muted-foreground text-[10px]">Formula: </span><span className="font-mono">{row?.formula_text ?? "—"}</span></div>
          {blocked && missing.length > 0 && (
            <div>
              <span className="font-semibold uppercase tracking-widest text-destructive text-[10px]">Blocked — missing inputs: </span>
              <span>{missing.map((k) => assumptionLabel(k)).join(", ")}</span>
            </div>
          )}
          {inputKeys.length > 0 && (
            <div>
              <div className="font-semibold uppercase tracking-widest text-muted-foreground text-[10px] mb-1">Source assumptions</div>
              <ul className="space-y-1 font-mono">
                {inputKeys.map((k) => {
                  const c = citations[k];
                  return (
                    <li key={k} className="flex justify-between gap-4 border-b border-border/40 pb-1">
                      <span className="flex flex-col">
                        <span>{assumptionLabel(k)}</span>
                        {c?.source_document_name && (
                          <span className="text-[10px] text-muted-foreground font-sans">
                            from {c.source_document_name}{c.source_page_number ? ` · p${c.source_page_number}` : ""}
                            {c.confidence != null ? ` · ${c.confidence}% conf` : ""}
                          </span>
                        )}
                      </span>
                      <span className={inputs[k] == null ? "text-destructive" : ""}>{fmtInput(inputs[k])}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {!blocked && (
            <div>
              <span className="font-semibold uppercase tracking-widest text-success text-[10px]">Result: </span>
              <span className="font-mono">{fmtValue(Number(row.value_numeric), row.unit)}</span>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export function ICPanel({ projectId }: { projectId: string }) {
  const { data: decisions } = useSuspenseQuery(decisionsQ(projectId));
  const { data: readiness } = useSuspenseQuery(readinessQ(projectId));
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
      {!readiness.can_underwrite && (
        <Alert variant="destructive">
          <Ban className="size-4" />
          <AlertTitle>Decision blocked</AlertTitle>
          <AlertDescription>
            IC decisions require a clean underwriting pass. Resolve missing or conflicting required assumptions first.
          </AlertDescription>
        </Alert>
      )}
      <Card className="p-5 space-y-3">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">New IC decision</div>
        <div className="flex flex-wrap gap-2">
          <Button variant={decision === "approve" ? "default" : "outline"} onClick={() => setDecision("approve")}>Approve</Button>
          <Button variant={decision === "approve_with_conditions" ? "default" : "outline"} onClick={() => setDecision("approve_with_conditions")}>Approve with Conditions</Button>
          <Button variant={decision === "reject" ? "default" : "outline"} onClick={() => setDecision("reject")}>Reject</Button>
        </div>
        <Textarea rows={3} placeholder="Comment / rationale — cite approved assumptions and formula-driven metrics (IRR, DSCR, NOI)." value={rationale} onChange={(e) => setRationale(e.target.value)} />
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
