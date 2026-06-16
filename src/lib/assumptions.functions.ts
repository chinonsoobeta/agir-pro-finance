// The Assumption Engine — extraction, classification, reconciliation,
// validation, deterministic compute, decision logging, audit trail.
//
// PHASE 1 (this file): canonical taxonomy, candidate persistence,
//   AI + alias classification, conflict detection, validation report,
//   reconciliation API. Deterministic finance engine kept functional
//   with renamed taxonomy keys; the full rewrite ships in Phase 2.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  ASSUMPTION_DEFS, ASSUMPTION_BY_KEY, ASSUMPTION_KEYS, REQUIRED_KEYS,
  resolveAlias, bandFor,
} from "./assumption-taxonomy";
import { getValidationReport } from "./validation";

// ============================ Read APIs ============================

export const listAssumptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { project_id: string }) => z.object({ project_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("assumptions")
      .select("*, documents:source_document_id(name)")
      .eq("project_id", data.project_id)
      .order("category", { ascending: true })
      .order("field_label", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listAssumptionVersions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { assumption_id: string }) => z.object({ assumption_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("assumption_versions").select("*").eq("assumption_id", data.assumption_id)
      .order("version_number", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listFinancialOutputs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { project_id: string }) => z.object({ project_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("financial_outputs").select("*").eq("project_id", data.project_id)
      .order("scenario_key").order("metric_key");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listRisks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { project_id: string }) => z.object({ project_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("risk_register").select("*").eq("project_id", data.project_id)
      .order("severity", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listDecisions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { project_id: string }) => z.object({ project_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("decision_logs").select("*").eq("project_id", data.project_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { project_id: string }) => z.object({ project_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("audit_logs").select("*").eq("project_id", data.project_id)
      .order("created_at", { ascending: false }).limit(200);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listAssumptionsAcrossProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("assumptions").select("*, projects:project_id(name)")
      .order("status", { ascending: true }).order("confidence_score", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listCandidates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { project_id: string }) => z.object({ project_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("assumption_candidates")
      .select("*")
      .eq("project_id", data.project_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const listConflicts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { project_id: string }) => z.object({ project_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("assumption_conflicts").select("*")
      .eq("project_id", data.project_id)
      .order("status", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getValidation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { project_id: string }) => z.object({ project_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const [{ data: assumptions }, { data: conflicts }] = await Promise.all([
      context.supabase.from("assumptions")
        .select("field_key,status,confidence_score,source_document_id,source_page_number")
        .eq("project_id", data.project_id),
      context.supabase.from("assumption_conflicts")
        .select("canonical_key,status").eq("project_id", data.project_id),
    ]);
    return getValidationReport(assumptions ?? [], conflicts ?? []);
  });

// ============================ Helpers ============================

async function auditLog(ctx: any, projectId: string | null, entityType: string, entityId: string | null, action: string, payload: unknown) {
  await ctx.supabase.from("audit_logs").insert({
    project_id: projectId, owner_id: ctx.userId, user_id: ctx.userId,
    entity_type: entityType, entity_id: entityId, action, payload: payload as object,
  });
}

async function userName(ctx: any) {
  const { data } = await ctx.supabase.from("profiles").select("full_name,email").eq("id", ctx.userId).maybeSingle();
  return data?.full_name || data?.email || "user";
}

async function recordVersion(ctx: any, a: any, changeReason: string, by: string) {
  await ctx.supabase.from("assumption_versions").insert({
    assumption_id: a.id, owner_id: ctx.userId, version_number: a.current_version,
    value_numeric: a.value_numeric, value_text: a.value_text, status: a.status,
    confidence_score: a.confidence_score, confidence_band: a.confidence_band,
    source_document_id: a.source_document_id, source_text: a.source_text,
    changed_by: ctx.userId, changed_by_name: by, change_reason: changeReason,
  });
}

// ============== Extraction pipeline (Engines 1 → 2 → 3 → 4) =========

const ClassificationSchema = z.object({
  candidate_index: z.number().int(),
  field_key: z.string(),
  confidence_score: z.number().min(0).max(100),
  reasoning: z.string().optional(),
});

export const extractAssumptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { project_id: string }) => z.object({ project_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const { data: docs, error: dErr } = await context.supabase
      .from("documents").select("*").eq("project_id", data.project_id);
    if (dErr) throw new Error(dErr.message);
    if (!docs?.length) throw new Error("Upload documents to this project before extracting assumptions.");

    // ===== Engine 1 — Document Intelligence =====
    const { parseDocument } = await import("./document-text.server");
    const candidatesMod = await import("./assumption-candidates.server");
    const { extractCandidatesFromDoc } = candidatesMod;
    type Candidate = ReturnType<typeof extractCandidatesFromDoc>[number];
    const docById = new Map(docs.map((d) => [d.id, d]));
    const allCandidates: Candidate[] = [];
    for (const d of docs) {
      try {
        const dl = await context.supabase.storage.from("documents").download(d.storage_path);
        if (dl.error || !dl.data) continue;
        const buf = await dl.data.arrayBuffer();
        const parsed = await parseDocument(d.name, d.file_type, buf);
        const cands = extractCandidatesFromDoc({ id: d.id, name: d.name }, parsed);
        allCandidates.push(...cands);
      } catch { /* skip unreadable */ }
    }
    if (!allCandidates.length) {
      throw new Error("No extractable values found in uploaded documents.");
    }

    // Persist candidates — clear previous ones for this project first.
    await context.supabase.from("assumption_candidates").delete().eq("project_id", data.project_id);
    const candRows = allCandidates.map((c) => ({
      project_id: data.project_id, owner_id: context.userId,
      document_id: c.document_id, document_name: c.document_name,
      page_number: c.page_number, source_type: c.source_type,
      kind: c.kind, value_numeric: c.value_numeric, value_text: c.value_text,
      unit: c.unit, source_text: c.source_text, source_context: c.source_context,
      label_hint: c.label_hint, confidence: c.confidence,
      classification_status: "unclassified",
    }));
    const { data: insertedCands, error: cErr } = await context.supabase
      .from("assumption_candidates").insert(candRows).select("id");
    if (cErr) throw new Error(`Failed to persist candidates: ${cErr.message}`);
    const candidateIds = (insertedCands ?? []).map((r: any) => r.id);

    // ===== Engine 2 — AI Classification =====
    const taxonomyText = ASSUMPTION_DEFS.map(
      (d) => `- ${d.key} (${d.label}, unit ${d.unit}${d.required ? ", REQUIRED" : ""}) aliases: ${d.aliases.slice(0, 6).join(" / ")}`
    ).join("\n");
    const cap = Math.min(allCandidates.length, 220);
    const candidateList = allCandidates.slice(0, cap).map((c, i) =>
      `${i}. [${c.kind}] value=${c.value_text} ctx="${c.source_context.slice(0, 220)}" hint="${c.label_hint.slice(0, 80)}" doc="${c.document_name}" p${c.page_number}`
    ).join("\n");

    const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
    const { generateText } = await import("ai");
    const gateway = createLovableAiGatewayProvider(key);
    let classifications: z.infer<typeof ClassificationSchema>[] = [];
    try {
      const { text } = await generateText({
        model: gateway("google/gemini-3-flash-preview"),
        system: `You are an institutional real estate underwriter. Classify pre-extracted numeric candidates from project documents into canonical assumption keys. Use ONLY the candidate context to decide; never invent values. If a candidate clearly does not match any canonical assumption, use field_key="ignore".`,
        prompt: `Canonical assumption taxonomy:\n${taxonomyText}\n\nCandidates (index. [kind] value ctx hint doc page):\n${candidateList}\n\nReturn a single JSON array (no prose, no markdown fences). One entry per candidate you classify. Schema: {"candidate_index":<int>,"field_key":"<taxonomy key or ignore>","confidence_score":<0-100>,"reasoning":"<short>"}. Skip candidates you cannot confidently classify.`,
      });
      const m = text.match(/\[[\s\S]*\]/);
      const parsed = m ? JSON.parse(m[0]) : [];
      const safe = z.array(ClassificationSchema).safeParse(parsed);
      if (safe.success) classifications = safe.data.filter((c) => c.field_key === "ignore" || ASSUMPTION_KEYS.includes(c.field_key));
    } catch {
      classifications = [];
    }

    // ===== Engine 3 — Alias-based fallback =====
    type Mapped = {
      candidate_index: number;
      candidate_id: string;
      field_key: string;
      confidence_score: number;
      via: "ai" | "alias";
      reasoning: string;
    };
    const mapped: Mapped[] = [];
    const aiCandidateIndices = new Set<number>();

    for (const cls of classifications) {
      const cand = allCandidates[cls.candidate_index];
      const cid = candidateIds[cls.candidate_index];
      if (!cand || !cid) continue;
      aiCandidateIndices.add(cls.candidate_index);
      if (cls.field_key === "ignore") continue;
      const def = ASSUMPTION_BY_KEY[cls.field_key];
      if (!def) continue;
      // Numeric defs need a numeric value
      if (def.numeric && cand.value_numeric == null) continue;
      mapped.push({
        candidate_index: cls.candidate_index,
        candidate_id: cid,
        field_key: def.key,
        confidence_score: Math.round(cls.confidence_score),
        via: "ai",
        reasoning: cls.reasoning || "AI-classified candidate",
      });
    }

    let inferredCount = 0;
    for (let i = 0; i < allCandidates.length; i++) {
      if (aiCandidateIndices.has(i)) continue;
      const cand = allCandidates[i];
      const cid = candidateIds[i];
      const fk = resolveAlias(cand.label_hint);
      if (!fk || !cid) continue;
      const def = ASSUMPTION_BY_KEY[fk];
      if (!def) continue;
      if (def.numeric && cand.value_numeric == null) continue;
      // Loose unit sanity
      if (def.unit === "%" && cand.kind !== "percent") continue;
      if (def.unit === "$" && cand.kind !== "currency") continue;
      if (def.unit === "SF" && cand.kind !== "sf") continue;
      if (def.unit === "units" && cand.kind !== "units") continue;
      mapped.push({
        candidate_index: i,
        candidate_id: cid,
        field_key: def.key,
        confidence_score: 55,
        via: "alias",
        reasoning: `Alias-matched "${cand.label_hint.slice(-40)}" → ${def.label}`,
      });
      inferredCount++;
    }

    // Persist classification on each candidate row.
    for (const m of mapped) {
      await context.supabase.from("assumption_candidates").update({
        canonical_key: m.field_key,
        classification_status: "classified",
        confidence: m.confidence_score,
      }).eq("id", m.candidate_id);
    }

    // ===== Engine 4 — Reconciliation =====
    // Group by canonical key. If multiple distinct numeric values exist,
    // create a conflict and DO NOT pick a winner. Otherwise upsert the
    // canonical assumption row in "extracted" status.

    const grouped = new Map<string, Mapped[]>();
    for (const m of mapped) {
      const arr = grouped.get(m.field_key) ?? [];
      arr.push(m);
      grouped.set(m.field_key, arr);
    }

    const { data: existing } = await context.supabase
      .from("assumptions").select("*").eq("project_id", data.project_id);
    const existingByKey = new Map((existing ?? []).map((a) => [a.field_key, a]));
    const by = await userName(context);

    // Clear previous open conflicts before recomputing.
    await context.supabase.from("assumption_conflicts")
      .delete().eq("project_id", data.project_id).eq("status", "open");

    const conflictKeys: string[] = [];
    const foundKeys: string[] = [];
    const missingKeys: string[] = [];

    for (const [fk, arr] of grouped.entries()) {
      const def = ASSUMPTION_BY_KEY[fk];
      arr.sort((a, b) => b.confidence_score - a.confidence_score);
      const distinct = Array.from(new Set(arr.map((m) => {
        const c = allCandidates[m.candidate_index];
        return c.value_numeric != null ? Math.round(c.value_numeric * 1000) / 1000 : c.value_text;
      })));

      const isConflict = distinct.length > 1;

      if (isConflict) {
        conflictKeys.push(fk);
        await context.supabase.from("assumption_conflicts").upsert({
          project_id: data.project_id, owner_id: context.userId,
          canonical_key: fk, field_label: def.label, status: "open",
          candidate_ids: arr.map((m) => m.candidate_id),
        }, { onConflict: "project_id,canonical_key" });

        // Mark the assumption row as conflicting (value=null until user resolves).
        const payload = {
          project_id: data.project_id, owner_id: context.userId,
          field_key: def.key, field_label: def.label,
          category: def.category, unit: def.unit,
          value_numeric: null, value_text: null,
          status: "conflicting" as const,
          confidence_score: 0, confidence_band: "missing" as const,
          source_document_id: null, source_text: null, source_page_number: null,
          ai_reasoning: `Conflict: ${distinct.length} distinct values across documents. Resolve in Reconciliation tab.`,
        };
        const prev = existingByKey.get(fk);
        if (prev) {
          await context.supabase.from("assumptions").update({
            ...payload, current_version: prev.current_version + 1, version: prev.current_version + 1,
          }).eq("id", prev.id);
        } else {
          await context.supabase.from("assumptions").insert(payload);
        }
        continue;
      }

      foundKeys.push(fk);
      const winner = arr[0];
      const cand = allCandidates[winner.candidate_index];
      const srcDoc = docById.get(cand.document_id);
      const payload = {
        project_id: data.project_id, owner_id: context.userId,
        field_key: def.key, field_label: def.label,
        category: def.category, unit: def.unit,
        value_numeric: def.numeric ? cand.value_numeric : null,
        value_text: def.numeric ? null : cand.value_text,
        status: "extracted" as const,
        confidence_score: winner.confidence_score,
        confidence_band: bandFor(winner.confidence_score),
        source_document_id: srcDoc?.id ?? null,
        source_location: srcDoc?.name ?? null,
        source_text: cand.source_context,
        source_page_number: cand.page_number,
        ai_reasoning: `${winner.via === "alias" ? "Alias-mapped" : "AI-classified"}: ${winner.reasoning}`,
      };
      const prev = existingByKey.get(fk);
      if (prev) {
        const { data: upd } = await context.supabase.from("assumptions").update({
          ...payload, current_version: prev.current_version + 1, version: prev.current_version + 1,
        }).eq("id", prev.id).select().single();
        if (upd) await recordVersion(context, upd, "Re-extracted", "Extraction Pipeline");
      } else {
        const { data: ins } = await context.supabase.from("assumptions").insert(payload).select().single();
        if (ins) await recordVersion(context, ins, "Initial extraction", "Extraction Pipeline");
      }
    }

    // Missing placeholders for every taxonomy key not found
    for (const def of ASSUMPTION_DEFS) {
      if (grouped.has(def.key) || existingByKey.has(def.key)) continue;
      missingKeys.push(def.key);
      const { data: ins } = await context.supabase.from("assumptions").insert({
        project_id: data.project_id, owner_id: context.userId,
        field_key: def.key, field_label: def.label,
        category: def.category, unit: def.unit,
        status: "missing", confidence_score: 0, confidence_band: "missing",
        ai_reasoning: "Not found in any document. Provide manually or upload more docs.",
      }).select().single();
      if (ins) await recordVersion(context, ins, "Created as missing", "Extraction Pipeline");
    }

    const missingRequired = REQUIRED_KEYS.filter((k) =>
      missingKeys.includes(k) || existingByKey.get(k)?.status === "missing"
    );

    const report = {
      stage1_candidates: allCandidates.length,
      stage2_classified: classifications.filter((c) => c.field_key !== "ignore").length,
      stage3_inferred_via_alias: inferredCount,
      found: foundKeys.length,
      conflicting: conflictKeys.length,
      missing: missingKeys.length,
      missing_required: missingRequired.map((k) => ASSUMPTION_BY_KEY[k]?.label ?? k),
      conflicts: conflictKeys.map((k) => ASSUMPTION_BY_KEY[k]?.label ?? k),
      can_underwrite: missingRequired.length === 0 && conflictKeys.length === 0,
    };

    await auditLog(context, data.project_id, "project", data.project_id, "extract_assumptions", report);
    void by;
    return report;
  });

// =================== Reconciliation API (Engine 4) ===================

export const resolveConflict = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    conflict_id: z.string().uuid(),
    chosen_candidate_id: z.string().uuid(),
    note: z.string().max(2000).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: conflict, error: cErr } = await context.supabase
      .from("assumption_conflicts").select("*").eq("id", data.conflict_id).single();
    if (cErr || !conflict) throw new Error(cErr?.message || "Conflict not found");

    const { data: cand, error: caErr } = await context.supabase
      .from("assumption_candidates").select("*").eq("id", data.chosen_candidate_id).single();
    if (caErr || !cand) throw new Error(caErr?.message || "Candidate not found");

    const def = ASSUMPTION_BY_KEY[conflict.canonical_key];
    if (!def) throw new Error(`Unknown canonical key ${conflict.canonical_key}`);

    // Promote the chosen candidate to the canonical assumption.
    const { data: existing } = await context.supabase
      .from("assumptions").select("*")
      .eq("project_id", conflict.project_id)
      .eq("field_key", def.key)
      .maybeSingle();

    const payload = {
      project_id: conflict.project_id, owner_id: context.userId,
      field_key: def.key, field_label: def.label,
      category: def.category, unit: def.unit,
      value_numeric: def.numeric ? cand.value_numeric : null,
      value_text: def.numeric ? null : cand.value_text,
      status: "extracted" as const,
      confidence_score: Math.max(cand.confidence ?? 60, 60),
      confidence_band: bandFor(cand.confidence ?? 60),
      source_document_id: cand.document_id,
      source_location: cand.document_name,
      source_page_number: cand.page_number,
      source_text: cand.source_context,
      ai_reasoning: `Conflict resolved by user — chose value from ${cand.document_name} p${cand.page_number}. ${data.note ?? ""}`.trim(),
    };

    if (existing) {
      await context.supabase.from("assumptions").update({
        ...payload, current_version: existing.current_version + 1, version: existing.current_version + 1,
      }).eq("id", existing.id);
    } else {
      await context.supabase.from("assumptions").insert(payload);
    }

    await context.supabase.from("assumption_conflicts").update({
      status: "resolved",
      resolution_candidate_id: data.chosen_candidate_id,
      resolution_value_numeric: cand.value_numeric,
      resolution_value_text: cand.value_text,
      resolution_note: data.note ?? null,
      resolved_by: context.userId,
      resolved_at: new Date().toISOString(),
    }).eq("id", data.conflict_id);

    await auditLog(context, conflict.project_id, "conflict", data.conflict_id, "conflict_resolved", {
      canonical_key: def.key, chosen_value: cand.value_numeric ?? cand.value_text,
      source_doc: cand.document_name, source_page: cand.page_number,
    });

    return { ok: true };
  });

export const dismissConflict = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    conflict_id: z.string().uuid(),
    note: z.string().max(2000).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await context.supabase.from("assumption_conflicts").update({
      status: "dismissed", resolution_note: data.note ?? null,
      resolved_by: context.userId, resolved_at: new Date().toISOString(),
    }).eq("id", data.conflict_id);
    return { ok: true };
  });

// =================== Approval workflow ===================

const UpdateSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["approve", "modify", "reject", "needs_review"]),
  value_numeric: z.number().nullable().optional(),
  value_text: z.string().nullable().optional(),
  change_reason: z.string().max(1000).optional(),
});

export const reviewAssumption = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: cur, error } = await context.supabase
      .from("assumptions").select("*").eq("id", data.id).single();
    if (error) throw new Error(error.message);
    const by = await userName(context);
    const newVer = cur.current_version + 1;
    const patch: any = { current_version: newVer, version: newVer, reviewer_id: context.userId };
    if (data.action === "approve") {
      patch.status = "approved";
      patch.approved_by = context.userId;
      patch.approved_at = new Date().toISOString();
    } else if (data.action === "modify") {
      patch.status = "approved";
      patch.value_numeric = data.value_numeric ?? cur.value_numeric;
      patch.value_text = data.value_text ?? cur.value_text;
      patch.approved_by = context.userId;
      patch.approved_at = new Date().toISOString();
      patch.confidence_score = 100;
      patch.confidence_band = "high";
    } else if (data.action === "reject") {
      patch.status = "rejected";
    } else {
      patch.status = "needs_review";
    }
    const { data: upd, error: uErr } = await context.supabase.from("assumptions").update(patch).eq("id", data.id).select().single();
    if (uErr) throw new Error(uErr.message);
    await recordVersion(context, upd, data.change_reason || `Status set to ${upd.status} by ${by}`, by);
    await auditLog(context, cur.project_id, "assumption", cur.id, `assumption_${data.action}`, {
      from: { value_numeric: cur.value_numeric, value_text: cur.value_text, status: cur.status },
      to: { value_numeric: upd.value_numeric, value_text: upd.value_text, status: upd.status },
      reason: data.change_reason ?? null,
    });
    return upd;
  });

// =================== Deterministic Finance Engine (Phase 1 stub) ===================
// NOTE: Phase 2 rewrites this engine end-to-end against the new taxonomy.
// For now we keep a minimal deterministic engine so existing tabs do not crash.
// Required keys per the new taxonomy:
//   land_cost, hard_costs, soft_costs, debt_amount, equity_amount,
//   interest_rate, occupancy, expense_ratio, exit_cap_rate, hold_period.

type ApprovedMap = Record<string, number | null>;
const num = (m: ApprovedMap, k: string) => (typeof m[k] === "number" && !isNaN(m[k] as number) ? (m[k] as number) : null);
const NUM = (...xs: Array<number | null>): number[] | null => {
  const out: number[] = [];
  for (const x of xs) { if (x == null) return null; out.push(x); }
  return out;
};

type MetricSpec = {
  key: string; label: string; unit: string; formula: string;
  required: string[];
  compute: (m: ApprovedMap, d: Record<string, number | null>) => number | null;
};

const METRIC_SPECS: MetricSpec[] = [
  { key: "total_project_cost", label: "Total Project Cost", unit: "$",
    formula: "land_cost + hard_costs + soft_costs + financing_costs + contingency",
    required: ["land_cost", "hard_costs", "soft_costs"],
    compute: (m) => {
      const xs = NUM(num(m, "land_cost"), num(m, "hard_costs"), num(m, "soft_costs"));
      if (!xs) return null;
      return xs[0] + xs[1] + xs[2] + (num(m, "financing_costs") ?? 0) + (num(m, "contingency") ?? 0);
    } },
  { key: "gpr", label: "Gross Potential Rent (Yr 1)", unit: "$",
    formula: "unit_count × average_rent × 12",
    required: ["unit_count", "average_rent"],
    compute: (m) => {
      const xs = NUM(num(m, "unit_count"), num(m, "average_rent"));
      return xs ? xs[0] * xs[1] * 12 : null;
    } },
  { key: "noi", label: "Stabilized NOI", unit: "$",
    formula: "gpr × occupancy × (1 − expense_ratio)",
    required: ["occupancy", "expense_ratio"],
    compute: (_m, d) => {
      const xs = NUM(d.gpr, d.occupancy, d.expense_ratio);
      return xs ? xs[0] * xs[1] * (1 - xs[2]) : null;
    } },
  { key: "exit_value", label: "Exit Value", unit: "$",
    formula: "noi ÷ exit_cap_rate",
    required: ["exit_cap_rate"],
    compute: (_m, d) => (d.noi != null && d.exit_cap != null && d.exit_cap > 0 ? d.noi / d.exit_cap : null) },
  { key: "ltc", label: "Loan-to-Cost", unit: "%",
    formula: "debt_amount ÷ total_project_cost",
    required: ["debt_amount"],
    compute: (_m, d) => (d.debt != null && d.total_cost != null && d.total_cost > 0 ? (d.debt / d.total_cost) * 100 : null) },
  { key: "dscr", label: "Stabilized DSCR", unit: "x",
    formula: "noi ÷ annual_debt_service",
    required: ["debt_amount", "interest_rate"],
    compute: (_m, d) => (d.noi != null && d.ads != null && d.ads > 0 ? d.noi / d.ads : null) },
  { key: "equity_required", label: "Equity Required", unit: "$",
    formula: "equity_amount (or total_project_cost − debt_amount)",
    required: ["equity_amount"],
    compute: (m, d) => {
      const eq = num(m, "equity_amount");
      if (eq != null) return eq;
      const xs = NUM(d.total_cost, d.debt);
      return xs ? Math.max(xs[0] - xs[1], 0) : null;
    } },
  { key: "yield_on_cost", label: "Yield on Cost", unit: "%",
    formula: "noi ÷ total_project_cost",
    required: [],
    compute: (_m, d) => (d.noi != null && d.total_cost != null && d.total_cost > 0 ? (d.noi / d.total_cost) * 100 : null) },
  { key: "profit", label: "Profit", unit: "$",
    formula: "exit_value − total_project_cost",
    required: [],
    compute: (_m, d) => (d.exit_value != null && d.total_cost != null ? d.exit_value - d.total_cost : null) },
  { key: "margin", label: "Profit Margin", unit: "%",
    formula: "profit ÷ exit_value",
    required: [],
    compute: (_m, d) => (d.profit != null && d.exit_value != null && d.exit_value > 0 ? (d.profit / d.exit_value) * 100 : null) },
];

function annualDebtService(m: ApprovedMap): number | null {
  const debt = num(m, "debt_amount");
  const rate = num(m, "interest_rate");
  if (debt == null || rate == null) return null;
  const amort = num(m, "amortization") ?? 30;
  const r = rate / 100 / 12;
  const N = amort * 12;
  if (r <= 0 || N <= 0) return debt / amort;
  return ((debt * r) / (1 - Math.pow(1 + r, -N))) * 12;
}

function buildModel(m: ApprovedMap) {
  const occRaw = num(m, "occupancy");
  const opexRaw = num(m, "expense_ratio");
  const exitRaw = num(m, "exit_cap_rate");
  const d: Record<string, number | null> = {
    occupancy: occRaw == null ? null : occRaw / 100,
    expense_ratio: opexRaw == null ? null : opexRaw / 100,
    exit_cap: exitRaw == null ? null : exitRaw / 100,
    debt: num(m, "debt_amount"),
    ads: annualDebtService(m),
  };
  const metrics: Array<{
    key: string; label: string; unit: string; formula: string;
    value: number | null; status: "ok" | "blocked";
    missing_inputs: string[]; inputs: Record<string, number | null>;
  }> = [];
  for (const spec of METRIC_SPECS) {
    const missing = spec.required.filter((k) => num(m, k) == null);
    let value: number | null = null;
    if (!missing.length) { try { value = spec.compute(m, d); } catch { value = null; } }
    if (spec.key === "total_project_cost") d.total_cost = value;
    if (spec.key === "gpr") d.gpr = value;
    if (spec.key === "noi") d.noi = value;
    if (spec.key === "exit_value") d.exit_value = value;
    if (spec.key === "profit") d.profit = value;
    const inputs: Record<string, number | null> = {};
    for (const k of spec.required) inputs[k] = num(m, k);
    metrics.push({
      key: spec.key, label: spec.label, unit: spec.unit, formula: spec.formula,
      value, status: value == null ? "blocked" : "ok",
      missing_inputs: value == null ? (missing.length ? missing : ["insufficient inputs"]) : [],
      inputs,
    });
  }
  return {
    metrics,
    blockedCount: metrics.filter((x) => x.status === "blocked").length,
    okCount: metrics.filter((x) => x.status === "ok").length,
  };
}

async function loadApprovedMap(ctx: any, projectId: string) {
  const { data: rows } = await ctx.supabase.from("assumptions")
    .select("*").eq("project_id", projectId).in("status", ["approved", "modified"]);
  const map: ApprovedMap = {};
  for (const r of rows ?? []) map[r.field_key] = r.value_numeric == null ? null : Number(r.value_numeric);
  return { map, rows: rows ?? [] };
}

async function assertUnderwritingReady(ctx: any, projectId: string) {
  const [{ data: all }, { data: conflicts }] = await Promise.all([
    ctx.supabase.from("assumptions").select("field_key,status").eq("project_id", projectId),
    ctx.supabase.from("assumption_conflicts").select("canonical_key,status").eq("project_id", projectId).eq("status", "open"),
  ]);
  const byKey = new Map((all ?? []).map((r: any) => [r.field_key, r]));
  const openConflicts = new Set((conflicts ?? []).map((c: any) => c.canonical_key));
  const missing: string[] = [];
  const conflicting: string[] = [];
  const APPROVED = new Set(["approved", "modified"]);
  for (const key of REQUIRED_KEYS) {
    if (openConflicts.has(key)) {
      conflicting.push(ASSUMPTION_BY_KEY[key]?.label ?? key);
      continue;
    }
    const row: any = byKey.get(key);
    if (!row || !APPROVED.has(row.status)) {
      missing.push(ASSUMPTION_BY_KEY[key]?.label ?? key);
    }
  }
  if (missing.length || conflicting.length) {
    const err: any = new Error(
      `UNDERWRITING BLOCKED — Missing: ${missing.join(", ") || "none"}. Conflicting: ${conflicting.join(", ") || "none"}.`
    );
    err.blocked = { missing, conflicting };
    throw err;
  }
}

export const recomputeOutputs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { project_id: string }) => z.object({ project_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertUnderwritingReady(context, data.project_id);
    const { map } = await loadApprovedMap(context, data.project_id);
    const base = buildModel(map);
    await context.supabase.from("financial_outputs").delete().eq("project_id", data.project_id);
    const inserts: any[] = [];
    for (const m of base.metrics) {
      inserts.push({
        project_id: data.project_id, owner_id: context.userId, scenario_key: "base",
        metric_key: m.key, metric_label: m.label,
        value_numeric: m.value, unit: m.unit, formula_text: m.formula,
        inputs: { ...m.inputs, _status: m.status, _missing: m.missing_inputs },
      });
    }
    if (inserts.length) await context.supabase.from("financial_outputs").insert(inserts);
    await auditLog(context, data.project_id, "project", data.project_id, "recompute_outputs",
      { metrics_ok: base.okCount, metrics_blocked: base.blockedCount });
    return { base: base.metrics, ok: base.okCount, blocked: base.blockedCount };
  });

// =================== Decision log ===================

export const recordDecision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    project_id: z.string().uuid(),
    decision: z.enum(["approve", "approve_with_conditions", "reject"]),
    rationale: z.string().max(5000),
    conditions: z.string().max(5000).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const by = await userName(context);
    const { data: row, error } = await context.supabase.from("decision_logs").insert({
      project_id: data.project_id, owner_id: context.userId, user_id: context.userId, user_name: by,
      decision: data.decision, rationale: data.rationale, conditions: data.conditions ?? null,
    }).select().single();
    if (error) throw new Error(error.message);
    await auditLog(context, data.project_id, "decision", row.id, "ic_decision", { decision: data.decision });
    return row;
  });

