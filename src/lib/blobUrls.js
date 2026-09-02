/** Paths this app writes to blob storage. Keep in lockstep with api/files.js. */
import { isAllowedInlineDataUrl } from "../../lib/allowedUploads.js";

export const BLOB_PATH_RE = /^(documents|images|recordings|video)\/[A-Za-z0-9._~%-]+$/;

export function isVercelBlobUrl(url) {
  try {
    return /\.blob\.vercel-storage\.com$/i.test(new URL(String(url || "")).hostname);
  } catch (err) {
    return false;
  }
}

/** Pull our pathname out of a Vercel blob URL so reads can go through /api/files. */
export function blobPathFromUrl(url) {
  try {
    const parsed = new URL(String(url || ""));
    if (!/\.blob\.vercel-storage\.com$/i.test(parsed.hostname)) return "";
    const path = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
    return BLOB_PATH_RE.test(path) ? path : "";
  } catch (err) {
    return "";
  }
}

/**
 * What may live on a record as fileUrl / imageUrl. Data URLs are the inline
 * fallback. Public blob URLs are never stored — they are durable and unauthenticated.
 */
export function storedInlineUrl(url, maxLength = 250000) {
  const value = String(url || "");
  if (!isAllowedInlineDataUrl(value)) return "";
  return value.length < maxLength ? value : "";
}

function redactUrlField(record, urlKey, pathKey) {
  const path = record[pathKey] || blobPathFromUrl(record[urlKey]);
  if (path) record[pathKey] = path;
  const url = record[urlKey];
  if (!url || String(url).startsWith("data:")) return;
  if (path || isVercelBlobUrl(url)) record[urlKey] = "";
}

/** Drop durable public blob URLs from a board record (and nested attachments). */
export function redactRecordBlobUrls(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return record;
  const next = { ...record };
  redactUrlField(next, "fileUrl", "filePath");
  redactUrlField(next, "imageUrl", "imagePath");
  redactUrlField(next, "videoUrl", "videoPath");
  redactUrlField(next, "audioUrl", "audioPath");
  if (Array.isArray(next.attachments)) {
    next.attachments = next.attachments.map((item) => redactRecordBlobUrls(item));
  }
  return next;
}
