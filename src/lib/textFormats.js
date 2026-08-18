/**
 * Imported text arrives in whatever shape its source had. These helpers derive the
 * three things a user might actually want from it — the formatting kept, the
 * formatting stripped, or the whole thing squashed into one paragraph — so the
 * import dialog can offer a real choice rather than silently flattening everything.
 */

export const IMPORT_FORMATS = [
  {
    key: "markdown",
    label: "Keep formatting",
    hint: "Headings, bold, lists and tables are preserved as Markdown.",
  },
  {
    key: "text",
    label: "Plain text",
    hint: "Styling removed, paragraphs and line breaks kept.",
  },
  {
    key: "compact",
    label: "One paragraph",
    hint: "All line breaks collapsed — good for a one-line log entry.",
  },
];

/** Strips Markdown syntax while keeping the words and the paragraph structure. */
export function markdownToPlainText(md) {
  return String(md || "")
    .replace(/^```[\s\S]*?^```$/gm, (block) => block.replace(/^```.*$/gm, "").trim())
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s*([-*+]|\d+\.)\s+/gm, "• ")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*\|.*\|\s*$/gm, (row) =>
      row.split("|").map((c) => c.trim()).filter(Boolean).join("  "))
    .replace(/^\s*[-:| ]+\s*$/gm, "")
    .replace(/\\([\\`*_{}\[\]()#+\-.!>~|])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Everything on one line — every run of whitespace becomes a single space. */
export function collapseWhitespace(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

export function normaliseBlankLines(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Builds the three variants from whatever the parser managed to recover.
 * `hasFormatting` is false when the source gave us nothing but a flat string, so the
 * dialog can say why "keep formatting" is unavailable instead of offering a no-op.
 */
export function buildFormats({ markdown, text, hasFormatting }) {
  const md = normaliseBlankLines(markdown || text || "");
  const plain = normaliseBlankLines(text || markdownToPlainText(md));
  return {
    markdown: md,
    text: plain,
    compact: collapseWhitespace(plain),
    hasFormatting: !!hasFormatting && md !== plain,
  };
}

export function pickFormat(formats, key) {
  if (!formats) return "";
  if (key === "markdown") return formats.markdown;
  if (key === "compact") return formats.compact;
  return formats.text;
}

/** True when the string carries Markdown worth rendering rather than showing raw. */
export function looksLikeMarkdown(value) {
  const s = String(value || "");
  if (!s) return false;
  return /^\s{0,3}#{1,6}\s+\S/m.test(s) ||
    /^\s*([-*+]|\d+\.)\s+\S/m.test(s) ||
    /(\*\*|__)[^\s*_][\s\S]*?\1/.test(s) ||
    /^\s*\|.+\|\s*$/m.test(s) ||
    /^\s{0,3}>\s+\S/m.test(s);
}
