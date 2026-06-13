// The Assumption Engine: extraction, approval, versioning, recalculation,
// readiness scoring, impact analysis, decision logging, audit trail.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { ASSUMPTION_DEFS, ASSUMPTION_BY_KEY, ASSUMPTION_KEYS, REQUIRED_KEYS, resolveAlias, bandFor } from "./assumption-taxonomy";

// ---------- Read APIs ----------

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

// Cross-project Review Center listing
export const listAssumptionsAcrossProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("assumptions").select("*, projects:project_id(name)")
      .order("status", { ascending: true }).order("confidence_score", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ---------- Helpers ----------

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

// ---------- Extraction (3-stage pipeline) ----------
//
// Stage 1 — Document Parsing: regex sweep of every uploaded document
//   pulls currency values, percentages, dates, unit counts, square
//   footage, and ratios. Output is a typed candidate list with the
//   surrounding context and the phrase to the LEFT of the match
//   (the natural label).
//
// Stage 2 — Assumption Classification: the AI receives the candidate
//   list (NOT the raw document) and must label each candidate with one
//   of our canonical field_keys or "ignore". This constrains the AI to
//   real values lifted from the documents and removes hallucinations.
//
// Stage 3 — Assumption Mapping: candidates classified by the AI are
//   merged with alias-based fallbacks (resolveAlias on label_hint).
//   Multiple distinct values for the same key become a conflict.

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

    // ===== Stage 1 — Document Parsing =====
    const { extractFileText } = await import("./document-text.server");
    const { extractCandidates } = await import("./assumption-candidates.server");
    type Cand = Awaited<ReturnType<typeof extractCandidates>>[number];
    const allCandidates: Cand[] = [];
    const docByName = new Map(docs.map((d) => [d.name, d]));
    for (const d of docs) {
      try {
        const dl = await context.supabase.storage.from("documents").download(d.storage_path);
        if (dl.error || !dl.data) continue;
        const buf = await dl.data.arrayBuffer();
        const text = await extractFileText(d.name, d.file_type, buf);
        const cands = extractCandidates(d.name, text.slice(0, 40000));
        allCandidates.push(...cands);
      } catch { /* skip unreadable */ }
    }
    if (!allCandidates.length) {
      throw new Error("No extractable values found in uploaded documents.");
    }

    // ===== Stage 2 — AI Classification =====
    const taxonomyText = ASSUMPTION_DEFS.map(
      (d) => `- ${d.key} (${d.label}, unit ${d.unit}${d.required ? ", REQUIRED" : ""}) aliases: ${d.aliases.slice(0, 6).join(" / ")}`
    ).join("\n");
    const cap = Math.min(allCandidates.length, 220);
    const candidateList = allCandidates.slice(0, cap).map((c, i) =>
      `${i}. [${c.kind}] value=${c.value_text} ctx="${c.context.slice(0, 220)}" hint="${c.label_hint.slice(0, 80)}" doc="${c.doc_name}"`
    ).join("\n");

    const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
    const { generateText } = await import("ai");
    const gateway = createLovableAiGatewayProvider(key);
    let classifications: z.infer<typeof ClassificationSchema>[] = [];
    try {
      const { text } = await generateText({
        model: gateway("google/gemini-3-flash-preview"),
        system: `You are an institutional real estate underwriter. Classify pre-extracted numeric candidates from project documents into canonical assumption keys. Use ONLY the candidate context to decide; never invent values. If a candidate clearly does not match any canonical assumption, use field_key="ignore".`,
        prompt: `Canonical assumption taxonomy:\n${taxonomyText}\n\nCandidates (index. [kind] value ctx hint doc):\n${candidateList}\n\nReturn a single JSON array (no prose, no markdown fences). One entry per candidate you classify. Schema: {"candidate_index":<int>,"field_key":"<taxonomy key or ignore>","confidence_score":<0-100>,"reasoning":"<short>"}. Skip candidates you cannot confidently classify.`,
      });
      const m = text.match(/\[[\s\S]*\]/);
      const parsed = m ? JSON.parse(m[0]) : [];
      const safe = z.array(ClassificationSchema).safeParse(parsed);
      if (safe.success) classifications = safe.data.filter((c) => c.field_key === "ignore" || ASSUMPTION_KEYS.includes(c.field_key));
    } catch {
      classifications = [];
    }

    // ===== Stage 3 — Assumption Mapping (AI + alias fallback) =====
    type Mapped = {
      field_key: string; value_numeric: number | null; value_text: string | null;
      confidence_score: number; source_doc_name: string; source_text: string;
      reasoning: string; via: "ai" | "alias";
    };
    const mapped: Mapped[] = [];

    for (const cls of classifications) {
      if (cls.field_key === "ignore") continue;
      const cand = allCandidates[cls.candidate_index];
      if (!cand) continue;
      const def = ASSUMPTION_BY_KEY[cls.field_key];
      if (!def) continue;
      mapped.push({
        field_key: def.key,
        value_numeric: def.numeric ? cand.value_numeric : null,
        value_text: def.numeric ? null : cand.value_text,
        confidence_score: Math.round(cls.confidence_score),
        source_doc_name: cand.doc_name,
        source_text: cand.context,
        reasoning: cls.reasoning || "AI-classified candidate",
        via: "ai",
      });
    }

    // Alias fallback — for any candidate the AI ignored, check if the
    // label hint matches a canonical alias. Adds inferred values.
    const aiCandidateIndices = new Set(classifications.filter((c) => c.field_key !== "ignore").map((c) => c.candidate_index));
    let inferredCount = 0;
    for (let i = 0; i < allCandidates.length; i++) {
      if (aiCandidateIndices.has(i)) continue;
      const cand = allCandidates[i];
      const fk = resolveAlias(cand.label_hint);
      if (!fk) continue;
      const def = ASSUMPTION_BY_KEY[fk];
      if (!def || !def.numeric || cand.value_numeric == null) continue;
      // Unit sanity check
      if (def.unit === "%" && cand.kind !== "percent") continue;
      if (def.unit === "$" && cand.kind !== "currency") continue;
      if (def.unit === "SF" && cand.kind !== "sf") continue;
      mapped.push({
        field_key: def.key,
        value_numeric: cand.value_numeric,
        value_text: null,
        confidence_score: 55,
        source_doc_name: cand.doc_name,
        source_text: cand.context,
        reasoning: `Alias-matched "${cand.label_hint.slice(-40)}" → ${def.label}`,
        via: "alias",
      });
      inferredCount++;
    }

    // Group by field_key and detect conflicts (multiple distinct numeric values)
    const grouped = new Map<string, Mapped[]>();
    for (const m of mapped) {
      const arr = grouped.get(m.field_key) ?? [];
      arr.push(m);
      grouped.set(m.field_key, arr);
    }

    const conflictKeys: string[] = [];
    const foundKeys: string[] = [];
    const auditEntries: { field_key: string; status: string; chosen?: number | string | null; alternates?: (number | string | null)[]; source_doc?: string }[] = [];

    const { data: existing } = await context.supabase
      .from("assumptions").select("*").eq("project_id", data.project_id);
    const existingByKey = new Map((existing ?? []).map((a) => [a.field_key, a]));
    const by = await userName(context);

    for (const [fk, arr] of grouped.entries()) {
      const def = ASSUMPTION_BY_KEY[fk];
      arr.sort((a, b) => b.confidence_score - a.confidence_score);
      const winner = arr[0];
      const distinct = Array.from(new Set(arr.map((a) =>
        a.value_numeric != null ? Math.round(a.value_numeric * 1000) / 1000 : a.value_text
      )));
      const isConflict = distinct.length > 1;
      if (isConflict) conflictKeys.push(fk);
      else foundKeys.push(fk);

      const srcDoc = docByName.get(winner.source_doc_name);
      const status: "extracted" | "conflicting" = isConflict ? "conflicting" : "extracted";
      const payload = {
        project_id: data.project_id, owner_id: context.userId,
        field_key: def.key, field_label: def.label, category: def.category, unit: def.unit,
        value_numeric: winner.value_numeric,
        value_text: winner.value_text,
        status,
        confidence_score: winner.confidence_score,
        confidence_band: bandFor(winner.confidence_score),
        source_document_id: srcDoc?.id ?? null,
        source_location: srcDoc?.name ?? null,
        source_text: winner.source_text,
        ai_reasoning: isConflict
          ? `Conflicting values across documents: ${distinct.join(" vs ")}. Winner via ${winner.via}: ${winner.reasoning}`
          : `${winner.via === "alias" ? "Alias-mapped" : "AI-classified"}: ${winner.reasoning}`,
      };

      const prev = existingByKey.get(fk);
      if (prev) {
        const { data: upd } = await context.supabase.from("assumptions").update({
          ...payload, current_version: prev.current_version + 1,
        }).eq("id", prev.id).select().single();
        if (upd) await recordVersion(context, upd, `Re-extracted via 3-stage pipeline (${status})`, "Extraction Pipeline");
      } else {
        const { data: ins } = await context.supabase.from("assumptions").insert(payload).select().single();
        if (ins) await recordVersion(context, ins, `Initial extraction (${status})`, "Extraction Pipeline");
      }

      auditEntries.push({
        field_key: fk, status,
        chosen: winner.value_numeric ?? winner.value_text,
        alternates: isConflict ? distinct : undefined,
        source_doc: winner.source_doc_name,
      });
    }

    // Missing placeholders for every taxonomy key not found
    const missingKeys: string[] = [];
    for (const def of ASSUMPTION_DEFS) {
      if (grouped.has(def.key) || existingByKey.has(def.key)) continue;
      missingKeys.push(def.key);
      const { data: ins } = await context.supabase.from("assumptions").insert({
        project_id: data.project_id, owner_id: context.userId,
        field_key: def.key, field_label: def.label, category: def.category, unit: def.unit,
        status: "missing", confidence_score: 0, confidence_band: "missing",
        ai_reasoning: "Not found by Stage 1–3 extraction. Provide manually or upload more docs.",
      }).select().single();
      if (ins) await recordVersion(context, ins, "Created as missing", "Extraction Pipeline");
      auditEntries.push({ field_key: def.key, status: "missing" });
    }

    const missingRequired = REQUIRED_KEYS.filter((k) => missingKeys.includes(k)
      || existingByKey.get(k)?.status === "missing");

    const report = {
      stage1_candidates: allCandidates.length,
      stage2_classified: classifications.filter((c) => c.field_key !== "ignore").length,
      stage3_inferred_via_alias: inferredCount,
      found: foundKeys.length,
      conflicting: conflictKeys.length,
      missing: missingKeys.length,
      missing_required: missingRequired.map((k) => ASSUMPTION_BY_KEY[k]?.label ?? k),
      conflicts: conflictKeys.map((k) => ASSUMPTION_BY_KEY[k]?.label ?? k),
      can_underwrite: missingRequired.length === 0,
      entries: auditEntries,
    };

    await auditLog(context, data.project_id, "project", data.project_id, "extract_assumptions", report);
    return report;
  });

