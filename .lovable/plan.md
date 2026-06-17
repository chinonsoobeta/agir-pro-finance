# Phase 2 — Deterministic Finance Engine

Phase 1 (data spine) is live. Phase 2 replaces the current `computeMetrics` shortcut with a traceable, deterministic finance engine that reads only from approved assumptions and writes a full audit row for every metric.

## Goals

1. No metric is ever computed from raw project columns or fallback constants.
2. Every metric persists its formula, every input value, and the source assumption (with document + page) for each input.
3. The UI can drill from any number → formula → inputs → source document.
4. If any required input for a metric is missing or conflicting, the metric is **not** produced — the audit row records `status: blocked` with the missing keys.

## 1. Formula Registry — `src/lib/finance-formulas.ts`

A pure, typed registry. Each entry:

```ts
{
  metric_key: 'total_cost' | 'equity_requirement' | 'ltc' | 'ltv' | 'noi' |
              'annual_debt_service' | 'dscr' | 'profit' | 'profit_margin' |
              'yield_on_cost' | 'going_in_cap' | 'exit_value' | 'irr' | 'coc',
  label: string,
  unit: 'currency' | 'percent' | 'ratio' | 'multiple',
  inputs: CanonicalKey[],            // required assumption keys
  formula_text: string,              // human-readable formula
  compute: (inputs) => number        // pure fn, throws if any input missing
}
```

Initial registry covers: `total_cost`, `equity_requirement`, `ltc`, `ltv`, `annual_debt_service`, `noi`, `dscr`, `profit`, `profit_margin`, `yield_on_cost`, `exit_value`, `going_in_cap`. IRR and CoC are stubbed as `blocked` until a cashflow series exists (Phase 3).

## 2. Engine — `src/lib/finance-engine.server.ts`

`runFinanceEngine(projectId)`:

1. Load approved assumptions + open conflicts for the project.
2. Build a `Map<canonical_key, { value, assumption_id, source_document_id, source_page_number, confidence }>` from approved rows only. Conflicting/missing keys are excluded.
3. For each formula in the registry:
   - If any `inputs[]` key is missing from the map → write `financial_outputs` row with `status: 'blocked'`, `blocked_reason: 'missing_inputs'`, `missing_inputs: [...]`, `value: null`.
   - Otherwise compute, write `financial_outputs` row with `status: 'computed'`, `value`, `formula_text`, `inputs_used` (jsonb array of `{ key, value, assumption_id, source_document_id, source_page_number }`).
4. Replace prior outputs for the project in a single transaction (delete + insert).
5. Return `{ computed: n, blocked: n, total: n }`.

No fallback path. No `computeMetrics`. No "estimated" anything.

## 3. Schema Migration

Extend `financial_outputs` (already exists, 11 columns):

- add `metric_key text not null`
- add `formula_text text`
- add `inputs_used jsonb not null default '[]'`
- add `status text not null default 'computed'` — `computed | blocked`
- add `blocked_reason text`
- add `missing_inputs text[]`
- add `unit text`
- unique `(project_id, metric_key, version)` (version stays for history)

Truncate the table first (Phase 1 already wiped, but the new columns require it).

## 4. Server Functions — `src/lib/assumptions.functions.ts`

- `recomputeFinancials({ project_id })` — gated by `getValidationReport().ready_for_underwriting`. If not ready, returns `{ ok: false, reason, report }` without running the engine.
- `listFinancialOutputs({ project_id })` — returns rows including `inputs_used`, `formula_text`, `status`.

Remove the existing path that wrote synthesized outputs from `computeMetrics`.

## 5. UI — `src/components/underwriting-panel.tsx`

Rewrite the panel around the registry:

- **Top bar**: validation summary (coverage %, conflicts open, ready/blocked) + "Run finance engine" button (disabled when not ready).
- **Metrics grid**: one card per `metric_key`. Computed cards show the value + a "Show calculation" expander listing `formula_text`, each input (`label = value [from document, page N]`), and confidence.
- **Blocked cards**: shown explicitly with red badge and `missing_inputs` listed by canonical label. Never shown as zero or "—".
- **No more `computeMetrics` in this panel.**

`src/routes/_authenticated/projects.$id.tsx` overview tab keeps the metric tiles, but they now read from `financial_outputs` rows (status-aware) instead of `computeMetrics(project)`. A blocked metric renders as "Blocked — missing X" rather than `$0`.

## 6. Removal of placeholder finance

- Delete `src/lib/finance.ts` `computeMetrics` callers in production paths. Keep the file only if scenario/preview code still imports it; otherwise remove.
- `src/components/underwriting-panel.tsx`, `src/routes/_authenticated/projects.$id.tsx`, `src/routes/_authenticated/dashboard.tsx`, `src/routes/_authenticated/scenarios.tsx` — audit each call to `computeMetrics` and replace with engine outputs or hide the surface when not ready.

## 7. Audit surface

`AuditPanel` (already exists) gains a "Finance Engine Run" section listing the last run's `computed` / `blocked` rows with formula + inputs. This is the read-only audit view of `financial_outputs`.

## Out of scope (Phase 3)

- Scenario engine (downside / shock / stress).
- Assumption impact ranking.
- Decision engine (Approve / Conditions / Reject).
- Debug consoles (extraction / mapping / validation / engine).

## Migration order

1. Run schema migration (truncate + new columns).
2. Add `finance-formulas.ts` + `finance-engine.server.ts`.
3. Rewrite `recomputeFinancials` server fn.
4. Rewrite `underwriting-panel.tsx`; update overview/dashboard/scenarios to be status-aware.
5. Smoke test: upload a doc, approve assumptions, run engine, verify a blocked metric stays blocked and a computed metric shows its full citation chain.

Approve to start.
