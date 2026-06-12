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

// ---------- Financial engine ----------

type ApprovedMap = Record<string, number | null>;

function num(m: ApprovedMap, key: string, fallback = 0) {
  const v = m[key];
  return typeof v === "number" && !isNaN(v) ? v : fallback;
}

function buildModel(m: ApprovedMap) {
  const land = num(m, "land_cost");
  const hard = num(m, "hard_costs");
  const soft = num(m, "soft_costs");
  const fin = num(m, "financing_costs");
  const cont = num(m, "contingency");
  const totalCost = land + hard + soft + fin + cont;

  // Revenue (annualized GPR)
  const resUnits = num(m, "residential_units");
  const resRent = num(m, "residential_rent_monthly");
  const retailSf = num(m, "retail_sf");
  const retailRent = num(m, "retail_rent_psf");
  const officeSf = num(m, "office_sf");
  const officeRent = num(m, "office_rent_psf");
  const gpr = resUnits * resRent * 12 + retailSf * retailRent + officeSf * officeRent;

  const occ = (num(m, "stabilized_occupancy") || 95) / 100;
  const opexRatio = (num(m, "opex_ratio") || 35) / 100;
  const egi = gpr * occ;
  const opex = egi * opexRatio;
  const noi = egi - opex;

  const exitCap = (num(m, "exit_cap_rate") || 5) / 100;
  const exitValue = exitCap > 0 ? noi / exitCap : 0;

  const debt = num(m, "debt_amount");
  const equity = num(m, "equity_amount") || Math.max(totalCost - debt, 0);
  const rate = (num(m, "interest_rate") || 0) / 100;
  const amort = num(m, "amortization_years", 30);
  const monthlyRate = rate / 12;
  const n = amort * 12;
  const monthlyPmt = monthlyRate > 0 && n > 0
    ? (debt * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -n))
    : 0;
  const ads = monthlyPmt * 12;
  const dscr = ads > 0 ? noi / ads : 0;

  const hold = num(m, "hold_period_years", 5);
  const dispoCost = (num(m, "disposition_cost_pct") || 1) / 100;
  const netExit = exitValue * (1 - dispoCost);
  const netSaleProceedsToEquity = netExit - debt;
  const totalEquityReturn = netSaleProceedsToEquity + (noi - ads) * hold;
  const em = equity > 0 ? totalEquityReturn / equity : 0;
  const irr = equity > 0 && hold > 0
    ? (Math.pow(Math.max(em, 0.0001), 1 / hold) - 1) * 100
    : 0;

  const ltc = totalCost > 0 ? (debt / totalCost) * 100 : 0;
  const yieldOnCost = totalCost > 0 ? (noi / totalCost) * 100 : 0;
  const devSpread = yieldOnCost - exitCap * 100;
  const profit = exitValue - totalCost;
  const margin = exitValue > 0 ? (profit / exitValue) * 100 : 0;

  return {
    metrics: [
      { key: "total_project_cost", label: "Total Project Cost", value: totalCost, unit: "$",
        formula: "Land + Hard + Soft + Financing + Contingency",
        inputs: { land, hard, soft, financing: fin, contingency: cont } },
      { key: "gpr", label: "Gross Potential Rent (Yr 1)", value: gpr, unit: "$",
        formula: "Σ(component units × rent × periods)",
        inputs: { resUnits, resRent, retailSf, retailRent, officeSf, officeRent } },
      { key: "noi", label: "Stabilized NOI", value: noi, unit: "$",
        formula: "GPR × Occupancy × (1 − OpEx ratio)",
        inputs: { gpr, occupancy: occ, opexRatio } },
      { key: "exit_value", label: "Exit Value", value: exitValue, unit: "$",
        formula: "NOI ÷ Exit Cap Rate", inputs: { noi, exitCap } },
      { key: "ltc", label: "Loan-to-Cost", value: ltc, unit: "%",
        formula: "Debt ÷ Total Cost", inputs: { debt, totalCost } },
      { key: "dscr", label: "Stabilized DSCR", value: dscr, unit: "x",
        formula: "NOI ÷ Annual Debt Service", inputs: { noi, ads, rate, amort } },
      { key: "yield_on_cost", label: "Yield on Cost", value: yieldOnCost, unit: "%",
        formula: "NOI ÷ Total Cost", inputs: { noi, totalCost } },
      { key: "dev_spread", label: "Development Spread", value: devSpread, unit: "bps",
        formula: "Yield on Cost − Exit Cap", inputs: { yieldOnCost, exitCap } },
      { key: "equity_required", label: "Equity Required", value: equity, unit: "$",
        formula: "Total Cost − Debt", inputs: { totalCost, debt } },
      { key: "equity_multiple", label: "Equity Multiple", value: em, unit: "x",
        formula: "(Net Sale Proceeds + Σ CF) ÷ Equity",
        inputs: { netSaleProceedsToEquity, cashflow: (noi - ads) * hold, equity, hold } },
      { key: "irr", label: "Levered IRR (est.)", value: irr, unit: "%",
        formula: "EM^(1/Hold) − 1", inputs: { em, hold } },
      { key: "profit", label: "Profit", value: profit, unit: "$",
        formula: "Exit Value − Total Cost", inputs: { exitValue, totalCost } },
      { key: "margin", label: "Profit Margin", value: margin, unit: "%",
        formula: "Profit ÷ Exit Value", inputs: { profit, exitValue } },
    ],
    noi, exitValue, em, irr, dscr,
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

export const recomputeOutputs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { project_id: string }) => z.object({ project_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { map } = await loadApprovedMap(context, data.project_id);
    const base = buildModel(map);

    // Scenarios
    const stress = {
      revenue_down: buildModel({ ...map, residential_rent_monthly: num(map, "residential_rent_monthly") * 0.9,
        retail_rent_psf: num(map, "retail_rent_psf") * 0.9, office_rent_psf: num(map, "office_rent_psf") * 0.9 }),
      cost_overrun: buildModel({ ...map, hard_costs: num(map, "hard_costs") * 1.1 }),
      rate_shock: buildModel({ ...map, interest_rate: num(map, "interest_rate") + 1.5 }),
      cap_expansion: buildModel({ ...map, exit_cap_rate: num(map, "exit_cap_rate") + 0.75 }),
      combined: buildModel({
        ...map,
        residential_rent_monthly: num(map, "residential_rent_monthly") * 0.92,
        hard_costs: num(map, "hard_costs") * 1.08,
        interest_rate: num(map, "interest_rate") + 1.0,
        exit_cap_rate: num(map, "exit_cap_rate") + 0.5,
      }),
    };

    // Clear & write outputs
    await context.supabase.from("financial_outputs").delete().eq("project_id", data.project_id);
    const inserts: any[] = [];
    const push = (scenario: string, model: ReturnType<typeof buildModel>) => {
      for (const m of model.metrics) {
        inserts.push({
          project_id: data.project_id, owner_id: context.userId, scenario_key: scenario,
          metric_key: m.key, metric_label: m.label, value_numeric: m.value,
          unit: m.unit, formula_text: m.formula, inputs: m.inputs,
        });
      }
    };
    push("base", base);
    for (const [k, v] of Object.entries(stress)) push(k, v);
    await context.supabase.from("financial_outputs").insert(inserts);

    // Impact analysis — bump each numeric assumption by ±10% and rank by exit value change
    const impactRows: { key: string; impact: number }[] = [];
    const baseValue = base.exitValue;
    for (const def of ASSUMPTION_DEFS) {
      if (!def.numeric) continue;
      const v = map[def.key];
      if (typeof v !== "number" || v === 0) continue;
      const up = buildModel({ ...map, [def.key]: v * 1.1 });
      const down = buildModel({ ...map, [def.key]: v * 0.9 });
      const impact = Math.abs(up.exitValue - down.exitValue) / 2;
      impactRows.push({ key: def.key, impact });
    }
    impactRows.sort((a, b) => b.impact - a.impact);
    let rank = 1;
    for (const r of impactRows.slice(0, 10)) {
      await context.supabase.from("assumptions").update({
        impact_rank: rank, impact_amount: r.impact,
      }).eq("project_id", data.project_id).eq("field_key", r.key);
      rank++;
    }

    // Risk register refresh
    await context.supabase.from("risk_register").delete().eq("project_id", data.project_id);
    const risks: any[] = [];
    const add = (severity: string, type: string, title: string, description: string) =>
      risks.push({ project_id: data.project_id, owner_id: context.userId, severity, risk_type: type, title, description });
    if (base.dscr > 0 && base.dscr < 1.20) add("red", "credit", "Weak Stabilized DSCR", `Stabilized DSCR is ${base.dscr.toFixed(2)}x, below typical 1.20x covenant.`);
    if ((num(map, "opex_ratio") || 0) < 30 && map["opex_ratio"] != null) add("yellow", "operations", "Aggressive OpEx Ratio", `Approved OpEx ratio of ${num(map, "opex_ratio")}% is below institutional norms (32–38%).`);
    if ((num(map, "exit_cap_rate") || 0) > 0 && num(map, "exit_cap_rate") < 5) add("yellow", "exit", "Aggressive Exit Cap", `Exit cap of ${num(map, "exit_cap_rate")}% assumes meaningful cap compression.`);
    if ((num(map, "rent_growth") || 0) > 4) add("yellow", "revenue", "Aggressive Rent Growth", `Rent growth assumption of ${num(map, "rent_growth")}% exceeds long-run averages.`);
    const contingencyPct = num(map, "hard_costs") > 0 ? (num(map, "contingency") / num(map, "hard_costs")) * 100 : 0;
    if (num(map, "contingency") > 0 && contingencyPct < 5) add("yellow", "costs", "Low Contingency", `Contingency is ${contingencyPct.toFixed(1)}% of hard costs (target 5–10%).`);
    const devSpread = base.metrics.find((m) => m.key === "dev_spread")?.value ?? 0;
    if (devSpread < 100 && devSpread !== 0) add(devSpread < 50 ? "red" : "yellow", "exit", "Thin Development Spread", `Development spread is ${devSpread.toFixed(0)} bps (target ≥ 100 bps).`);
    if (risks.length) await context.supabase.from("risk_register").insert(risks);

    await auditLog(context, data.project_id, "project", data.project_id, "recompute_outputs",
      { scenarios: 1 + Object.keys(stress).length, risks: risks.length });

    return { base: base.metrics, stress: Object.fromEntries(Object.entries(stress).map(([k, v]) => [k, v.metrics])), risks: risks.length };
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

// ---------- Readiness ----------

export const getReadiness = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { project_id: string }) => z.object({ project_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase.from("assumptions")
      .select("field_key,status,confidence_score,confidence_band").eq("project_id", data.project_id);
    const map = new Map((rows ?? []).map((r) => [r.field_key, r]));
    const required = ASSUMPTION_DEFS.filter((d) => d.required);
    const total = ASSUMPTION_DEFS.length;
    const approved = (rows ?? []).filter((r) => r.status === "approved" || r.status === "modified").length;
    const missingReq = required.filter((d) => {
      const r = map.get(d.key);
      return !r || r.status === "missing" || r.status === "rejected";
    });
    const avgConfidence = (rows ?? []).reduce((s, r) => s + (r.confidence_score || 0), 0) / Math.max(rows?.length ?? 1, 1);
    const completenessPct = Math.round((approved / total) * 100);
    const requiredPct = Math.round(((required.length - missingReq.length) / required.length) * 100);
    const score = Math.round(0.6 * requiredPct + 0.3 * completenessPct + 0.1 * avgConfidence);
    return { score, approved, total, missing_required: missingReq.map((d) => d.label), avg_confidence: Math.round(avgConfidence), completeness_pct: completenessPct, required_pct: requiredPct };
  });
