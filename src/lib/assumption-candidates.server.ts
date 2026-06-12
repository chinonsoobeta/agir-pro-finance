// Stage 1 of the extraction pipeline: regex-driven candidate discovery.
// Scans raw document text and extracts every currency value, percentage,
// date, unit count, square footage, and other financial primitives along
// with surrounding context. Output is fed to Stage 2 (AI classification)
// and Stage 3 (alias mapping).

export type Candidate = {
  kind: "currency" | "percent" | "date" | "units" | "sf" | "ratio";
  value_numeric: number | null;
  value_text: string;
  unit: string;
  context: string; // ~160 chars around the match
  doc_name: string;
  // Nearby phrase (left of match) used as a label hint for alias mapping.
  label_hint: string;
};

const CURRENCY_RE = /(?:USD|US\$|CAD|\$)\s?([\d,]+(?:\.\d+)?)\s?(million|mm|m|billion|bn|b|k|thousand)?\b/gi;
const PERCENT_RE = /(\d+(?:\.\d+)?)\s?(?:%|percent|pct\b|bps)/gi;
const SF_RE = /([\d,]+(?:\.\d+)?)\s?(?:sq\.?\s?ft\.?|square\s?feet|sf)\b/gi;
const UNITS_RE = /([\d,]+)\s?(?:units|apartments|condos|keys|rooms|beds|stalls|spaces)\b/gi;
const DATE_RE = /\b(?:Q[1-4]\s?\d{4}|\d{4}-\d{2}-\d{2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s?\d{1,2}?,?\s?\d{4})\b/gi;
const RATIO_RE = /(\d+(?:\.\d+)?)\s?(?:x|×)\b/gi;

function scaleMultiplier(suffix?: string): number {
  if (!suffix) return 1;
  const s = suffix.toLowerCase();
  if (s.startsWith("b")) return 1_000_000_000;
  if (s === "mm" || s === "m" || s.startsWith("mil")) return 1_000_000;
  if (s === "k" || s.startsWith("thou")) return 1_000;
  return 1;
}

function context(text: string, idx: number, len: number, span = 80): string {
  const start = Math.max(0, idx - span);
  const end = Math.min(text.length, idx + len + span);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

function labelHint(text: string, idx: number, span = 60): string {
  const start = Math.max(0, idx - span);
  return text.slice(start, idx).replace(/\s+/g, " ").trim();
}

export function extractCandidates(docName: string, text: string): Candidate[] {
  const out: Candidate[] = [];
  const push = (c: Omit<Candidate, "doc_name">) => out.push({ ...c, doc_name: docName });

  for (const m of text.matchAll(CURRENCY_RE)) {
    const raw = m[1].replace(/,/g, "");
    const n = Number(raw);
    if (!isFinite(n)) continue;
    const value = n * scaleMultiplier(m[2]);
    push({
      kind: "currency", value_numeric: value, value_text: m[0], unit: "$",
      context: context(text, m.index ?? 0, m[0].length),
      label_hint: labelHint(text, m.index ?? 0),
    });
  }
  for (const m of text.matchAll(PERCENT_RE)) {
    const n = Number(m[1]);
    if (!isFinite(n)) continue;
    const isBps = /bps/i.test(m[0]);
    push({
      kind: "percent", value_numeric: isBps ? n / 100 : n, value_text: m[0], unit: "%",
      context: context(text, m.index ?? 0, m[0].length),
      label_hint: labelHint(text, m.index ?? 0),
    });
  }
  for (const m of text.matchAll(SF_RE)) {
    const n = Number(m[1].replace(/,/g, ""));
    if (!isFinite(n)) continue;
    push({
      kind: "sf", value_numeric: n, value_text: m[0], unit: "SF",
      context: context(text, m.index ?? 0, m[0].length),
      label_hint: labelHint(text, m.index ?? 0),
    });
  }
  for (const m of text.matchAll(UNITS_RE)) {
    const n = Number(m[1].replace(/,/g, ""));
    if (!isFinite(n)) continue;
    push({
      kind: "units", value_numeric: n, value_text: m[0], unit: "units",
      context: context(text, m.index ?? 0, m[0].length),
      label_hint: labelHint(text, m.index ?? 0),
    });
  }
  for (const m of text.matchAll(RATIO_RE)) {
    const n = Number(m[1]);
    if (!isFinite(n) || n > 20) continue;
    push({
      kind: "ratio", value_numeric: n, value_text: m[0], unit: "x",
      context: context(text, m.index ?? 0, m[0].length),
      label_hint: labelHint(text, m.index ?? 0),
    });
  }
  for (const m of text.matchAll(DATE_RE)) {
    push({
      kind: "date", value_numeric: null, value_text: m[0], unit: "date",
      context: context(text, m.index ?? 0, m[0].length),
      label_hint: labelHint(text, m.index ?? 0),
    });
  }
  // Cap to avoid runaway prompt size.
  return out.slice(0, 400);
}
