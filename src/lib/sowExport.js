/**
 * Statement of Work PDF and Word export. Shares one content model so both
 * formats stay in sync with what the wizard preview shows.
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

function headerLines(payload) {
  const lines = [];
  if (payload.studioName) {
    lines.push(`Provider: ${payload.studioName} ("Matriarch")`);
  }
  if (payload.clientName) {
    lines.push(`Client: ${payload.clientName} ("Client")`);
  }
  if (payload.contactLine) lines.push(`Primary contact: ${payload.contactLine}`);
  if (payload.projectTitle) lines.push(`Project: ${payload.projectTitle}`);
  if (payload.value) lines.push(`Total approved budget: ${payload.value}`);
  if (payload.ownershipLabel) {
    lines.push(`Ownership model: [${payload.ownershipModel ? payload.ownershipLabel : "Client-Owned Production / Studio-Owned Production"}]`);
  }
  return lines;
}

/** Build a letter-sized PDF string for a Statement of Work. */
export function sowToPdf(draft) {
  const payload = sowExportPayload(draft);
  const pageW = 612;
  const pageH = 792;
  const margin = 54;
  const usable = pageW - margin * 2;
  const maxChars = Math.max(40, Math.floor(usable / 5.2));
  const lineH = 13;
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

  writeLines("/F2", 18, wrapLines(payload.title, Math.floor(maxChars * 0.7)), 10);
  writeLines("/F1", 10, headerLines(payload).flatMap((line) => wrapLines(line, maxChars)), 14);

  payload.sections.forEach((section, index) => {
    const heading = `${index + 1}. ${section.title}`;
    ensureSpace(40);
    writeLines("/F2", 12, wrapLines(heading, maxChars), 4);
    const bodyLines = wrapLines(section.body || " ", maxChars);
    writeLines("/F1", 10, bodyLines, 12);
  });

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
  if (!parts.length) return [new Paragraph({ children: [new TextRun({ text: " ", font: "Calibri", size: 22 })] })];
  return parts.map((line) => new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text: line || " ", font: "Calibri", size: 22 })],
  }));
}

/** Build a Word document blob for a Statement of Work. */
export async function sowToDocx(draft) {
  const payload = sowExportPayload(draft);
  const children = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      spacing: { after: 200 },
      children: [new TextRun({ text: payload.title, bold: true, font: "Calibri", size: 36 })],
    }),
  ];

  headerLines(payload).forEach((line) => {
    children.push(new Paragraph({
      spacing: { after: 60 },
      children: [new TextRun({ text: line, font: "Calibri", size: 20, color: "555555" })],
    }));
  });

  children.push(new Paragraph({ spacing: { after: 200 }, children: [] }));

  payload.sections.forEach((section, index) => {
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 240, after: 120 },
      children: [new TextRun({
        text: `${index + 1}. ${section.title}`,
        bold: true,
        font: "Calibri",
        size: 26,
      })],
    }));
    bodyParagraphs(section.body).forEach((p) => children.push(p));
  });

  const doc = new Document({
    styles: {
      default: {
        document: { run: { font: "Calibri", size: 22 } },
        title: {
          run: { font: "Calibri", size: 36, bold: true },
          paragraph: { spacing: { before: 0, after: 200 }, keepNext: true },
        },
        heading1: {
          run: { font: "Calibri", size: 26, bold: true },
          paragraph: { spacing: { before: 240, after: 120 }, keepNext: true },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 },
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
  downloadBlob(exportFilename(payload.title, "pdf"), blob);
  return blob;
}

export async function downloadSowDocx(draft) {
  const payload = sowExportPayload(draft);
  const blob = await sowToDocx(draft);
  downloadBlob(exportFilename(payload.title, "docx"), blob);
  return blob;
}

/** PDF File suitable for uploadFile when saving a draft agreement. */
export function sowPdfFile(draft) {
  const payload = sowExportPayload(draft);
  const pdf = sowToPdf(draft);
  const name = exportFilename(payload.title, "pdf");
  return new File([pdf], name, { type: "application/pdf" });
}
