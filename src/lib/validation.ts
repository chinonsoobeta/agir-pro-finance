// Engine 5 — Underwriting Validation report.
// Pure function over assumption + conflict rows; safe for client and server.

import { ASSUMPTION_BY_KEY, REQUIRED_KEYS, OPTIONAL_KEYS } from "./assumption-taxonomy";

export type AssumptionRow = {
  field_key: string;
  status: string;
  confidence_score: number | null;
  source_document_id: string | null;
  source_page_number: number | null;
};

export type ConflictRow = {
  canonical_key: string;
  status: string;
};

export type ValidationReport = {
  required: ValidationItem[];
  optional: ValidationItem[];
  coverage_pct: number;
  missing_required: string[];
  conflicting_required: string[];
  conflicts_open: number;
  confidence_score: number;
  ready_for_underwriting: boolean;
};

export type ValidationItem = {
  key: string;
  label: string;
  status: "approved" | "conflicting" | "pending" | "missing" | "extracted" | "classified" | "rejected" | string;
  confidence: number;
  source_document_id: string | null;
  source_page_number: number | null;
};

export function getValidationReport(
  assumptions: AssumptionRow[],
  conflicts: ConflictRow[],
): ValidationReport {
  const byKey = new Map(assumptions.map((a) => [a.field_key, a]));
  const openConflictKeys = new Set(
    conflicts.filter((c) => c.status === "open").map((c) => c.canonical_key),
  );

  const toItem = (key: string): ValidationItem => {
    const def = ASSUMPTION_BY_KEY[key];
    const row = byKey.get(key);
    const inConflict = openConflictKeys.has(key);
    const status = inConflict ? "conflicting" : (row?.status ?? "missing");
    return {
      key,
      label: def?.label ?? key,
      status,
      confidence: row?.confidence_score ?? 0,
      source_document_id: row?.source_document_id ?? null,
      source_page_number: row?.source_page_number ?? null,
    };
  };

  const required = REQUIRED_KEYS.map(toItem);
  const optional = OPTIONAL_KEYS.map(toItem);

  const approvedRequired = required.filter((i) => i.status === "approved");
  const missing_required = required.filter((i) => i.status === "missing").map((i) => i.label);
  const conflicting_required = required.filter((i) => i.status === "conflicting").map((i) => i.label);

  const coverage_pct = Math.round((approvedRequired.length / required.length) * 100);
  const conflicts_open = conflicts.filter((c) => c.status === "open").length;
  const confidence_score = approvedRequired.length
    ? Math.round(approvedRequired.reduce((s, i) => s + i.confidence, 0) / approvedRequired.length)
    : 0;

  return {
    required,
    optional,
    coverage_pct,
    missing_required,
    conflicting_required,
    conflicts_open,
    confidence_score,
    ready_for_underwriting:
      missing_required.length === 0 && conflicting_required.length === 0,
  };
}
