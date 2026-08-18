/**
 * Attachments (NDAs, contracts, invoices, project stills) go to the blob store when one
 * is configured. Without it small files fall back to an inline data URL so the feature
 * still works on a plain `vite dev`, and anything large fails loudly rather than
 * silently blowing the localStorage quota.
 */
const INLINE_LIMIT = 1.5 * 1024 * 1024;
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export function fileSrc(record) {
  if (!record) return "";
  if (record.filePath) return `/api/files?path=${encodeURIComponent(record.filePath)}`;
  return record.fileUrl || "";
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
export async function uploadFile(file, kind = "documents") {
  if (!file) throw new Error("No file selected.");
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`${file.name} is ${Math.round(file.size / (1024 * 1024))} MB. The limit is 25 MB.`);
  }

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
    return { ...meta, fileUrl: await readAsDataUrl(file) };
  };
  const noStore = `${file.name} is over 1.5 MB and no blob store is reachable. Set BLOB_READ_WRITE_TOKEN to attach files this size.`;

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

  if (res.ok && body.path) return { ...meta, filePath: body.path };

  // 501 means the route is live but no store is configured — degrade quietly.
  if (res.status === 501) return inline(noStore);

  // Anything else is the store actively refusing the file. Say so rather than
  // silently storing something different from what the user asked for.
  throw new Error(body.error || `Upload failed (${res.status}).`);
}

export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
