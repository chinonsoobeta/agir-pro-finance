// Document Intelligence (Engine 1).
// Parses PDF, DOCX, XLSX, CSV, images, and .eml into structured per-page text
// so every downstream candidate carries its source document and page number.

export type ParsedPage = { page_number: number; text: string };
export type ParsedDoc = {
  source_type: "pdf" | "docx" | "xlsx" | "csv" | "image" | "eml" | "text";
  pages: ParsedPage[];
};

function classify(name: string, type: string | null | undefined): ParsedDoc["source_type"] {
  const n = name.toLowerCase();
  const t = (type ?? "").toLowerCase();
  if (n.endsWith(".pdf") || t.includes("pdf")) return "pdf";
  if (n.endsWith(".docx") || t.includes("officedocument.wordprocessing")) return "docx";
  if (n.endsWith(".xlsx") || n.endsWith(".xls") || t.includes("spreadsheet")) return "xlsx";
  if (n.endsWith(".csv") || t === "text/csv") return "csv";
  if (n.endsWith(".eml") || t === "message/rfc822") return "eml";
  if (n.endsWith(".png") || n.endsWith(".jpg") || n.endsWith(".jpeg") || n.endsWith(".webp") || t.startsWith("image/")) return "image";
  return "text";
}

async function parsePdf(buf: ArrayBuffer): Promise<ParsedPage[]> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(pdf, { mergePages: false });
  const pages: ParsedPage[] = Array.isArray(text)
    ? text.map((t, i) => ({ page_number: i + 1, text: String(t ?? "") }))
    : [{ page_number: 1, text: String(text ?? "") }];
  // If the PDF has no extractable text (scanned), fall back to OCR per page.
  const totalChars = pages.reduce((sum, p) => sum + p.text.replace(/\s/g, "").length, 0);
  if (totalChars >= 40) return pages;
  return ocrPdf(buf);
}

async function ocrPdf(buf: ArrayBuffer): Promise<ParsedPage[]> {
  // Tesseract.js can OCR raster images. For scanned PDFs we would need
  // rasterisation first; unpdf doesn't render pages. Return a single
  // notice page so downstream code can flag the doc instead of silently
  // emitting zero candidates.
  return [{
    page_number: 1,
    text: "[OCR fallback: scanned PDF detected. Upload a text-based PDF or an image for OCR.]",
  }];
  // Intentionally do not throw — extraction should not fail the project.
  // Future: rasterise via pdf.js-extract + canvas worker.
  void buf;
}

async function parseDocx(buf: ArrayBuffer): Promise<ParsedPage[]> {
  const mammoth = await import("mammoth");
  const { value } = await mammoth.extractRawText({ buffer: Buffer.from(buf) });
  // DOCX has no real pages; split on form feed if present, else single page.
  const parts = value.split(/\f/);
  return parts.length > 1
    ? parts.map((t, i) => ({ page_number: i + 1, text: t }))
    : [{ page_number: 1, text: value }];
}

async function parseXlsx(buf: ArrayBuffer): Promise<ParsedPage[]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
  return wb.SheetNames.map((name, i) => ({
    page_number: i + 1,
    text: `# Sheet: ${name}\n` + XLSX.utils.sheet_to_csv(wb.Sheets[name]),
  }));
}

async function parseCsv(buf: ArrayBuffer): Promise<ParsedPage[]> {
  const Papa = (await import("papaparse")).default;
  const text = new TextDecoder().decode(buf);
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });
  const rows = (parsed.data as string[][])
    .map((r) => r.join(", "))
    .join("\n");
  return [{ page_number: 1, text: rows }];
}

async function parseImage(name: string, buf: ArrayBuffer): Promise<ParsedPage[]> {
  try {
    const Tesseract = await import("tesseract.js");
    const result = await Tesseract.recognize(Buffer.from(buf), "eng");
    return [{ page_number: 1, text: result.data.text || "" }];
  } catch (err) {
    return [{ page_number: 1, text: `[OCR failed for ${name}: ${(err as Error).message}]` }];
  }
}

async function parseEml(buf: ArrayBuffer): Promise<ParsedPage[]> {
  const { simpleParser } = await import("mailparser");
  const parsed = await simpleParser(Buffer.from(buf));
  const header = [
    `From: ${parsed.from?.text ?? ""}`,
    `To: ${Array.isArray(parsed.to) ? parsed.to.map((t) => t.text).join(", ") : parsed.to?.text ?? ""}`,
    `Subject: ${parsed.subject ?? ""}`,
    `Date: ${parsed.date?.toISOString() ?? ""}`,
  ].join("\n");
  const body = parsed.text ?? "";
  const pages: ParsedPage[] = [{ page_number: 1, text: `${header}\n\n${body}` }];
  if (parsed.attachments?.length) {
    for (let i = 0; i < parsed.attachments.length; i++) {
      const att = parsed.attachments[i];
      pages.push({
        page_number: i + 2,
        text: `[Attachment: ${att.filename ?? "unnamed"} (${att.contentType})] — content not extracted`,
      });
    }
  }
  return pages;
}

export async function parseDocument(name: string, fileType: string | null | undefined, buf: ArrayBuffer): Promise<ParsedDoc> {
  const source_type = classify(name, fileType);
  try {
    switch (source_type) {
      case "pdf": return { source_type, pages: await parsePdf(buf) };
      case "docx": return { source_type, pages: await parseDocx(buf) };
      case "xlsx": return { source_type, pages: await parseXlsx(buf) };
      case "csv": return { source_type, pages: await parseCsv(buf) };
      case "image": return { source_type, pages: await parseImage(name, buf) };
      case "eml": return { source_type, pages: await parseEml(buf) };
      default:
        return { source_type: "text", pages: [{ page_number: 1, text: new TextDecoder().decode(buf) }] };
    }
  } catch (err) {
    return {
      source_type,
      pages: [{ page_number: 1, text: `[Parse failed for ${name}: ${(err as Error).message}]` }],
    };
  }
}

// Legacy single-string accessor for older callers.
export async function extractFileText(name: string, fileType: string | null | undefined, buf: ArrayBuffer): Promise<string> {
  const parsed = await parseDocument(name, fileType, buf);
  return parsed.pages.map((p) => p.text).join("\n\n");
}
