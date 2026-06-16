// Engine 2 — candidate extraction.
// Pulls every numeric/date primitive out of a parsed document, tagging
// each candidate with its document, page number, source text, and
// surrounding context. No classification happens here.

import type { ParsedDoc } from "./document-text.server";

export type CandidateKind = "currency" | "percent" | "date" | "units" | "sf" | "ratio";

export type Candidate = {
  kind: CandidateKind;
  value_numeric: number | null;
  value_text: string;
  unit: string;
  source_text: string;     // exact matched substring
  source_context: string;  // ±160 chars around the match
  label_hint: string;      // phrase to the left, used as alias hint
  document_id: string;
  document_name: string;
  page_number: number;
  source_type: ParsedDoc["source_type"];
  confidence: number;
};

const CURRENCY_RE = /(?:USD|US\$|CAD|\$)\s?([\d,]+(?:\.\d+)?)\s?(million|mm|m|billion|bn|b|k|thousand)?\b/gi;
const PERCENT_RE = /(\d+(?:\.\d+)?)\s?(?:%|percent|pct\b|bps)/gi;
const SF_RE = /([\d,]+(?:\.\d+)?)\s?(?:sq\.?\s?ft\.?|square\s?feet|sf)\b/gi;
const UNITS_RE = /([\d,]+)\s?(?:units|apartments|condos|keys|rooms|beds|stalls|spaces)\b/gi;
const DATE_RE = /\b(?:Q[1-4]\s?\d{4}|\d{4}-\d{2}-\d{2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s?\d{1,2}?,?\s?\d{4})\b/gi;
const RATIO_RE = /(\d+(?:\.\d+)?)\s?(?:x|×)\b/gi;

function scale(suffix?: string): number {
  if (!suffix) return 1;
  const s = suffix.toLowerCase();
  if (s.startsWith("b")) return 1_000_000_000;
  if (s === "mm" || s === "m" || s.startsWith("mil")) return 1_000_000;
  if (s === "k" || s.startsWith("thou")) return 1_000;
  return 1;
}

function ctx(text: string, idx: number, len: number, span = 160): string {
  const start = Math.max(0, idx - span);
  const end = Math.min(text.length, idx + len + span);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

function hint(text: string, idx: number, span = 80): string {
  const start = Math.max(0, idx - span);
  return text.slice(start, idx).replace(/\s+/g, " ").trim();
}

export function extractCandidatesFromDoc(
  doc: { id: string; name: string },
  parsed: ParsedDoc,
): Candidate[] {
  const out: Candidate[] = [];
  for (const page of parsed.pages) {
    const t = page.text;
    if (!t || t.length < 4) continue;
    const push = (c: Omit<Candidate, "document_id" | "document_name" | "page_number" | "source_type">) =>
      out.push({ ...c, document_id: doc.id, document_name: doc.name, page_number: page.page_number, source_type: parsed.source_type });

    for (const m of t.matchAll(CURRENCY_RE)) {
      const n = Number(m[1].replace(/,/g, ""));
      if (!isFinite(n)) continue;
      push({ kind: "currency", value_numeric: n * scale(m[2]), value_text: m[0], unit: "$",
        source_text: m[0], source_context: ctx(t, m.index ?? 0, m[0].length),
        label_hint: hint(t, m.index ?? 0), confidence: 70 });
    }
    for (const m of t.matchAll(PERCENT_RE)) {
      const n = Number(m[1]);
      if (!isFinite(n)) continue;
      const isBps = /bps/i.test(m[0]);
      push({ kind: "percent", value_numeric: isBps ? n / 100 : n, value_text: m[0], unit: "%",
        source_text: m[0], source_context: ctx(t, m.index ?? 0, m[0].length),
        label_hint: hint(t, m.index ?? 0), confidence: 70 });
    }
    for (const m of t.matchAll(SF_RE)) {
      const n = Number(m[1].replace(/,/g, ""));
      if (!isFinite(n)) continue;
      push({ kind: "sf", value_numeric: n, value_text: m[0], unit: "SF",
        source_text: m[0], source_context: ctx(t, m.index ?? 0, m[0].length),
        label_hint: hint(t, m.index ?? 0), confidence: 70 });
    }
    for (const m of t.matchAll(UNITS_RE)) {
      const n = Number(m[1].replace(/,/g, ""));
      if (!isFinite(n)) continue;
      push({ kind: "units", value_numeric: n, value_text: m[0], unit: "units",
        source_text: m[0], source_context: ctx(t, m.index ?? 0, m[0].length),
        label_hint: hint(t, m.index ?? 0), confidence: 70 });
    }
    for (const m of t.matchAll(RATIO_RE)) {
      const n = Number(m[1]);
      if (!isFinite(n) || n > 20) continue;
      push({ kind: "ratio", value_numeric: n, value_text: m[0], unit: "x",
        source_text: m[0], source_context: ctx(t, m.index ?? 0, m[0].length),
        label_hint: hint(t, m.index ?? 0), confidence: 60 });
    }
    for (const m of t.matchAll(DATE_RE)) {
      push({ kind: "date", value_numeric: null, value_text: m[0], unit: "date",
        source_text: m[0], source_context: ctx(t, m.index ?? 0, m[0].length),
        label_hint: hint(t, m.index ?? 0), confidence: 65 });
    }
  }
  return out;
}

// Backward-compat for previous regex-on-string extraction path.
export function extractCandidates(docName: string, text: string): Candidate[] {
  return extractCandidatesFromDoc(
    { id: "00000000-0000-0000-0000-000000000000", name: docName },
    { source_type: "text", pages: [{ page_number: 1, text }] },
  );
}
