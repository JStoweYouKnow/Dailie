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
