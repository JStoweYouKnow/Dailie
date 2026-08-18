import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url';
import mammoth from 'mammoth';
import { buildFormats } from './lib/textFormats';

// The worker ships with the package and is bundled alongside the app. Loading it from a
// CDN instead would break PDF import offline, under a strict CSP, and on any version
// bump where the CDN path no longer matches.
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/**
 * Extracts an imported document into every variant the import dialog offers:
 * { markdown, text, compact, hasFormatting }.
 *
 * hasFormatting is false when the source is a flat string — a .txt file, or a binary
 * we could only scrape — so the dialog can explain why keeping formatting is not on
 * offer rather than presenting a choice that does nothing.
 */
export async function parseDocumentFile(file) {
  const ext = String(file.name || '').split('.').pop().toLowerCase();

  if (ext === 'pdf') return parsePDF(file);
  if (ext === 'docx') return parseDOCX(file);
  if (ext === 'md' || ext === 'markdown') return parseMarkdown(file);
  if (ext === 'doc' || ext === 'pages') return parseBinaryTextFallback(file);
  return parsePlainText(file);
}

/**
 * PDFs carry no structure, only positioned glyphs. Line breaks come from the text
 * layer's own end-of-line flags, and a run that is noticeably larger than the body
 * text is treated as a heading — enough to keep a document readable rather than
 * collapsing it into one wall of text.
 */
async function parsePDF(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    const lines = [];
    const heights = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      let current = { text: '', height: 0 };

      for (const item of content.items) {
        if (typeof item.str !== 'string') continue;
        const height = Math.abs(item.height || (item.transform ? item.transform[3] : 0)) || 0;
        current.text += item.str;
        current.height = Math.max(current.height, height);
        if (item.hasEOL) {
          if (current.text.trim()) {
            lines.push(current);
            if (current.height) heights.push(current.height);
          }
          current = { text: '', height: 0 };
        }
      }
      if (current.text.trim()) {
        lines.push(current);
        if (current.height) heights.push(current.height);
      }
      lines.push({ text: '', height: 0, pageBreak: true });
    }

    // Body size is the most common line height; anything much larger reads as a heading.
    const bodyHeight = medianOf(heights);
    const markdown = [];
    const plain = [];

    for (const line of lines) {
      const text = line.text.replace(/\s+/g, ' ').trim();
      if (!text) {
        if (markdown[markdown.length - 1] !== '') markdown.push('');
        if (plain[plain.length - 1] !== '') plain.push('');
        continue;
      }
      plain.push(text);
      const ratio = bodyHeight ? line.height / bodyHeight : 1;
      if (ratio >= 1.45 && text.length < 90) markdown.push(`## ${text}`);
      else if (ratio >= 1.18 && text.length < 90) markdown.push(`### ${text}`);
      else if (/^\s*[•·▪]\s*/.test(line.text)) markdown.push(line.text.replace(/^\s*[•·▪]\s*/, '- ').trim());
      else markdown.push(text);
    }

    const hasHeadings = markdown.some((l) => l.startsWith('#') || l.startsWith('- '));
    const built = buildFormats({
      markdown: markdown.join('\n'),
      text: plain.join('\n'),
      hasFormatting: hasHeadings,
    });
    if (!built.text) return buildFormats({ text: 'No readable text could be extracted from this PDF.', hasFormatting: false });
    return built;
  } catch (err) {
    console.warn('PDF parsing fallback', err);
    return parseBinaryTextFallback(file);
  }
}

async function parseDOCX(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    // Word actually carries structure, so this is the one format where "keep
    // formatting" preserves real headings, emphasis, lists and tables.
    const [rich, raw] = await Promise.all([
      mammoth.convertToMarkdown({ arrayBuffer }),
      mammoth.extractRawText({ arrayBuffer }),
    ]);
    const markdown = (rich.value || '').trim();
    const text = (raw.value || '').trim();
    if (!markdown && !text) {
      return buildFormats({ text: 'No text could be extracted from this document.', hasFormatting: false });
    }
    return buildFormats({ markdown, text, hasFormatting: !!markdown });
  } catch (err) {
    console.warn('DOCX parsing fallback', err);
    return parseBinaryTextFallback(file);
  }
}

async function parseMarkdown(file) {
  const raw = await readText(file);
  return buildFormats({ markdown: raw, hasFormatting: true });
}

async function parsePlainText(file) {
  const raw = await readText(file);
  return buildFormats({ text: raw, hasFormatting: false });
}

function readText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result || '');
    reader.onerror = (e) => reject(e);
    reader.readAsText(file);
  });
}

function medianOf(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** Legacy .doc and .pages are binary; only loose strings can be scraped out. */
async function parseBinaryTextFallback(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const raw = decoder.decode(arrayBuffer);

    const matches = raw.match(/[\x20-\x7E\s]{4,}/g);
    if (matches && matches.length > 0) {
      const cleaned = matches
        .map((m) => m.trim())
        .filter((m) => m.length > 4 && !/^[0-9\s\W]+$/.test(m))
        .slice(0, 150)
        .join('\n');
      if (cleaned) return buildFormats({ text: cleaned, hasFormatting: false });
    }
    return buildFormats({ text: `Imported document: ${file.name}`, hasFormatting: false });
  } catch (e) {
    return buildFormats({ text: `Imported document: ${file.name}`, hasFormatting: false });
  }
}
