/**
 * Attachments (NDAs, contracts, invoices, project stills) go to the blob store when one
 * is configured. Without it small files fall back to an inline data URL so the feature
 * still works on a plain `vite dev`, and anything large fails loudly rather than
 * silently blowing the localStorage quota.
 */

/**
 * `asAttachment` refuses to keep a data URL longer than this, so that a stored record
 * stays well inside Convex's 1 MB document limit.
 */
export const INLINE_URL_MAX = 250000;

/**
 * Largest file the inline fallback accepts. Base64 costs a third on top, so this has to
 * leave room under INLINE_URL_MAX: at the old 280 KB a data URL came out around 380 KB,
 * `asAttachment` dropped it, and the attachment was saved with neither a path nor a URL.
 */
const INLINE_LIMIT = 180 * 1024;

/** Ceiling for the buffered route, which passes the whole body through a function. */
const BUFFERED_LIMIT = 25 * 1024 * 1024;

/** Ceiling for direct-to-blob client uploads, which stream and use multipart. */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;

/** Anything above this skips the function entirely and streams straight to storage. */
const DIRECT_THRESHOLD = 4 * 1024 * 1024;

export function fileSrc(record) {
  if (!record) return "";
  const url = record.fileUrl || "";
  if (url.startsWith("https://") && url.includes("blob.vercel-storage.com") && !url.includes(".private.")) {
    return url;
  }
  if (record.filePath) return `/api/files?path=${encodeURIComponent(record.filePath)}`;
  return url;
}

/** Images, stills, kits, PDFs — what the press modal and similar pickers should allow. */
export const PRESS_FILE_ACCEPT = [
  "image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif", "image/heic", "image/heif", "image/*",
  ".png", ".jpg", ".jpeg", ".webp", ".gif", ".heic", ".heif",
  ".pdf", ".doc", ".docx", ".zip",
  "application/pdf", "application/zip", "application/x-zip-compressed",
].join(",");

export function kindForFile(file, fallback = "documents") {
  const type = (file && file.type) || "";
  const name = (file && file.name) || "";

  // A declared MIME type settles it, and has to be checked before the extension:
  // .webm is used for both audio and video, so matching on the name first filed every
  // audio recording the browser produced under `video/`.
  if (type.startsWith("image/")) return "images";
  if (type.startsWith("audio/")) return "recordings";
  if (type.startsWith("video/")) return "video";

  // No usable type — fall back to the extension.
  if (/\.(png|jpe?g|webp|gif|heic|heif)$/i.test(name)) return "images";
  if (/\.(mp3|wav|m4a)$/i.test(name)) return "recordings";
  if (/\.(mp4|mov|webm)$/i.test(name)) return "video";
  return fallback;
}

/** Shape stored on a record. Never keep a data URL big enough to blow Convex's 1 MB doc limit. */
export function asAttachment(meta, id) {
  const fileUrl = meta && meta.fileUrl && String(meta.fileUrl).length < INLINE_URL_MAX ? meta.fileUrl : "";
  return {
    id: id || (meta && meta.id) || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    fileName: (meta && meta.fileName) || "file",
    fileSize: Number(meta && meta.fileSize) || 0,
    fileType: (meta && meta.fileType) || "",
    filePath: (meta && meta.filePath) || "",
    fileUrl,
    uploadedAt: (meta && meta.uploadedAt) || Date.now(),
    // Set when the attachment is in the trash. The record still points at the blob, so
    // nothing is orphaned and the removal stays reversible until it is purged.
    deletedAt: Number(meta && meta.deletedAt) || null,
  };
}

/** Everything on the record, trashed included. Use this when rewriting the array. */
export function allAttachments(record) {
  if (!record) return [];
  const listed = Array.isArray(record.attachments)
    ? record.attachments.filter((a) => a && a.fileName)
    : [];
  if (listed.length) return listed.map((a) => asAttachment(a));
  if (record.fileName) return [asAttachment(record, record.id ? `${record.id}-file` : "legacy-file")];
  return [];
}

/** What the user should actually see attached. */
export function listAttachments(record) {
  return allAttachments(record).filter((a) => !a.deletedAt);
}

/** Removed, still restorable. */
export function trashedAttachments(record) {
  return allAttachments(record).filter((a) => a.deletedAt);
}

/** Move one attachment to the trash, leaving the blob alone. */
export function trashAttachment(record, item) {
  return allAttachments(record).map((a) => (a.id === item.id ? { ...a, deletedAt: Date.now() } : a));
}

