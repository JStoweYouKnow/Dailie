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

  const meta = { fileName: file.name, fileSize: file.size, fileType: file.type || "application/octet-stream", filePath: "", fileUrl: "", uploadedAt: Date.now() };

  try {
    const res = await fetch(`/api/files?kind=${encodeURIComponent(kind)}&name=${encodeURIComponent(file.name)}`, {
      method: "POST",
      headers: { "Content-Type": meta.fileType },
      body: file,
    });
    if (res.ok) {
      const body = await res.json();
      if (body.path) return { ...meta, filePath: body.path };
    }
    // A 501 means no blob token — fall through to the inline path rather than failing.
    if (res.status !== 404 && res.status !== 501) {
      let message = `Upload failed (${res.status}).`;
      try {
        const body = await res.json();
        if (body && body.error) message = body.error;
      } catch (e) { /* non-JSON body */ }
      if (file.size > INLINE_LIMIT) throw new Error(message);
    }
  } catch (err) {
    if (file.size > INLINE_LIMIT) {
      throw new Error(
        err && err.message && !/fetch/i.test(err.message)
          ? err.message
          : `${file.name} is too large to store locally. Configure a Vercel Blob store (BLOB_READ_WRITE_TOKEN) to attach files over 1.5 MB.`
      );
    }
  }

  if (file.size > INLINE_LIMIT) {
    throw new Error(`${file.name} is over 1.5 MB and no blob store is configured. Add BLOB_READ_WRITE_TOKEN to attach files this size.`);
  }
  return { ...meta, fileUrl: await readAsDataUrl(file) };
}

export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
