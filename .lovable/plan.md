# Rebuild Plan — Phase 1: Data Foundations

You approved phased delivery, a clean data wipe, real OCR/DOCX/email support, and deterministic-only decisions. This plan covers **Phase 1 only**. Phases 2 and 3 are listed at the bottom so you know what's next, but I will not start them until you approve Phase 1.

## Phase 1 Scope

Build the data spine that every later engine reads from. After Phase 1, the app will extract, classify, reconcile, and validate — but underwriting, scenarios, and the decision engine will still be running on the current implementation until Phase 2.

### 1. Canonical Assumption Dictionary

Rewrite `src/lib/assumption-taxonomy.ts` to match your 8 categories:

```text
ACQUISITION    land_cost, acquisition_costs, closing_costs, due_diligence_costs
CONSTRUCTION   hard_costs, soft_costs, financing_costs, contingency,
               construction_duration, construction_start, construction_completion
FINANCING      debt_amount, preferred_equity, common_equity, interest_rate,
               loan_term, amortization, ltc, ltv, dscr_requirement
REVENUE        unit_count, unit_mix, average_rent, occupancy, rent_growth,
               lease_up_period
OPERATING      expense_ratio, property_taxes, insurance, utilities,
               maintenance, management_fee, replacement_reserve
EXIT           exit_cap_rate, hold_period, disposition_costs, terminal_value
MARKET         vacancy_rate, population_growth, employment_growth, market_rent_growth
RISK           environmental_reserve, delay_contingency, tax_reassessment, capex_reserve
```

Each definition carries `unit`, `numeric`, `required`, and a rich `aliases` list for Stage-3 mapping. Required set matches your spec exactly (land_cost, hard_costs, soft_costs, debt_amount, equity_amount, interest_rate, occupancy, expense_ratio, exit_cap_rate, hold_period).

### 2. Document Intelligence (Engine 1)

`src/lib/document-text.server.ts` gains:

- **PDF**: keep `unpdf`, but also emit per-page text so candidates can store `page_number`.
- **XLSX/CSV**: per-sheet parsing (existing) + CSV via `papaparse`.
- **DOCX**: add `mammoth` (`bun add mammoth`).
- **EML**: add `mailparser` (`bun add mailparser`) — extract subject, from, body, and recurse into attachments.
- **Images / scanned PDF**: add `tesseract.js` (`bun add tesseract.js`) for OCR. PDFs detected as image-only (no extractable text) get OCR per page.

Returns a structured `ParsedDoc { pages: { page_number, text }[], tables: [], source_type }`.

### 3. Candidate Extraction (Engine 2)

Refactor `assumption-candidates.server.ts` so every candidate carries:

```ts
{
  candidate_id, kind, value_numeric, value_text, unit,
  source_text,        // the exact matched substring
  source_context,     // ±160 chars
  document_id, page_number, source_type,
  label_hint, confidence, extracted_at
}
```

No classification yet — just typed primitives.

### 4. Schema Migration (clean wipe)

One migration:

- `TRUNCATE assumptions, assumption_history, assumption_versions, assumption_comments, financial_outputs, decision_logs, scenarios, risk_register, audit_logs RESTART IDENTITY CASCADE;`
- New table `assumption_candidates` (candidate_id PK, project_id, document_id, page_number, kind, value_numeric, value_text, unit, source_text, source_context, label_hint, confidence, canonical_key nullable, classification_status, created_at). GRANTs + RLS scoped to project owner.
- New table `assumption_conflicts` (id, project_id, canonical_key, status `open|resolved|dismissed`, resolution_value, resolution_source, resolved_by, resolved_at, created_at). GRANTs + RLS.
- `assumptions` gains columns: `source_document_id`, `source_page_number`, `source_text`, `confidence`, `version`, `reviewer_id`, plus `status` enum widened to include `extracted | classified | conflicting | approved | rejected | missing`.

### 5. Reconciliation Engine (Engine 4)

`src/lib/reconciliation.server.ts`:

- Group classified candidates by `canonical_key`.
- If multiple distinct numeric values exist for one key, create an `assumption_conflicts` row with every contributing source listed; mark assumption as `conflicting`.
- Never auto-resolve. Underwriting is blocked while any required-key conflict is `open`.

### 6. Validation Engine (Engine 5)

`src/lib/validation.ts` exposes `getValidationReport(projectId)`:

```ts
{
  required: { key, status, source_document_id?, page_number? }[],
  optional: [...],
  coverage_pct,           // approved required / total required
  missing_required: string[],
  conflicts_open: number,
  confidence_score,       // mean of approved required confidences
  ready_for_underwriting: boolean
}
```

### 7. Reconciliation + Validation UI

Update `src/components/assumption-review.tsx`:

- New "Conflicts" section listing every open conflict with all candidate values, source doc + page, and an explicit "Use this value" action per candidate (writes resolution to `assumption_conflicts` + promotes the chosen candidate to the canonical assumption).
- Existing review center shows status badges: `extracted`, `classified`, `conflicting`, `approved`, `missing`.
- Per-assumption "Source" link — opens document at the cited page.

## What Phase 1 explicitly does NOT do

These come next, in order, after you approve Phase 1:

- **Phase 2** — Deterministic Finance Engine rewrite (formula registry with per-metric inputs/outputs/audit rows in `financial_outputs`), per-metric "Show calculation" with source-document drill-through, removal of every remaining placeholder path.
- **Phase 3** — Scenario engine (Revenue Downside, Occupancy Shock, Cost Overrun, Rate Shock, Cap Expansion, Combined Stress), Assumption Impact ranking, deterministic Decision Engine (Approve / Approve w/ Conditions / Reject driven by coverage %, conflicts, DSCR, profit margin, stress outcomes), and the four Debug Consoles (Extraction, Mapping, Validation, Financial Engine).

## Technical Notes

- Wipe is destructive. After Phase 1 migration runs, all current assumptions/outputs/decisions are gone — confirmed by your "Wipe and start clean" choice.
- New deps: `mammoth`, `mailparser`, `tesseract.js`, `papaparse`. `tesseract.js` ships WASM that works in the Cloudflare Worker runtime; OCR will be slower than text PDFs (~3–6s/page).
- All extraction work stays inside `createServerFn` handlers; no Edge Functions added.
- Storage bucket `documents` already exists; no bucket changes.

## Deliverable for Phase 1

After approval and migration, you will have:

1. A canonical dictionary covering all 8 categories.
2. Document parsing that handles PDF (text + OCR fallback), DOCX, XLSX, CSV, images, and `.eml`.
3. Candidate rows in the DB with full provenance (`document_id`, `page_number`, `source_text`).
4. Conflict rows surfaced in the UI; underwriting blocked while conflicts are open.
5. A validation report endpoint and UI showing coverage %, missing required, open conflicts, confidence score.

Approve to proceed with Phase 1, or tell me what to change.