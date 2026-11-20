/**
 * Statement of Work PDF and Word export. Matches the official Matriarch labeled
 * SOW layout: party preamble, then editable labeled sections, then a USD note.
 */

import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";
import { sowExportPayload } from "./model.js";
import { downloadBlob, exportFilename } from "./tableExport.js";

function toWinAnsi(text) {
  const map = {
    "\u2018": "'", "\u2019": "'", "\u201C": '"', "\u201D": '"',
    "\u2013": "-", "\u2014": "-", "\u2026": "...", "\u00A0": " ",
  };
  let out = "";
  for (const ch of String(text || "")) {
    if (map[ch]) { out += map[ch]; continue; }
    const c = ch.charCodeAt(0);
    if (c === 10 || c === 13) { out += "\n"; continue; }
    if (c === 9) { out += " "; continue; }
    if (c >= 32 && c <= 126) { out += ch; continue; }
    if (c >= 160 && c <= 255) { out += ch; continue; }
    out += "?";
  }
  return out;
}

function pdfLiteral(text) {
  let s = "";
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 92) s += "\\\\";
    else if (c === 40) s += "\\(";
    else if (c === 41) s += "\\)";
    else if (c < 32 || c > 126) s += `\\${c.toString(8).padStart(3, "0")}`;
    else s += text[i];
  }
  return `(${s})`;
}

function wrapLines(text, maxChars) {
  const limit = Math.max(20, maxChars);
  const paragraphs = toWinAnsi(text).split(/\n/);
  const lines = [];
  paragraphs.forEach((para, pi) => {
    if (pi > 0) lines.push("");
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) {
      if (!para) return;
      lines.push("");
      return;
    }
    let cur = "";
    words.forEach((word) => {
      const next = cur ? `${cur} ${word}` : word;
      if (next.length > limit && cur) {
        lines.push(cur);
        cur = word.length > limit ? word.slice(0, limit) : word;
      } else {
        cur = next;
      }
    });
    if (cur) lines.push(cur);
  });
  return lines.length ? lines : [""];
}

function pdfObjects(parts) {
  let offset = 0;
  const chunks = ["%PDF-1.4\n"];
  offset = chunks[0].length;
  const xref = [0];
  parts.forEach((body, i) => {
    xref[i + 1] = offset;
    const obj = `${i + 1} 0 obj\n${body}\nendobj\n`;
    chunks.push(obj);
    offset += obj.length;
  });
  const xrefStart = offset;
  let xrefBlock = `xref\n0 ${parts.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= parts.length; i++) {
    xrefBlock += `${String(xref[i]).padStart(10, "0")} 00000 n \n`;
  }
  chunks.push(xrefBlock);
  chunks.push(`trailer\n<< /Size ${parts.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);
  return chunks.join("");
}

function partyPreamble(payload) {
  return [
    payload.studioParty,
    payload.clientParty,
  ].filter(Boolean);
}

