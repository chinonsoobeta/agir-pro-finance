// Assumption Review Center: project-scoped table with approve / modify /
// reject / needs-review actions, source panel, and version history drawer.

import { useState } from "react";
import { useSuspenseQuery, useMutation, useQueryClient, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAssumptions, listAssumptionVersions, reviewAssumption, extractAssumptions, recomputeOutputs, getReadiness } from "@/lib/assumptions.functions";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Check, X, Edit3, Eye, History, Sparkles, RefreshCw, AlertCircle } from "lucide-react";
import { toast } from "sonner";

const assumptionsQ = (pid: string) => queryOptions({ queryKey: ["assumptions", pid], queryFn: () => listAssumptions({ data: { project_id: pid } }) });
const readinessQ = (pid: string) => queryOptions({ queryKey: ["readiness", pid], queryFn: () => getReadiness({ data: { project_id: pid } }) });

const STATUS_STYLES: Record<string, string> = {
  approved: "bg-success/20 text-success border-success/30",
  modified: "bg-primary/20 text-primary border-primary/30",
  pending: "bg-chart-5/20 text-chart-5 border-chart-5/30",
  needs_review: "bg-chart-2/20 text-chart-2 border-chart-2/30",
  rejected: "bg-destructive/20 text-destructive border-destructive/30",
  missing: "bg-muted text-muted-foreground border-border",
  extracted: "bg-chart-1/20 text-chart-1 border-chart-1/30",
  conflicting: "bg-destructive/20 text-destructive border-destructive/30",
};
const BAND_STYLES: Record<string, string> = {
  high: "text-success", medium: "text-chart-5", low: "text-destructive", missing: "text-muted-foreground",
};

function fmt(a: any) {
  if (a.value_numeric == null && !a.value_text) return "—";
  if (a.value_text) return a.value_text;
  const n = Number(a.value_numeric);
  if (a.unit === "$") return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
  if (a.unit === "%") return `${n}%`;
  if (a.unit === "x") return `${n}x`;
  return `${n.toLocaleString()} ${a.unit ?? ""}`.trim();
}

