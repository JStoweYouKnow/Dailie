export const ALLOWED_CONTENT_TYPES = [
  "video/webm", "video/mp4",
  "audio/webm", "audio/mpeg", "audio/mp4", "audio/wav", "audio/x-m4a",
  "image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif", "image/heic", "image/heif",
  "application/pdf",
  "application/zip", "application/x-zip-compressed",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];

export function normalizeContentType(value) {
  return String(value || "").split(";")[0].trim().toLowerCase();
}

export function isAllowedContentType(value) {
  const type = normalizeContentType(value);
  return ALLOWED_CONTENT_TYPES.includes(type);
}

function ascii(bytes, start, length) {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

function looksLikeMarkup(bytes) {
  let i = 0;
  if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) i = 3;
  while (i < bytes.length && (bytes[i] === 0x20 || bytes[i] === 0x09 || bytes[i] === 0x0a || bytes[i] === 0x0d)) i += 1;
  const head = ascii(bytes, i, 16).toLowerCase();
  if (head.startsWith("<svg")) return "image/svg+xml";
  if (
    head.startsWith("<!") ||
    head.startsWith("<html") ||
    head.startsWith("<head") ||
    head.startsWith("<body") ||
    head.startsWith("<script")
  ) {
    return "text/html";
  }
  return "";
}

/**
 * Type from the first bytes. Empty means unknown — do not trust the client header.
 */
export function sniffContentType(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (b.length < 4) return looksLikeMarkup(b);
  const markup = looksLikeMarkup(b);
  if (markup) return markup;
  if (ascii(b, 0, 4) === "%PDF") return "application/pdf";
  if (b[0] === 0x89 && ascii(b, 1, 3) === "PNG") return "image/png";
  if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return "image/jpeg";
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return "image/webp";
  if (ascii(b, 0, 6) === "GIF87a" || ascii(b, 0, 6) === "GIF89a") return "image/gif";
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WAVE") return "audio/wav";
  if (b[0] === 0x1A && b[1] === 0x45 && b[2] === 0xDF && b[3] === 0xA3) return "video/webm";
  if (b.length > 11 && ascii(b, 4, 4) === "ftyp") {
    const brand = ascii(b, 8, 4).toLowerCase();
    if (/^(heic|heif|mif1|msf1)/.test(brand)) return "image/heic";
    return "video/mp4";
  }
  if (ascii(b, 0, 3) === "ID3" || (b[0] === 0xFF && (b[1] & 0xE0) === 0xE0)) return "audio/mpeg";
  if (b[0] === 0xD0 && b[1] === 0xCF && b[2] === 0x11 && b[3] === 0xE0) return "application/msword";
  if (ascii(b, 0, 2) === "PK") return "application/zip";
  return "";
}

const ZIP_OFFICE = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  zip: "application/zip",
};

function sameImageJpeg(a, b) {
  return (a === "image/jpeg" || a === "image/jpg") && (b === "image/jpeg" || b === "image/jpg");
}

function zipFamily(type) {
  return (
    type === "application/zip" ||
    type === "application/x-zip-compressed" ||
    type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    type === "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  );
}

function webmFamily(type) {
  return type === "video/webm" || type === "audio/webm";
}

function mp4Family(type) {
  return type === "video/mp4" || type === "audio/mp4" || type === "audio/x-m4a" || type === "image/heic" || type === "image/heif";
}

/**
 * Decide the stored Content-Type from bytes. A client header that disagrees is refused.
 */
export function resolveUploadType({ bytes, claimedType, fileName }) {
  const claimed = normalizeContentType(claimedType);
  const sniffed = sniffContentType(bytes);
  const ext = (String(fileName || "").toLowerCase().match(/\.([a-z0-9]{1,8})$/) || [])[1] || "";

  if (!sniffed) {
    return { error: "Could not recognise that file type." };
  }
  if (sniffed === "text/html" || sniffed === "image/svg+xml") {
    return { error: "That file type is not allowed." };
  }

  let resolved = sniffed;
  if (sniffed === "application/zip") {
    resolved = ZIP_OFFICE[ext] || "application/zip";
  } else if (sniffed === "video/webm" && claimed === "audio/webm") {
    resolved = "audio/webm";
  } else if (sniffed === "video/mp4" && (claimed === "audio/mp4" || claimed === "audio/x-m4a")) {
    resolved = claimed;
  } else if (sniffed === "application/msword" && ext === "ppt") {
    resolved = "application/vnd.ms-powerpoint";
  }

  if (!isAllowedContentType(resolved)) {
    return { error: "That file type is not allowed." };
  }

  if (claimed && claimed !== resolved && !sameImageJpeg(claimed, resolved)) {
    const related =
      (zipFamily(claimed) && zipFamily(resolved)) ||
      (webmFamily(claimed) && webmFamily(resolved)) ||
      (mp4Family(claimed) && mp4Family(resolved));
    if (!related) {
      return { error: "That file type does not match its contents." };
    }
  }

  return { contentType: resolved };
}

/** MIME from a data: URL header (`data:application/pdf;base64,…`). */
export function mimeFromDataUrl(url) {
  const header = String(url || "").split(",", 1)[0];
  return normalizeContentType(header.replace(/^data:/i, "").replace(/;base64$/i, ""));
}

/**
 * Inline fallbacks must be the same types the blob store accepts.
 * HTML and SVG can execute if a viewer navigates to the data URL.
 */
export function isAllowedInlineDataUrl(url) {
  const value = String(url || "");
  if (!value.startsWith("data:")) return false;
  const mime = mimeFromDataUrl(value);
  if (mime === "text/html" || mime.startsWith("image/svg")) return false;
  return isAllowedContentType(mime);
}