// =================== Readiness + Validation Dashboard ===================

export const getReadiness = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { project_id: string }) => z.object({ project_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const [{ data: rows }, { data: conflicts }] = await Promise.all([
      context.supabase.from("assumptions")
        .select("field_key,status,confidence_score,confidence_band").eq("project_id", data.project_id),
      context.supabase.from("assumption_conflicts").select("canonical_key,status")
        .eq("project_id", data.project_id).eq("status", "open"),
    ]);
    const byKey = new Map((rows ?? []).map((r) => [r.field_key, r]));
    const openConflicts = new Set((conflicts ?? []).map((c: any) => c.canonical_key));
    const required = ASSUMPTION_DEFS.filter((d) => d.required);
    const optional = ASSUMPTION_DEFS.filter((d) => !d.required);
    const isCovered = (r: any, key: string) => r && (r.status === "approved" || r.status === "modified") && !openConflicts.has(key);
    const reqCovered = required.filter((d) => isCovered(byKey.get(d.key), d.key)).length;
    const optCovered = optional.filter((d) => isCovered(byKey.get(d.key), d.key)).length;
    const missingReq = required.filter((d) => !isCovered(byKey.get(d.key), d.key));
    const reqConflicts = required.filter((d) => openConflicts.has(d.key));
    const consideredConf = (rows ?? []).filter((r) => r.confidence_score && r.confidence_score > 0);
    const avgConfidence = consideredConf.length
      ? consideredConf.reduce((s, r) => s + (r.confidence_score || 0), 0) / consideredConf.length
      : 0;
    const requiredPct = required.length ? Math.round((reqCovered / required.length) * 100) : 0;
    const optionalPct = optional.length ? Math.round((optCovered / optional.length) * 100) : 0;
    return {
      score: requiredPct,
      required_pct: requiredPct, optional_pct: optionalPct,
      required_total: required.length, required_covered: reqCovered,
      optional_total: optional.length, optional_covered: optCovered,
      conflict_count: openConflicts.size,
      conflicts: Array.from(openConflicts).map((k: any) => ({ field_key: k, label: ASSUMPTION_BY_KEY[k]?.label ?? k })),
      avg_confidence: Math.round(avgConfidence),
      missing_required: missingReq.map((d) => d.label),
      can_underwrite: missingReq.length === 0 && reqConflicts.length === 0,
      approved: reqCovered + optCovered,
      total: ASSUMPTION_DEFS.length,
      completeness_pct: ASSUMPTION_DEFS.length ? Math.round(((reqCovered + optCovered) / ASSUMPTION_DEFS.length) * 100) : 0,
    };
  });