// ---------- Approval workflow ----------

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
    const patch: any = { current_version: newVer };
    if (data.action === "approve") {
      patch.status = "approved";
      patch.approved_by = context.userId;
      patch.approved_at = new Date().toISOString();
    } else if (data.action === "modify") {
      patch.status = "modified";
      patch.value_numeric = data.value_numeric ?? cur.value_numeric;
      patch.value_text = data.value_text ?? cur.value_text;
      patch.approved_by = context.userId;
      patch.approved_at = new Date().toISOString();
      // Modified values get high confidence (human-entered)
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

// ---------- Deterministic financial engine (no fabrication) ----------
//
// Strict-mode rules:
//   • Every metric declares the assumption keys it requires.
//   • If any required input is missing, the metric is emitted with
//     value=null and status="blocked". We NEVER substitute placeholder
//     values, industry averages, or AI guesses.
//   • Underwriting itself is gated by REQUIRED_KEYS — if any required
//     assumption is missing OR still conflicting, recomputeOutputs
//     throws a structured "UNDERWRITING BLOCKED" error and writes no
//     financial_outputs rows.
//   • Scenarios may only perturb assumptions that already exist in the
//     approved set; missing keys are left untouched (no fabrication).

type ApprovedMap = Record<string, number | null>;

function n(m: ApprovedMap, key: string): number | null {
  const v = m[key];
  return typeof v === "number" && !isNaN(v) ? v : null;
}

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
  {
    key: "total_project_cost", label: "Total Project Cost", unit: "$",
    formula: "Land + Hard + Soft + Financing + Contingency",
    required: ["land_cost", "hard_costs", "soft_costs"],
    compute: (m) => {
      const xs = NUM(n(m, "land_cost"), n(m, "hard_costs"), n(m, "soft_costs"));
      if (!xs) return null;
      return xs[0] + xs[1] + xs[2] + (n(m, "financing_costs") ?? 0) + (n(m, "contingency") ?? 0);
    },
  },
  {
    key: "gpr", label: "Gross Potential Rent (Yr 1)", unit: "$",
    formula: "Σ(component units × rent × periods)",
    required: [],
    compute: (m) => {
      const parts: number[] = [];
      const ru = n(m, "residential_units"), rr = n(m, "residential_rent_monthly");
      if (ru != null && rr != null) parts.push(ru * rr * 12);
      const rs = n(m, "retail_sf"), rp = n(m, "retail_rent_psf");
      if (rs != null && rp != null) parts.push(rs * rp);
      const os = n(m, "office_sf"), op = n(m, "office_rent_psf");
      if (os != null && op != null) parts.push(os * op);
      return parts.length ? parts.reduce((a, b) => a + b, 0) : null;
    },
  },
  {
    key: "noi", label: "Stabilized NOI", unit: "$",
    formula: "GPR × Occupancy × (1 − OpEx ratio)",
    required: ["stabilized_occupancy", "opex_ratio"],
    compute: (_m, d) => {
      const xs = NUM(d.gpr, d.occupancy, d.opex_ratio);
      if (!xs) return null;
      return xs[0] * xs[1] * (1 - xs[2]);
    },
  },
  {
    key: "exit_value", label: "Exit Value (Project Value)", unit: "$",
    formula: "NOI ÷ Exit Cap Rate",
    required: ["exit_cap_rate"],
    compute: (_m, d) => {
      const xs = NUM(d.noi, d.exit_cap);
      if (!xs || xs[1] <= 0) return null;
      return xs[0] / xs[1];
    },
  },
  {
    key: "ltc", label: "Loan-to-Cost", unit: "%",
    formula: "Debt ÷ Total Cost",
    required: ["debt_amount"],
    compute: (_m, d) => {
      const xs = NUM(d.debt, d.total_cost);
      if (!xs || xs[1] <= 0) return null;
      return (xs[0] / xs[1]) * 100;
    },
  },
  {
    key: "dscr", label: "Stabilized DSCR", unit: "x",
    formula: "NOI ÷ Annual Debt Service",
    required: ["debt_amount", "interest_rate"],
    compute: (_m, d) => {
      const xs = NUM(d.noi, d.ads);
      if (!xs || xs[1] <= 0) return null;
      return xs[0] / xs[1];
    },
  },
  {
    key: "equity_required", label: "Equity Required", unit: "$",
    formula: "Equity Amount (or Total Cost − Debt)",
    required: ["equity_amount"],
    compute: (m, d) => {
      const eq = n(m, "equity_amount");
      if (eq != null) return eq;
      const xs = NUM(d.total_cost, d.debt);
      if (!xs) return null;
      return Math.max(xs[0] - xs[1], 0);
    },
  },
  {
    key: "yield_on_cost", label: "Yield on Cost", unit: "%",
    formula: "NOI ÷ Total Cost",
    required: [],
    compute: (_m, d) => {
      const xs = NUM(d.noi, d.total_cost);
      if (!xs || xs[1] <= 0) return null;
      return (xs[0] / xs[1]) * 100;
    },
  },
  {
    key: "profit", label: "Profit", unit: "$",
    formula: "Exit Value − Total Cost",
    required: [],
    compute: (_m, d) => {
      const xs = NUM(d.exit_value, d.total_cost);
      return xs ? xs[0] - xs[1] : null;
    },
  },
  {
    key: "margin", label: "Profit Margin", unit: "%",
    formula: "Profit ÷ Exit Value",
    required: [],
    compute: (_m, d) => {
      const xs = NUM(d.profit, d.exit_value);
      if (!xs || xs[1] <= 0) return null;
      return (xs[0] / xs[1]) * 100;
    },
  },
];

