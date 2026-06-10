import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { listProjects, createProject, deleteProject } from "@/lib/projects.functions";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { computeMetrics, fmtCompact, fmtPct } from "@/lib/finance";

const projectsQ = queryOptions({ queryKey: ["projects"], queryFn: () => listProjects() });

export const Route = createFileRoute("/_authenticated/projects")({
  head: () => ({ meta: [{ title: "Projects — Agir" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(projectsQ),
  component: ProjectsPage,
});

const STATUS_VARIANT: Record<string, string> = {
  pipeline: "bg-chart-2/20 text-chart-2 border-chart-2/30",
  underwriting: "bg-chart-5/20 text-chart-5 border-chart-5/30",
  approved: "bg-primary/20 text-primary border-primary/30",
  active: "bg-success/20 text-success border-success/30",
  completed: "bg-muted text-muted-foreground border-border",
  cancelled: "bg-destructive/20 text-destructive border-destructive/30",
};

function ProjectsPage() {
  const { data: projects } = useSuspenseQuery(projectsQ);
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const createFn = useServerFn(createProject);
  const delFn = useServerFn(deleteProject);

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["projects"] }); toast.success("Project deleted"); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader title="Projects" subtitle={`${projects.length} total`}
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button size="sm"><Plus className="size-4 mr-1" /> New project</Button></DialogTrigger>
            <NewProjectDialog onClose={() => setOpen(false)} createFn={createFn} />
          </Dialog>
        } />
      <div className="p-6">
        {projects.length === 0 ? (
          <Card className="p-12 text-center">
            <p className="text-sm text-muted-foreground">No projects yet. Create your first deal to begin underwriting.</p>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <table className="data-grid w-full">
              <thead><tr className="bg-muted/30">
                <th className="text-left">Project</th>
                <th className="text-left">Status</th>
                <th className="text-left">Type</th>
                <th className="text-right">Total Cost</th>
                <th className="text-right">Revenue</th>
                <th className="text-right">Margin</th>
                <th className="text-right">IRR</th>
                <th></th>
              </tr></thead>
              <tbody>
                {projects.map((p) => {
                  const m = computeMetrics({
                    acquisition_cost: +p.acquisition_cost, construction_cost: +p.construction_cost,
                    revenue_forecast: +p.revenue_forecast, debt_amount: +p.debt_amount,
                    equity_amount: +p.equity_amount, interest_rate: +p.interest_rate,
                  });
                  return (
                    <tr key={p.id} className="hover:bg-accent/30 transition-colors">
                      <td>
                        <Link to="/projects/$id" params={{ id: p.id }} className="font-medium hover:text-primary">{p.name}</Link>
                        <div className="text-[11px] text-muted-foreground">{p.location || "—"}</div>
                      </td>
                      <td><Badge variant="outline" className={`${STATUS_VARIANT[p.status]} capitalize text-[10px]`}>{p.status}</Badge></td>
                      <td className="capitalize text-muted-foreground">{p.type.replace("_"," ")}</td>
                      <td className="text-right num">{fmtCompact(m.totalCost)}</td>
                      <td className="text-right num">{fmtCompact(m.projectedRevenue)}</td>
                      <td className={`text-right num ${m.profitMargin >= 0 ? "text-success" : "text-destructive"}`}>{fmtPct(m.profitMargin)}</td>
                      <td className="text-right num text-primary">{fmtPct(m.irr)}</td>
                      <td className="text-right">
                        <Button variant="ghost" size="icon" className="size-7" onClick={() => { if (confirm(`Delete ${p.name}?`)) del.mutate(p.id); }}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </>
  );
}

function NewProjectDialog({ onClose, createFn }: { onClose: () => void; createFn: any }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: "", location: "", type: "multifamily", status: "pipeline",
    acquisition_cost: 0, construction_cost: 0, revenue_forecast: 0,
    debt_amount: 0, equity_amount: 0, interest_rate: 0,
    start_date: "", completion_date: "", notes: "",
  });
  const create = useMutation({
    mutationFn: (data: any) => createFn({ data }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["projects"] }); toast.success("Project created"); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const num = (v: string) => Number(v) || 0;
  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader><DialogTitle>New project</DialogTitle></DialogHeader>
      <form onSubmit={(e) => { e.preventDefault();
        create.mutate({ ...form,
          start_date: form.start_date || null, completion_date: form.completion_date || null }); }}>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label>Name</Label><Input required value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} /></div>
          <div><Label>Location</Label><Input value={form.location} onChange={(e) => setForm({...form, location: e.target.value})} /></div>
          <div><Label>Type</Label>
            <Select value={form.type} onValueChange={(v) => setForm({...form, type: v})}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["multifamily","commercial","mixed_use","land","industrial","retail","office","other"].map((t) =>
                  <SelectItem key={t} value={t} className="capitalize">{t.replace("_"," ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm({...form, status: v})}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["pipeline","underwriting","approved","active","completed","cancelled"].map((s) =>
                  <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>Acquisition Cost</Label><Input type="number" value={form.acquisition_cost} onChange={(e) => setForm({...form, acquisition_cost: num(e.target.value)})} /></div>
          <div><Label>Construction Cost</Label><Input type="number" value={form.construction_cost} onChange={(e) => setForm({...form, construction_cost: num(e.target.value)})} /></div>
          <div><Label>Revenue Forecast</Label><Input type="number" value={form.revenue_forecast} onChange={(e) => setForm({...form, revenue_forecast: num(e.target.value)})} /></div>
          <div><Label>Debt Amount</Label><Input type="number" value={form.debt_amount} onChange={(e) => setForm({...form, debt_amount: num(e.target.value)})} /></div>
          <div><Label>Equity Amount</Label><Input type="number" value={form.equity_amount} onChange={(e) => setForm({...form, equity_amount: num(e.target.value)})} /></div>
          <div><Label>Interest Rate %</Label><Input type="number" step="0.01" value={form.interest_rate} onChange={(e) => setForm({...form, interest_rate: num(e.target.value)})} /></div>
          <div><Label>Start Date</Label><Input type="date" value={form.start_date} onChange={(e) => setForm({...form, start_date: e.target.value})} /></div>
          <div><Label>Completion Date</Label><Input type="date" value={form.completion_date} onChange={(e) => setForm({...form, completion_date: e.target.value})} /></div>
          <div className="col-span-2"><Label>Notes</Label><Textarea rows={3} value={form.notes} onChange={(e) => setForm({...form, notes: e.target.value})} /></div>
        </div>
        <DialogFooter className="mt-4">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={create.isPending}>{create.isPending ? "Creating…" : "Create project"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