/** Build a letter-sized PDF string for a Statement of Work. */
export function sowToPdf(draft) {
  const payload = sowExportPayload(draft);
  const pageW = 612;
  const pageH = 792;
  const margin = 54;
  const usable = pageW - margin * 2;
  const maxChars = Math.max(40, Math.floor(usable / 5.2));
  const stamped = new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

  const pages = [];
  const startPage = () => {
    const cmds = [];
    cmds.push("BT");
    cmds.push("/F1 8 Tf");
    cmds.push(`1 0 0 1 ${margin} ${margin - 18} Tm`);
    cmds.push(`${pdfLiteral(toWinAnsi(`Dailie · ${stamped}`))} Tj`);
    cmds.push("ET");
    return { cmds, y: pageH - margin };
  };

  let page = startPage();
  pages.push(page);

  const ensureSpace = (needed) => {
    if (page.y - needed >= margin + 24) return;
    page = startPage();
    pages.push(page);
  };

  const writeLines = (font, size, lines, gapAfter = 6) => {
    lines.forEach((line) => {
      ensureSpace(size + 4);
      page.cmds.push("BT");
      page.cmds.push(`${font} ${size} Tf`);
      page.cmds.push(`1 0 0 1 ${margin} ${page.y - size} Tm`);
      page.cmds.push(`${pdfLiteral(line)} Tj`);
      page.cmds.push("ET");
      page.y -= size + 3;
    });
    page.y -= gapAfter;
  };

  writeLines("/F2", 16, wrapLines(payload.title, Math.floor(maxChars * 0.8)), 8);
  writeLines("/F1", 10, partyPreamble(payload).flatMap((line) => wrapLines(line, maxChars)), 12);

  payload.sections.forEach((section) => {
    if (section.key === "signatures") {
      ensureSpace(40);
      writeLines("/F2", 11, wrapLines(section.title, maxChars), 4);
      writeLines("/F1", 10, wrapLines(section.body || " ", maxChars), 12);
      return;
    }
    ensureSpace(40);
    writeLines("/F2", 11, wrapLines(section.title, maxChars), 2);
    writeLines("/F1", 10, wrapLines(section.body || " ", maxChars), 10);
  });

  if (payload.footerNote) {
    writeLines("/F1", 9, wrapLines(payload.footerNote, maxChars), 4);
  }

  const fontRegular = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  const fontBold = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";
  const pageCount = pages.length;
  const pageIds = pages.map((_, i) => `${5 + i} 0 R`).join(" ");
  const pagesDict = `<< /Type /Pages /Count ${pageCount} /Kids [${pageIds}] >>`;
  const catalog = "<< /Type /Catalog /Pages 2 0 R >>";
  const pageDefs = pages.map((_, i) => (
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${5 + pageCount + i} 0 R >>`
  ));
  const contents = pages.map((p) => {
    const stream = p.cmds.join("\n");
    return `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });
  return pdfObjects([catalog, pagesDict, fontRegular, fontBold, ...pageDefs, ...contents]);
}

function bodyParagraphs(text) {
  const parts = String(text || "").split(/\n/);
  if (!parts.length) return [new Paragraph({ children: [new TextRun({ text: " ", font: "Times New Roman", size: 22 })] })];
  return parts.map((line) => new Paragraph({
    spacing: { after: 80 },
    children: [new TextRun({ text: line || " ", font: "Times New Roman", size: 22 })],
  }));
}

/** Build a Word document blob for a Statement of Work. */
export async function sowToDocx(draft) {
  const payload = sowExportPayload(draft);
  const children = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      spacing: { after: 160 },
      children: [new TextRun({ text: payload.title, bold: true, font: "Times New Roman", size: 32 })],
    }),
  ];

  partyPreamble(payload).forEach((line) => {
    children.push(new Paragraph({
      spacing: { after: 60 },
      children: [new TextRun({ text: line, font: "Times New Roman", size: 20 })],
    }));
  });

  children.push(new Paragraph({ spacing: { after: 160 }, children: [] }));

  payload.sections.forEach((section) => {
    children.push(new Paragraph({
      spacing: { before: 180, after: 60 },
      children: [new TextRun({
        text: section.title,
        bold: true,
        font: "Times New Roman",
        size: 22,
      })],
    }));
    bodyParagraphs(section.body).forEach((p) => children.push(p));
  });

  if (payload.footerNote) {
    children.push(new Paragraph({
      spacing: { before: 200 },
      children: [new TextRun({ text: payload.footerNote, italics: true, font: "Times New Roman", size: 18 })],
    }));
  }

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: "Times New Roman", size: 22 } },
        title: {
          run: { font: "Times New Roman", size: 32, bold: true },
          paragraph: { spacing: { before: 0, after: 160 }, keepNext: true },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1008, right: 1008, bottom: 1008, left: 1008 },
        },
      },
      children,
    }],
  });

  return Packer.toBlob(doc);
}

export function downloadSowPdf(draft) {
  const payload = sowExportPayload(draft);
  const pdf = sowToPdf(draft);
  const blob = new Blob([pdf], { type: "application/pdf" });
  downloadBlob(exportFilename(payload.projectTitle || payload.title, "pdf"), blob);
  return blob;
}

export async function downloadSowDocx(draft) {
  const payload = sowExportPayload(draft);
  const blob = await sowToDocx(draft);
  downloadBlob(exportFilename(payload.projectTitle || payload.title, "docx"), blob);
  return blob;
}

/** PDF File suitable for uploadFile when saving a draft agreement. */
export function sowPdfFile(draft) {
  const payload = sowExportPayload(draft);
  const pdf = sowToPdf(draft);
  const name = exportFilename(payload.projectTitle || payload.title, "pdf");
  return new File([pdf], name, { type: "application/pdf" });
}