/** Take it back out again. */
export function restoreAttachment(record, item) {
  return allAttachments(record).map((a) => (a.id === item.id ? { ...a, deletedAt: null } : a));
}

/**
 * The only thing that actually destroys a blob. Drops the entry as well, so the record
 * never keeps a pointer to something that is gone.
 */
export function purgeAttachment(record, item) {
  deleteFile(item);
  return allAttachments(record).filter((a) => a.id !== item.id);
}

export function imageSrc(record) {
  if (!record) return "";
  if (record.imagePath) return `/api/files?path=${encodeURIComponent(record.imagePath)}`;
  return record.imageUrl || "";
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.readAsDataURL(file);
  });
}

/**
 * Returns { fileName, fileSize, fileType, filePath, fileUrl } — filePath when the blob
 * store took it, fileUrl when it is inline.
 */
export async function uploadFile(file, kind = "documents", onProgress) {
  if (!file) throw new Error("No file selected.");
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`${file.name} is ${Math.round(file.size / (1024 * 1024))} MB. The limit is 2 GB.`);
  }
  kind = kindForFile(file, kind);

  const meta = {
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type || "application/octet-stream",
    filePath: "",
    fileUrl: "",
    uploadedAt: Date.now(),
  };

  // Used when the store simply is not there. Small files still attach, inline.
  const inline = async (reason) => {
    if (file.size > INLINE_LIMIT) throw new Error(reason);
    const fileUrl = await readAsDataUrl(file);
    // Belt and braces: a file just under the byte limit whose data URL still comes out
    // too long would otherwise be stripped later and attach as a dead row.
    if (String(fileUrl).length >= INLINE_URL_MAX) throw new Error(reason);
    return { ...meta, fileUrl };
  };
  const noStore = `${file.name} is over ${Math.round(INLINE_LIMIT / 1024)} KB and no blob store is reachable. Set BLOB_READ_WRITE_TOKEN to attach files this size.`;

  // Big files — call video above all — stream direct to storage. Passing a 200 MB
  // recording through a function is not possible, and multipart gives us retries.
  if (file.size > DIRECT_THRESHOLD) {
    try {
      const { upload } = await import("@vercel/blob/client");
      const safeName = file.name.replace(/[^A-Za-z0-9._-]/g, "-").slice(-60) || "upload";
      const result = await upload(`${kind}/${safeName}`, file, {
        access: "public",
        handleUploadUrl: "/api/blob-upload",
        multipart: true,
        contentType: meta.fileType,
        onUploadProgress: onProgress ? ({ percentage }) => onProgress(percentage) : undefined,
      });
      return { ...meta, filePath: result.pathname, fileUrl: result.url || "" };
    } catch (err) {
      // Fall through only if the file could still go the buffered way.
      if (file.size > BUFFERED_LIMIT) {
        throw new Error(
          `${file.name} is ${Math.round(file.size / (1024 * 1024))} MB and could not be uploaded. ` +
          (err && err.message ? err.message : "No blob store is reachable.")
        );
      }
    }
  }

  let res;
  try {
    res = await fetch(`/api/files?kind=${encodeURIComponent(kind)}&name=${encodeURIComponent(file.name)}`, {
      method: "POST",
      headers: { "Content-Type": meta.fileType },
      body: file,
    });
  } catch (err) {
    return inline(noStore);
  }

  // A dev server or SPA fallback answers 200 with the app's HTML. That is not an upload,
  // and treating it as one would store a path that never resolves.
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) return inline(noStore);

  let body = {};
  try {
    body = await res.json();
  } catch (err) {
    return inline(noStore);
  }

  if (res.ok && body.path) return { ...meta, filePath: body.path, fileUrl: body.url || "" };

  // 501 means the route is live but no store is configured — degrade quietly.
  if (res.status === 501) return inline(noStore);

  // Anything else is the store actively refusing the file. Say so rather than
  // silently storing something different from what the user asked for.
  throw new Error(body.error || `Upload failed (${res.status}).`);
}

/**
 * Drops the stored blob behind an attachment. Best effort on purpose: clearing an
 * attachment must not fail because the store was unreachable, but saying nothing at all
 * would strand the blob in storage forever with no record left pointing at it.
 *
 * Inline data URLs live on the record itself, so there is nothing to delete for those.
 */
export async function deleteFile(record) {
  const path = record && record.filePath;
  if (!path) return;
  try {
    await fetch(`/api/files?path=${encodeURIComponent(path)}`, { method: "DELETE" });
  } catch (err) {
    // The record is cleared either way; a stranded blob is not worth blocking the UI on.
  }
}

export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