export function AssumptionReviewCenter({ projectId }: { projectId: string }) {
  const { data: assumptions } = useSuspenseQuery(assumptionsQ(projectId));
  const { data: readiness } = useSuspenseQuery(readinessQ(projectId));
  const qc = useQueryClient();
  const extractFn = useServerFn(extractAssumptions);
  const recomputeFn = useServerFn(recomputeOutputs);
  const reviewFn = useServerFn(reviewAssumption);

  const [sourceOf, setSourceOf] = useState<any | null>(null);
  const [editOf, setEditOf] = useState<any | null>(null);
  const [historyOf, setHistoryOf] = useState<any | null>(null);
  const [report, setReport] = useState<any | null>(null);
  const confidenceCounts = assumptions.reduce(
    (acc, a) => {
      const band = a.confidence_band === "high" || a.confidence_band === "medium" || a.confidence_band === "low" || a.confidence_band === "missing"
        ? a.confidence_band
        : "missing";
      acc[band] += 1;
      return acc;
    },
    { high: 0, medium: 0, low: 0, missing: 0 },
  );

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["assumptions", projectId] });
    qc.invalidateQueries({ queryKey: ["readiness", projectId] });
    qc.invalidateQueries({ queryKey: ["outputs", projectId] });
    qc.invalidateQueries({ queryKey: ["risks", projectId] });
  };

  const extract = useMutation({
    mutationFn: () => extractFn({ data: { project_id: projectId } }),
    onSuccess: (r) => {
      invalidate();
      setReport(r);
      toast.success(`Pipeline complete — ${r.found} found · ${r.conflicting} conflicting · ${r.missing} missing`);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const recompute = useMutation({
    mutationFn: () => recomputeFn({ data: { project_id: projectId } }),
    onSuccess: () => { invalidate(); toast.success("Financial model recomputed"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const review = useMutation({
    mutationFn: (d: any) => reviewFn({ data: d }),
    onSuccess: () => { invalidate(); toast.success("Updated"); },
    onError: (e: Error) => toast.error(e.message),
  });

  // Group by category
  const grouped = assumptions.reduce<Record<string, any[]>>((acc, a) => {
    (acc[a.category || "Other"] ||= []).push(a); return acc;
  }, {});

  return (
    <div className="space-y-4">
      {/* Readiness header */}
      <Card className="p-5">
        <div className="grid md:grid-cols-5 gap-4 items-center">
          <div className="col-span-2">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Deal Readiness Score</div>
            <div className="flex items-baseline gap-3 mt-1">
              <div className="num text-4xl text-primary">{readiness.score}</div>
              <div className="text-xs text-muted-foreground">/ 100</div>
            </div>
            <div className="mt-2 h-1.5 bg-muted rounded overflow-hidden">
              <div className="h-full bg-primary" style={{ width: `${readiness.score}%` }} />
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Approved</div>
            <div className="num text-lg mt-1">{readiness.approved} / {readiness.total}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Avg Confidence</div>
            <div className="num text-lg mt-1">{readiness.avg_confidence}%</div>
          </div>
          <div className="flex flex-col gap-2">
            <Button size="sm" onClick={() => extract.mutate()} disabled={extract.isPending}>
              <Sparkles className="size-4 mr-1" />{extract.isPending ? "Extracting…" : "Run Extraction"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => recompute.mutate()} disabled={recompute.isPending}>
              <RefreshCw className="size-4 mr-1" />{recompute.isPending ? "Computing…" : "Recompute model"}
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4 text-sm">
          <Field label="Total Assumptions">{assumptions.length}</Field>
          <Field label="High Confidence">{confidenceCounts.high}</Field>
          <Field label="Medium Confidence">{confidenceCounts.medium}</Field>
          <Field label="Low Confidence">{confidenceCounts.low}</Field>
          <Field label="Missing">{confidenceCounts.missing}</Field>
        </div>
        {readiness.missing_required.length > 0 && (
          <div className="mt-4 flex items-start gap-2 text-xs text-chart-5 bg-chart-5/5 border border-chart-5/20 rounded p-3">
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold uppercase tracking-widest">Missing required assumptions</div>
              <div className="mt-1 text-muted-foreground">{readiness.missing_required.join(" · ")}</div>
            </div>
          </div>
        )}
      </Card>

      {report && <ExtractionReportCard report={report} onClose={() => setReport(null)} />}

      {assumptions.length === 0 ? (
        <Card className="p-12 text-center text-sm text-muted-foreground">
          No assumptions yet. Upload documents to this project, then click <strong>Run Extraction</strong>.
        </Card>
      ) : (
        Object.entries(grouped).map(([cat, rows]) => (
          <Card key={cat} className="overflow-hidden">
            <div className="px-4 py-2 border-b border-border bg-muted/20 text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">{cat}</div>
            <table className="data-grid w-full">
              <thead><tr className="bg-muted/10">
                <th className="text-left">Assumption</th>
                <th className="text-right">Value</th>
                <th className="text-left">Source</th>
                <th className="text-center">Confidence</th>
                <th className="text-center">Status</th>
                <th className="text-right">Impact</th>
                <th></th>
              </tr></thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id} className="hover:bg-accent/30">
                    <td className="font-medium">{a.field_label}</td>
                    <td className="text-right num">{fmt(a)}</td>
                    <td className="text-xs text-muted-foreground max-w-[200px] truncate">{a.source_location || "—"}</td>
                    <td className="text-center">
                      <span className={`text-xs font-mono ${BAND_STYLES[a.confidence_band]}`}>{a.confidence_score}% · {a.confidence_band}</span>
                    </td>
                    <td className="text-center">
                      <Badge variant="outline" className={`${STATUS_STYLES[a.status]} text-[10px] capitalize`}>{a.status.replace("_"," ")}</Badge>
                    </td>
                    <td className="text-right num text-xs text-muted-foreground">
                      {a.impact_rank ? `#${a.impact_rank}` : "—"}
                    </td>
                    <td className="text-right">
                      <div className="flex justify-end gap-0.5">
                        <Button variant="ghost" size="icon" className="size-7" title="View source" onClick={() => setSourceOf(a)}><Eye className="size-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="size-7" title="Modify" onClick={() => setEditOf(a)}><Edit3 className="size-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="size-7 text-success" title="Approve" disabled={a.status === "missing"}
                          onClick={() => review.mutate({ id: a.id, action: "approve", change_reason: "Approved as extracted" })}><Check className="size-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="size-7 text-destructive" title="Reject"
                          onClick={() => review.mutate({ id: a.id, action: "reject", change_reason: "Rejected" })}><X className="size-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="size-7" title="Version history" onClick={() => setHistoryOf(a)}><History className="size-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ))
      )}

      <SourcePanel a={sourceOf} onClose={() => setSourceOf(null)} />
      <EditPanel a={editOf} onClose={() => setEditOf(null)} onSubmit={(d) => { review.mutate(d); setEditOf(null); }} />
      <HistoryPanel a={historyOf} onClose={() => setHistoryOf(null)} />
    </div>
  );
}

function SourcePanel({ a, onClose }: { a: any | null; onClose: () => void }) {
  return (
    <Sheet open={!!a} onOpenChange={(o) => !o && onClose()}>
      <SheetContent>
        <SheetHeader><SheetTitle className="font-mono">{a?.field_label}</SheetTitle></SheetHeader>
        {a && (
          <div className="mt-4 space-y-4 text-sm">
            <Field label="Extracted value">{fmt(a)}</Field>
            <Field label="Source document">{a.source_location || "—"}</Field>
            <Field label="Confidence">{a.confidence_score}% — {a.confidence_band}</Field>
            <Field label="Source text">
              <blockquote className="text-xs italic text-muted-foreground border-l-2 border-primary pl-3 mt-1 whitespace-pre-wrap">
                {a.source_text || "—"}
              </blockquote>
            </Field>
            <Field label="AI reasoning">{a.ai_reasoning || "—"}</Field>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function EditPanel({ a, onClose, onSubmit }: { a: any | null; onClose: () => void; onSubmit: (d: any) => void }) {
  const [val, setVal] = useState("");
  const [reason, setReason] = useState("");
  return (
    <Dialog open={!!a} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Modify {a?.field_label}</DialogTitle></DialogHeader>
        {a && (
          <form onSubmit={(e) => {
            e.preventDefault();
            const num = Number(val);
            onSubmit({
              id: a.id, action: "modify",
              value_numeric: isFinite(num) && a.unit !== "text" ? num : null,
              value_text: a.unit === "text" ? val : null,
              change_reason: reason || "Manual update",
            });
          }} className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Current: {fmt(a)}</label>
              <Input autoFocus placeholder={`New value (${a.unit})`} value={val} onChange={(e) => setVal(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Change reason</label>
              <Textarea rows={2} placeholder="e.g. Lender confirmed 6.25%" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
              <Button type="submit">Save & approve</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function HistoryPanel({ a, onClose }: { a: any | null; onClose: () => void }) {
  return (
    <Sheet open={!!a} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-[500px] sm:max-w-[500px]">
        <SheetHeader><SheetTitle className="font-mono">{a?.field_label} — versions</SheetTitle></SheetHeader>
        {a && <VersionsList assumptionId={a.id} />}
      </SheetContent>
    </Sheet>
  );
}

function VersionsList({ assumptionId }: { assumptionId: string }) {
  const fn = useServerFn(listAssumptionVersions);
  const { data: versions = [] } = useSuspenseQuery(queryOptions({
    queryKey: ["versions", assumptionId],
    queryFn: () => fn({ data: { assumption_id: assumptionId } }),
  }));
  if (!versions.length) return <p className="mt-4 text-sm text-muted-foreground">No version history.</p>;
  return (
    <ol className="mt-4 space-y-3">
      {versions.map((v: any) => (
        <li key={v.id} className="border-l-2 border-primary/40 pl-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-mono text-primary">v{v.version_number}</span>
            <Badge variant="outline" className={`${STATUS_STYLES[v.status]} text-[10px] capitalize`}>{v.status.replace("_"," ")}</Badge>
            <span className="text-muted-foreground">{new Date(v.created_at).toLocaleString()}</span>
          </div>
          <div className="num text-sm mt-1">{v.value_numeric ?? v.value_text ?? "—"}</div>
          <div className="text-muted-foreground mt-0.5">by {v.changed_by_name || "user"} · {v.change_reason || "—"}</div>
        </li>
      ))}
    </ol>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}
