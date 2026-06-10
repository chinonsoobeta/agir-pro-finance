// Server-only helpers for parsing uploaded documents into plain text.
// Used by analyzeDocument and the assumption extraction engine.

export async function pdfBufferToText(buf: ArrayBuffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : String(text ?? "");
}

export async function xlsxBufferToText(buf: ArrayBuffer): Promise<string> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
  const out: string[] = [];
  for (const name of wb.SheetNames) {
    out.push(`# Sheet: ${name}`);
    const ws = wb.Sheets[name];
    out.push(XLSX.utils.sheet_to_csv(ws));
  }
  return out.join("\n");
}

export async function extractFileText(name: string, fileType: string | null | undefined, buf: ArrayBuffer): Promise<string> {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf") || fileType?.includes("pdf")) return pdfBufferToText(buf);
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls") || fileType?.includes("sheet")) return xlsxBufferToText(buf);
  // Plain text fallback
  return new TextDecoder().decode(buf);
}