export const getValidationDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { project_id: string }) => z.object({ project_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const [{ data: assumptions }, { data: outputs }, { data: conflicts }] = await Promise.all([
      context.supabase.from("assumptions").select("field_key,status,confidence_score").eq("project_id", data.project_id),
      context.supabase.from("financial_outputs").select("metric_key,scenario_key,value_numeric").eq("project_id", data.project_id).eq("scenario_key", "base"),
      context.supabase.from("assumption_conflicts").select("canonical_key,status").eq("project_id", data.project_id).eq("status", "open"),
    ]);
    const ass = assumptions ?? [];
    const extracted = ass.filter((a) => ["approved","modified","extracted","needs_review","pending"].includes(a.status as any)).length;
    const missing = ass.filter((a) => a.status === "missing" || a.status === "rejected").length;
    const conflicting = (conflicts ?? []).length;
    const outs = outputs ?? [];
    const metricsGenerated = outs.filter((o) => o.value_numeric != null).length;
    const metricsBlocked = outs.filter((o) => o.value_numeric == null).length;
    return {
      assumptions_extracted: extracted,
      assumptions_missing: missing,
      assumptions_conflicting: conflicting,
      formulas_executed: metricsGenerated,
      formulas_blocked: metricsBlocked,
      metrics_generated: metricsGenerated,
      metrics_blocked: metricsBlocked,
    };
  });
