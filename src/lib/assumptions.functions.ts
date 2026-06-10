// The Assumption Engine: extraction, approval, versioning, recalculation,
// readiness scoring, impact analysis, decision logging, audit trail.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { ASSUMPTION_DEFS, ASSUMPTION_BY_KEY, ASSUMPTION_KEYS, bandFor } from "./assumption-taxonomy";

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

// ---------- Extraction ----------

const ExtractionSchema = z.object({
  field_key: z.string(),
  value_numeric: z.number().nullable().optional(),
  value_text: z.string().nullable().optional(),
  source_doc_name: z.string().nullable().optional(),
  source_text: z.string().nullable().optional(),
  confidence_score: z.number().min(0).max(100),
  ai_reasoning: z.string(),
});

export const extractAssumptions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { project_id: string }) => z.object({ project_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    // Load all project documents
    const { data: docs, error: dErr } = await context.supabase
      .from("documents").select("*").eq("project_id", data.project_id);
    if (dErr) throw new Error(dErr.message);
    if (!docs?.length) throw new Error("Upload documents to this project before extracting assumptions.");

    // Parse each doc to text
    const { extractFileText } = await import("./document-text.server");
    const corpus: { name: string; category: string | null; text: string }[] = [];
    for (const d of docs) {
      try {
        const dl = await context.supabase.storage.from("documents").download(d.storage_path);
        if (dl.error || !dl.data) continue;
        const buf = await dl.data.arrayBuffer();
        const text = await extractFileText(d.name, d.file_type, buf);
        corpus.push({ name: d.name, category: d.category, text: text.slice(0, 20000) });
      } catch { /* skip unreadable */ }
    }
    if (!corpus.length) throw new Error("Could not read any uploaded document.");

    // Build extraction prompt
    const taxonomyText = ASSUMPTION_DEFS.map(
      (d) => `- ${d.key} (${d.label}, ${d.unit}${d.numeric ? ", numeric" : ", text"}${d.required ? ", REQUIRED" : ""})`
    ).join("\n");
    const docsText = corpus.map((c, i) => `=== DOC ${i + 1}: ${c.name} (${c.category ?? "uncategorized"}) ===\n${c.text}`).join("\n\n");

    const { createLovableAiGatewayProvider } = await import("./ai-gateway.server");
    const { generateText } = await import("ai");
    const gateway = createLovableAiGatewayProvider(key);
    const { text } = await generateText({
      model: gateway("google/gemini-3-flash-preview"),
      system: `You are an institutional real estate underwriter. Extract ONLY values explicitly supported by the documents. Never invent. If a field is not mentioned, OMIT it. Always cite source_doc_name and the verbatim source_text snippet.`,
      prompt: `Project assumption taxonomy:\n${taxonomyText}\n\nDocuments:\n${docsText}\n\nReturn a single JSON array (no prose, no markdown fences). Each element: {"field_key":"<one of the taxonomy keys>","value_numeric":<number or null>,"value_text":<string or null>,"source_doc_name":"<doc name>","source_text":"<<= 200 chars of the source>","confidence_score":<0-100>,"ai_reasoning":"<one sentence>"}. Only include fields you can support from the documents.`,
    });

    // Parse JSON
    let parsed: unknown;
    try {
      const m = text.match(/\[[\s\S]*\]/);
      parsed = m ? JSON.parse(m[0]) : [];
    } catch { parsed = []; }
    const items = z.array(ExtractionSchema).safeParse(parsed);
    const extracted = items.success ? items.data.filter((e) => ASSUMPTION_KEYS.includes(e.field_key)) : [];

    const docByName = new Map(docs.map((d) => [d.name, d]));
    const by = await userName(context);

    // Build map: existing assumptions
    const { data: existing } = await context.supabase
      .from("assumptions").select("*").eq("project_id", data.project_id);
    const existingByKey = new Map((existing ?? []).map((a) => [a.field_key, a]));
    const seenKeys = new Set<string>();

    for (const item of extracted) {
      const def = ASSUMPTION_BY_KEY[item.field_key];
      seenKeys.add(item.field_key);
      const srcDoc = item.source_doc_name ? docByName.get(item.source_doc_name) : null;
      const band = bandFor(item.confidence_score);
      const prev = existingByKey.get(item.field_key);
      const payload = {
        project_id: data.project_id, owner_id: context.userId,
        field_key: def.key, field_label: def.label, category: def.category, unit: def.unit,
        value_numeric: def.numeric ? item.value_numeric ?? null : null,
        value_text: def.numeric ? null : item.value_text ?? null,
        status: "pending" as const, confidence_score: Math.round(item.confidence_score),
        confidence_band: band,
        source_document_id: srcDoc?.id ?? null,
        source_location: srcDoc?.name ?? null,
        source_text: item.source_text ?? null,
        ai_reasoning: item.ai_reasoning,
      };
      if (prev) {
        const newVer = prev.current_version + 1;
        const { data: upd } = await context.supabase.from("assumptions").update({
          ...payload, current_version: newVer,
        }).eq("id", prev.id).select().single();
        if (upd) await recordVersion(context, upd, "AI re-extraction", "AI Extraction");
      } else {
        const { data: ins } = await context.supabase.from("assumptions").insert(payload).select().single();
        if (ins) await recordVersion(context, ins, "Initial AI extraction", "AI Extraction");
      }
    }

    // Insert missing-status placeholders for required fields the AI didn't find
    for (const def of ASSUMPTION_DEFS) {
      if (seenKeys.has(def.key) || existingByKey.has(def.key)) continue;
      const { data: ins } = await context.supabase.from("assumptions").insert({
        project_id: data.project_id, owner_id: context.userId,
        field_key: def.key, field_label: def.label, category: def.category, unit: def.unit,
        status: "missing", confidence_score: 0, confidence_band: "missing",
        ai_reasoning: "Not mentioned in any uploaded document.",
      }).select().single();
      if (ins) await recordVersion(context, ins, "Created as missing", "AI Extraction");
    }

    await auditLog(context, data.project_id, "project", data.project_id, "extract_assumptions",
      { extracted: extracted.length, total: ASSUMPTION_DEFS.length });

    return { extracted: extracted.length, total: ASSUMPTION_DEFS.length };
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
    const patch: Record<string, unknown> = { current_version: newVer };
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
