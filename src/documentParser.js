import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url';
import mammoth from 'mammoth';

// The worker ships with the package and is bundled alongside the app. Loading it from a
// CDN instead would break PDF import offline, under a strict CSP, and on any version
// bump where the CDN path no longer matches.
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/**
 * Extracts plain text from an uploaded file (PDF, DOCX, DOC, Pages, TXT, MD)
 */
export async function parseDocumentFile(file) {
  const name = file.name;
  const ext = name.split('.').pop().toLowerCase();

  if (ext === 'pdf') {
    return await parsePDF(file);
  } else if (ext === 'docx') {
    return await parseDOCX(file);
  } else if (ext === 'doc' || ext === 'pages') {
    return await parseBinaryTextFallback(file);
  } else {
    // Plain text, Markdown, etc.
    return await parsePlainText(file);
  }
}

async function parsePDF(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const strings = content.items.map((item) => item.str);
      fullText += strings.join(' ') + '\n\n';
    }

    return fullText.trim() || 'No readable text could be extracted from PDF.';
  } catch (err) {
    console.warn('PDF parsing fallback', err);
    return await parseBinaryTextFallback(file);
  }
}

async function parseDOCX(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value.trim() || 'No text extracted from DOCX document.';
  } catch (err) {
    console.warn('DOCX parsing fallback', err);
    return await parseBinaryTextFallback(file);
  }
}

async function parsePlainText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result || '');
    reader.onerror = (e) => reject(e);
    reader.readAsText(file);
  });
}

async function parseBinaryTextFallback(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const raw = decoder.decode(arrayBuffer);

    // Extract human readable text strings (ASCII & UTF-8 words of length >= 3)
    const matches = raw.match(/[\x20-\x7E\s]{4,}/g);
    if (matches && matches.length > 0) {
      const cleaned = matches
        .map((m) => m.trim())
        .filter((m) => m.length > 4 && !/^[0-9\s\W]+$/.test(m))
        .slice(0, 150)
        .join('\n');

      return cleaned || `Extracted text preview from ${file.name}`;
    }

    return `Imported document: ${file.name}`;
  } catch (e) {
    return `Imported document: ${file.name}`;
  }
}
