import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listDocuments, createDocument, deleteDocument, analyzeDocument, getDocumentUrl } from "@/lib/documents.functions";
import { listProjects } from "@/lib/projects.functions";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { FileText, Upload, Trash2, Sparkles, Download } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

const docsQ = queryOptions({ queryKey: ["documents", "all"], queryFn: () => listDocuments({ data: {} }) });
const projectsQ = queryOptions({ queryKey: ["projects"], queryFn: () => listProjects() });

const CATEGORIES = ["Appraisal","Budget","Site Plan","Financial Model","Market Study","Loan Package","Legal","Other"];

export const Route = createFileRoute("/_authenticated/documents")({
  head: () => ({ meta: [{ title: "Documents — Agir" }] }),
  loader: ({ context }) => Promise.all([
    context.queryClient.ensureQueryData(docsQ),
    context.queryClient.ensureQueryData(projectsQ),
  ]),
  component: DocumentsPage,
});

function DocumentsPage() {
  const { data: docs } = useSuspenseQuery(docsQ);
  const { data: projects } = useSuspenseQuery(projectsQ);
  const qc = useQueryClient();
  const createFn = useServerFn(createDocument);
  const delFn = useServerFn(deleteDocument);
  const analyzeFn = useServerFn(analyzeDocument);
  const urlFn = useServerFn(getDocumentUrl);
  const fileRef = useRef<HTMLInputElement>(null);
  const UNASSIGNED = "unassigned";
  const [projectId, setProjectId] = useState<string>(UNASSIGNED);
  const validProjects = projects.filter((p) => p?.id && String(p.id).trim() !== "");
  const [category, setCategory] = useState<string>("Other");
  const [uploading, setUploading] = useState(false);

  async function upload(file: File) {
    setUploading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not authenticated");
      const path = `${u.user.id}/${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from("documents").upload(path, file);
      if (error) throw error;
      await createFn({ data: {
        project_id: projectId && projectId !== UNASSIGNED ? projectId : null, name: file.name, file_type: file.type,
        category, storage_path: path, size_bytes: file.size,
      } });
      qc.invalidateQueries({ queryKey: ["documents", "all"] });
      toast.success("Uploaded");
    } catch (e: any) { toast.error(e.message); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["documents", "all"] }); toast.success("Deleted"); },
  });
  const analyze = useMutation({
    mutationFn: (d: any) => analyzeFn({ data: { id: d.id, name: d.name, category: d.category } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["documents", "all"] }); toast.success("AI analysis ready"); },
    onError: (e: Error) => toast.error(e.message),
  });

  async function download(id: string) {
    const { url } = await urlFn({ data: { id } });
    if (url) window.open(url, "_blank");
  }

  return (
    <>
      <PageHeader title="Documents" subtitle={`${docs.length} documents in vault`} />
      <div className="p-6 space-y-4">
        <Card className="p-5">
          <div className="grid md:grid-cols-4 gap-3 items-end">
            <div>
              <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Project</label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>— Unassigned —</SelectItem>
                  {validProjects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Category</label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <input ref={fileRef} type="file" className="hidden"
              accept=".pdf,.xlsx,.xls,.doc,.docx,.png,.jpg,.jpeg"
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            <Button onClick={() => fileRef.current?.click()} disabled={uploading} className="md:col-span-2">
              <Upload className="size-4 mr-2" />{uploading ? "Uploading…" : "Upload document"}
            </Button>
          </div>
        </Card>

        {docs.length === 0 ? (
          <Card className="p-12 text-center text-sm text-muted-foreground">No documents yet. PDF · Excel · Word · Images supported.</Card>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {docs.map((d) => (
              <Card key={d.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3 min-w-0">
                    <FileText className="size-5 text-primary shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{d.name}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{d.category || "—"} · {new Date(d.upload_date).toLocaleDateString()}</div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="size-7" onClick={() => download(d.id)}><Download className="size-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="size-7" onClick={() => del.mutate(d.id)}><Trash2 className="size-3.5" /></Button>
                  </div>
                </div>
                {d.ai_summary ? (
                  <div className="mt-3 space-y-2 text-xs">
                    <div><span className="text-primary font-semibold uppercase tracking-widest text-[10px]">Summary</span><p className="mt-1 text-muted-foreground">{d.ai_summary}</p></div>
                    {d.ai_risks && <div><span className="text-destructive font-semibold uppercase tracking-widest text-[10px]">Risks</span><p className="mt-1 text-muted-foreground">{d.ai_risks}</p></div>}
                  </div>
                ) : (
                  <Button size="sm" variant="outline" className="w-full mt-3" onClick={() => analyze.mutate(d)} disabled={analyze.isPending}>
                    <Sparkles className="size-3.5 mr-1" />Run AI analysis
                  </Button>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
