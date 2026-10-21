import { redactRecordBlobUrls, storedInlineUrl } from "./blobUrls.js";
import { safeHref } from "./safeUrl.js";

/** Matches the client chunk size in convexBoard.jsx. */
export const MAX_PUT_MANY = 200;
export const MAX_MERGE_PER_COLLECTION = 400;
export const MAX_RECORD_JSON_BYTES = 350_000;
export const MAX_WORKSPACE_JSON_BYTES = 200_000;
export const MAX_BOARD_GET_PER_COLLECTION = 2500;
export const MAX_MEMBERS = 250;

const URL_KEYS = new Set(["fileUrl", "imageUrl", "videoUrl", "audioUrl", "link", "url", "href", "website"]);

export function sanitizeStoredUrl(value) {
  const s = String(value || "");
  if (!s) return "";
  if (s.startsWith("data:")) return storedInlineUrl(s);
  if (s.startsWith("/api/files")) return s;
  return safeHref(s);
}

function sanitizeUrlKeys(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return record;
  const next = { ...record };
  for (const key of URL_KEYS) {
    if (typeof next[key] === "string") next[key] = sanitizeStoredUrl(next[key]);
  }
  if (Array.isArray(next.attachments)) {
    next.attachments = next.attachments.map(sanitizeUrlKeys);
  }
  return next;
}

/** Drop undefined, public blob URLs, and javascript: links; cap payload size. */
export function prepareRecordWrite(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new Error("Record must be an object.");
  }
  const data = sanitizeUrlKeys(redactRecordBlobUrls(JSON.parse(JSON.stringify(record))));
  if (JSON.stringify(data).length > MAX_RECORD_JSON_BYTES) {
    throw new Error("That record is too large to store.");
  }
  return data;
}

export function prepareWorkspaceValue(value) {
  const data = JSON.parse(JSON.stringify(value ?? null));
  if (JSON.stringify(data).length > MAX_WORKSPACE_JSON_BYTES) {
    throw new Error("That workspace document is too large to store.");
  }
  return data;
}

export function assertPutManySize(records) {
  if (!Array.isArray(records)) throw new Error("Records must be an array.");
  if (records.length > MAX_PUT_MANY) {
    throw new Error(`At most ${MAX_PUT_MANY} records per write.`);
  }
}
