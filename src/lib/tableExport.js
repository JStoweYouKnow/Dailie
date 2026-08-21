/**
 * Spreadsheet and printable-file exports of the tables on screen. CSV is for Excel /
 * Numbers; PDF is a self-contained file so the same rows can be opened without the app.
 */

import { formatFull, formatMoney, emailDomain } from "./format.js";
import { ndaFor } from "./model.js";

/** House addresses only — contractors on Gmail etc. can use the board, not take a copy. */
export const EXPORT_DOMAINS = ["matriarch-studios.com", "thewizardofops.app"];

export function canExportBoard(email) {
  const domain = emailDomain(email);
  if (!domain) return false;
  return EXPORT_DOMAINS.some((allowed) => domain === allowed || domain.endsWith(`.${allowed}`));
}

export function exportEmailFromSession({ authEnabled, account, currentUser } = {}) {
  if (authEnabled) return (account && account.email) || "";
  return (currentUser && currentUser.email) || "";
}

export function exportableColumns(columns) {
  return (columns || []).filter((c) => c && c.label);
}

function clean(value) {
  if (value == null) return "";
  return String(value).replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

function looksLikeTimestamp(n) {
  return typeof n === "number" && Number.isFinite(n) && n > 6e11 && n < 4e12;
}

function formatMaybeDate(value) {
  if (!value) return "";
  if (looksLikeTimestamp(value)) return formatFull(value);
  return clean(value);
}

function idNames(nameOf, ids) {
  if (!nameOf || !ids || !ids.length) return "";
  return ids.map((id) => nameOf(id)).filter(Boolean).join(", ");
}

export function cellText(column, row, ctx = {}) {
  if (!row) return "";
  if (typeof column.exportValue === "function") return clean(column.exportValue(row));
  const key = column.key;
  if (!key) return "";

  if (key === "company" || key === "vendor") return clean(ctx.companyName ? ctx.companyName(row.companyId) : "");
  if (key === "project") return clean(ctx.projectName ? ctx.projectName(row.projectId) : "");
  if (key === "owner") {
    const ids = row.ownerIds || (row.ownerId ? [row.ownerId] : []);
    return idNames(ctx.memberName, ids);
  }
  if (key === "team") return idNames(ctx.memberName, row.teamIds);
  if (key === "assignees") return idNames(ctx.memberName, row.assigneeIds);
  if (key === "who") return idNames(ctx.memberName, row.speakerIds || row.attendeeIds || row.talentIds);
  if (key === "due") return formatMaybeDate(row.dueDate || row.dueAt);
  if (key === "signed") return formatMaybeDate(row.signedAt);
  if (key === "expires") return formatMaybeDate(row.expiresAt);
  if (key === "updated") return formatMaybeDate(row.updatedAt);
  if (key === "last") return formatMaybeDate(row.lastContactAt || row.lastTouchedAt);
  if (key === "scheduled") return formatMaybeDate(row.scheduledFor || row.scheduledAt);
  if (key === "published") return formatMaybeDate(row.publishedAt);
  if (key === "paidAt") return formatMaybeDate(row.paidAt);
  if (key === "date") {
    const start = formatMaybeDate(row.startAt || row.startsAt || row.date);
    const end = formatMaybeDate(row.endAt);
    return end && end !== start ? `${start} – ${end}` : start;
  }
  if (key === "next") return clean(row.nextStep);
  if (key === "paid") return clean(row.paymentStatus);
  if (key === "pipeline") return clean(row.pipelineStage);
  if (key === "stage") return clean(row.stage);
  if (key === "type") return clean(row.recordType || row.kind || row.type);
  if (key === "file") {
    if (row.fileName) return clean(row.fileName);
    const files = (row.attachments || []).filter((a) => a && a.fileName && !a.deletedAt);
    return files.map((a) => a.fileName).join(", ");
  }
  if (key === "rate") return [row.rateAmount, row.rateUnit].filter(Boolean).join(" / ");
  if (key === "amount") {
    if (row.amount == null || row.amount === "") return "";
    return formatMoney(row.amount, row.currency || "USD");
  }
  if (key === "dir") return clean(row.direction);
  if (key === "people") return row.peopleCount != null ? String(row.peopleCount) : "";
  if (key === "projects") {
    if (row.projectCount != null) return String(row.projectCount);
    const assigned = (row.assignments || []).map((a) => (ctx.projectName ? ctx.projectName(a.projectId) : "")).filter(Boolean);
    return assigned.join(", ");
  }
  if (key === "nda") {
    if (!ctx.data) return "";
    const nda = ndaFor(ctx.data, row);
    return nda ? clean(nda.status) : "none";
  }
  if (key === "availability") return "";
  if (key === "source") return clean(row.source || "manual");
  if (key === "title") return clean(row.title || row.name || row.subject);
  if (key === "name") return clean(row.name || row.title);
  if (key === "value") return clean(row.value);
  if (key === "budget") return clean(row.budget);
  if (key === "kind") return clean(row.kind);
  if (key === "status") return clean(row.status);
  if (key === "priority") return clean(row.priority);
  if (key === "notes") return clean(row.notes || row.body);
  if (key === "email") return clean(row.email || row.from);
  if (key === "number") return clean(row.number);

  const direct = row[key];
  if (looksLikeTimestamp(direct)) return formatFull(direct);
  if (Array.isArray(direct)) return direct.map((item) => (typeof item === "string" ? item : "")).filter(Boolean).join(", ");
  if (direct && typeof direct === "object") return "";
  return clean(direct);
}

export function tableMatrix(columns, rows, ctx) {
  const cols = exportableColumns(columns);
  return {
    headers: cols.map((c) => clean(c.label)),
    body: (rows || []).map((row) => cols.map((c) => cellText(c, row, ctx))),
  };
}

export function escapeCsvField(value) {
  const text = value == null ? "" : String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function tableToCsv(columns, rows, ctx) {
  const { headers, body } = tableMatrix(columns, rows, ctx);
  const lines = [headers.map(escapeCsvField).join(",")];
  body.forEach((line) => { lines.push(line.map(escapeCsvField).join(",")); });
  return `\uFEFF${lines.join("\n")}`;
}

export function exportFilename(title, ext) {
  const slug = String(title || "table").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "table";
  return `dailie-${slug}-${new Date().toISOString().slice(0, 10)}.${ext}`;
}

export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function downloadTableCsv(title, columns, rows, ctx) {
  if (!canExportBoard(ctx && ctx.exportEmail)) return;
  const csv = tableToCsv(columns, rows, ctx);
  downloadBlob(exportFilename(title, "csv"), new Blob([csv], { type: "text/csv;charset=utf-8" }));
}

function toWinAnsi(text) {
  const map = {
    "\u2018": "'", "\u2019": "'", "\u201C": '"', "\u201D": '"',
    "\u2013": "-", "\u2014": "-", "\u2026": "...", "\u00A0": " ",
  };
  let out = "";
  for (const ch of String(text || "")) {
    if (map[ch]) { out += map[ch]; continue; }
    const c = ch.charCodeAt(0);
    if (c === 10 || c === 13 || c === 9) { out += " "; continue; }
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

function wrapCell(text, maxChars) {
  const limit = Math.max(6, maxChars);
  const words = toWinAnsi(text).split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines = [];
  let cur = "";
  words.forEach((word) => {
    const next = cur ? `${cur} ${word}` : word;
    if (next.length > limit && cur) {
      lines.push(cur);
      cur = word;
    } else {
      cur = next;
    }
  });
  if (cur) lines.push(cur);
  return lines.slice(0, 4);
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

export function tableToPdf(title, columns, rows, ctx) {
  const { headers, body } = tableMatrix(columns, rows, ctx);
  const pageW = 792;
  const pageH = 612;
  const margin = 36;
  const usable = pageW - margin * 2;
  const colCount = Math.max(1, headers.length);
  const colW = usable / colCount;
  const maxChars = Math.max(6, Math.floor(colW / 4.4));
  const lineH = 11;
  const headerH = 16;
  const stamped = new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });

  const pages = [];
  const startPage = () => {
    const cmds = [];
    cmds.push("BT");
    cmds.push("/F2 13 Tf");
    cmds.push(`1 0 0 1 ${margin} ${pageH - margin - 4} Tm`);
    cmds.push(`${pdfLiteral(toWinAnsi(title || "Export"))} Tj`);
    cmds.push("/F1 8 Tf");
    cmds.push(`0 -12 Td`);
    cmds.push(`${pdfLiteral(toWinAnsi(`${body.length} row${body.length === 1 ? "" : "s"} · ${stamped} · Dailie`))} Tj`);
    cmds.push("ET");
    return { cmds, y: pageH - margin - 28 };
  };

  const drawHeader = (page) => {
    let x = margin;
    page.cmds.push("BT");
    page.cmds.push("/F2 7 Tf");
    headers.forEach((h) => {
      page.cmds.push(`1 0 0 1 ${x + 2} ${page.y - 10} Tm`);
      page.cmds.push(`${pdfLiteral(wrapCell(h, maxChars)[0] || "")} Tj`);
      x += colW;
    });
    page.cmds.push("ET");
    page.cmds.push("0.75 0.75 0.72 RG");
    page.cmds.push("0.6 w");
    page.cmds.push(`${margin} ${page.y - headerH} m ${pageW - margin} ${page.y - headerH} l S`);
    page.y -= headerH + 4;
  };

  let page = startPage();
  drawHeader(page);
  pages.push(page);

  body.forEach((cells) => {
    const wrapped = cells.map((c) => wrapCell(c, maxChars));
    const rowLines = Math.max(1, ...wrapped.map((w) => w.length));
    const rowH = rowLines * lineH + 6;
    if (page.y - rowH < margin) {
      page = startPage();
      drawHeader(page);
      pages.push(page);
    }
    page.cmds.push("BT");
    page.cmds.push("/F1 8 Tf");
    wrapped.forEach((lines, i) => {
      lines.forEach((line, li) => {
        page.cmds.push(`1 0 0 1 ${margin + i * colW + 2} ${page.y - 10 - li * lineH} Tm`);
        page.cmds.push(`${pdfLiteral(line)} Tj`);
      });
    });
    page.cmds.push("ET");
    page.y -= rowH;
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

export function downloadTablePdf(title, columns, rows, ctx) {
  if (!canExportBoard(ctx && ctx.exportEmail)) return;
  const pdf = tableToPdf(title, columns, rows, ctx);
  downloadBlob(exportFilename(title, "pdf"), new Blob([pdf], { type: "application/pdf" }));
}