function annualDebtService(m: ApprovedMap): number | null {
  const debt = n(m, "debt_amount");
  const rate = n(m, "interest_rate");
  if (debt == null || rate == null) return null;
  const amort = n(m, "amortization_years") ?? 30;
  const r = rate / 100 / 12;
  const N = amort * 12;
  if (r <= 0 || N <= 0) return debt / amort;
  return ((debt * r) / (1 - Math.pow(1 + r, -N))) * 12;
}

function buildModel(m: ApprovedMap) {
  const occRaw = n(m, "stabilized_occupancy");
  const opexRaw = n(m, "opex_ratio");
  const exitRaw = n(m, "exit_cap_rate");

  const d: Record<string, number | null> = {
    occupancy: occRaw == null ? null : occRaw / 100,
    opex_ratio: opexRaw == null ? null : opexRaw / 100,
    exit_cap: exitRaw == null ? null : exitRaw / 100,
    debt: n(m, "debt_amount"),
    ads: annualDebtService(m),
  };

  const metrics: Array<{
    key: string; label: string; unit: string; formula: string;
    value: number | null; status: "ok" | "blocked";
    missing_inputs: string[]; inputs: Record<string, number | null>;
  }> = [];

  for (const spec of METRIC_SPECS) {
    const missing = spec.required.filter((k) => n(m, k) == null);
    let value: number | null = null;
    if (!missing.length) { try { value = spec.compute(m, d); } catch { value = null; } }
    if (spec.key === "total_project_cost") d.total_cost = value;
    if (spec.key === "gpr") d.gpr = value;
    if (spec.key === "noi") d.noi = value;
    if (spec.key === "exit_value") d.exit_value = value;
    if (spec.key === "profit") d.profit = value;
    const inputs: Record<string, number | null> = {};
    for (const k of spec.required) inputs[k] = n(m, k);
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

async function loadApprovedMap(ctx: any, projectId: string): Promise<{ map: ApprovedMap; rows: any[] }> {
  const { data: rows } = await ctx.supabase.from("assumptions")
    .select("*").eq("project_id", projectId)
    .in("status", ["approved", "modified"]);
  const map: ApprovedMap = {};
  for (const r of rows ?? []) map[r.field_key] = r.value_numeric == null ? null : Number(r.value_numeric);
  return { map, rows: rows ?? [] };
}

// Gatekeeper — refuses to underwrite when required assumptions are missing
// or still conflicting.
async function assertUnderwritingReady(ctx: any, projectId: string) {
  const { data: all } = await ctx.supabase.from("assumptions")
    .select("field_key,status").eq("project_id", projectId);
  const byKey = new Map((all ?? []).map((r: any) => [r.field_key, r]));
  const missing: string[] = [];
  const conflicting: string[] = [];
  const APPROVED = new Set(["approved", "modified"]);
  for (const key of REQUIRED_KEYS) {
    const row: any = byKey.get(key);
    if (!row || !APPROVED.has(row.status)) {
      if (row?.status === "conflicting") conflicting.push(ASSUMPTION_BY_KEY[key]?.label ?? key);
      else missing.push(ASSUMPTION_BY_KEY[key]?.label ?? key);
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

    const perturb = (overrides: Partial<ApprovedMap>) => {
      const next: ApprovedMap = { ...map };
      for (const [k, v] of Object.entries(overrides)) {
        if (map[k] == null) continue; // only modify approved assumptions
        next[k] = v as number;
      }
      return buildModel(next);
    };
    const occApproved = n(map, "stabilized_occupancy");
    const stress = {
      revenue_down: perturb({
        residential_rent_monthly: (n(map, "residential_rent_monthly") ?? 0) * 0.9,
        retail_rent_psf: (n(map, "retail_rent_psf") ?? 0) * 0.9,
        office_rent_psf: (n(map, "office_rent_psf") ?? 0) * 0.9,
        stabilized_occupancy: occApproved != null ? Math.max(occApproved - 5, 0) : 0,
      }),
      cost_overrun: perturb({ hard_costs: (n(map, "hard_costs") ?? 0) * 1.1 }),
      rate_shock: perturb({ interest_rate: (n(map, "interest_rate") ?? 0) + 1.5 }),
      cap_expansion: perturb({ exit_cap_rate: (n(map, "exit_cap_rate") ?? 0) + 0.75 }),
    };

    await context.supabase.from("financial_outputs").delete().eq("project_id", data.project_id);
    const inserts: any[] = [];
    const push = (scenario: string, model: ReturnType<typeof buildModel>, changed: string[] = []) => {
      for (const m of model.metrics) {
        inserts.push({
          project_id: data.project_id, owner_id: context.userId, scenario_key: scenario,
          metric_key: m.key, metric_label: m.label,
          value_numeric: m.value, // null when blocked — never fabricated
          unit: m.unit, formula_text: m.formula,
          inputs: { ...m.inputs, _status: m.status, _missing: m.missing_inputs, _changed_assumptions: changed },
        });
      }
    };
    push("base", base);
    push("revenue_down", stress.revenue_down, ["residential_rent_monthly","retail_rent_psf","office_rent_psf","stabilized_occupancy"]);
    push("cost_overrun", stress.cost_overrun, ["hard_costs"]);
    push("rate_shock", stress.rate_shock, ["interest_rate"]);
    push("cap_expansion", stress.cap_expansion, ["exit_cap_rate"]);
    await context.supabase.from("financial_outputs").insert(inserts);

    // Impact analysis — only on assumptions that actually exist
    const exitBase = base.metrics.find((x) => x.key === "exit_value")?.value;
    if (exitBase != null) {
      const impactRows: { key: string; impact: number }[] = [];
      for (const def of ASSUMPTION_DEFS) {
        if (!def.numeric) continue;
        const v = map[def.key];
        if (typeof v !== "number" || v === 0) continue;
        const up = buildModel({ ...map, [def.key]: v * 1.1 }).metrics.find((x) => x.key === "exit_value")?.value;
        const down = buildModel({ ...map, [def.key]: v * 0.9 }).metrics.find((x) => x.key === "exit_value")?.value;
        if (up == null || down == null) continue;
        impactRows.push({ key: def.key, impact: Math.abs(up - down) / 2 });
      }
      impactRows.sort((a, b) => b.impact - a.impact);
      let rank = 1;
      for (const r of impactRows.slice(0, 10)) {
        await context.supabase.from("assumptions").update({
          impact_rank: rank, impact_amount: r.impact,
        }).eq("project_id", data.project_id).eq("field_key", r.key);
        rank++;
      }
    }

    // Risk register — only from real approved values
    await context.supabase.from("risk_register").delete().eq("project_id", data.project_id);
    const risks: any[] = [];
    const add = (severity: string, type: string, title: string, description: string) =>
      risks.push({ project_id: data.project_id, owner_id: context.userId, severity, risk_type: type, title, description });
    const dscrBase = base.metrics.find((x) => x.key === "dscr")?.value;
    if (dscrBase != null && dscrBase < 1.20) add("red", "credit", "Weak Stabilized DSCR", `Stabilized DSCR is ${dscrBase.toFixed(2)}x, below typical 1.20x covenant.`);
    const opexApproved = n(map, "opex_ratio");
    if (opexApproved != null && opexApproved < 30) add("yellow", "operations", "Aggressive OpEx Ratio", `Approved OpEx ratio of ${opexApproved}% is below institutional norms (32–38%).`);
    const exitApproved = n(map, "exit_cap_rate");
    if (exitApproved != null && exitApproved < 5) add("yellow", "exit", "Aggressive Exit Cap", `Exit cap of ${exitApproved}% assumes meaningful cap compression.`);
    const rgApproved = n(map, "rent_growth");
    if (rgApproved != null && rgApproved > 4) add("yellow", "revenue", "Aggressive Rent Growth", `Rent growth assumption of ${rgApproved}% exceeds long-run averages.`);
    if (risks.length) await context.supabase.from("risk_register").insert(risks);

    await auditLog(context, data.project_id, "project", data.project_id, "recompute_outputs",
      { metrics_ok: base.okCount, metrics_blocked: base.blockedCount, risks: risks.length });

    return { base: base.metrics, ok: base.okCount, blocked: base.blockedCount, risks: risks.length };
  });

// ---------- Decision log ----------

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

// ---------- Readiness + Validation Dashboard ----------

export const getReadiness = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { project_id: string }) => z.object({ project_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase.from("assumptions")
      .select("field_key,status,confidence_score,confidence_band").eq("project_id", data.project_id);
    const byKey = new Map((rows ?? []).map((r) => [r.field_key, r]));
    const required = ASSUMPTION_DEFS.filter((d) => d.required);
    const optional = ASSUMPTION_DEFS.filter((d) => !d.required);
    const isCovered = (r: any) => r && (r.status === "approved" || r.status === "modified");
    const reqCovered = required.filter((d) => isCovered(byKey.get(d.key))).length;
    const optCovered = optional.filter((d) => isCovered(byKey.get(d.key))).length;
    const missingReq = required.filter((d) => !isCovered(byKey.get(d.key)));
    const conflicts = (rows ?? []).filter((r) => r.status === "conflicting");
    const reqConflicts = conflicts.filter((c) => required.some((d) => d.key === c.field_key));
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
      conflict_count: conflicts.length,
      conflicts: conflicts.map((c) => ({ field_key: c.field_key, label: ASSUMPTION_BY_KEY[c.field_key]?.label ?? c.field_key })),
      avg_confidence: Math.round(avgConfidence),
      missing_required: missingReq.map((d) => d.label),
      can_underwrite: missingReq.length === 0 && reqConflicts.length === 0,
      // Back-compat keys
      approved: reqCovered + optCovered,
      total: ASSUMPTION_DEFS.length,
      completeness_pct: ASSUMPTION_DEFS.length ? Math.round(((reqCovered + optCovered) / ASSUMPTION_DEFS.length) * 100) : 0,
    };
  });

export const getValidationDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { project_id: string }) => z.object({ project_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const [{ data: assumptions }, { data: outputs }] = await Promise.all([
      context.supabase.from("assumptions").select("field_key,status,confidence_score").eq("project_id", data.project_id),
      context.supabase.from("financial_outputs").select("metric_key,scenario_key,value_numeric").eq("project_id", data.project_id).eq("scenario_key", "base"),
    ]);
    const ass = assumptions ?? [];
    const extracted = ass.filter((a) => ["approved","modified","extracted","needs_review","pending","conflicting"].includes(a.status as any)).length;
    const missing = ass.filter((a) => a.status === "missing" || a.status === "rejected").length;
    const conflicting = ass.filter((a) => a.status === "conflicting").length;
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
