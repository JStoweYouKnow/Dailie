/** Named windows for spendy /api routes. Convex consume refuses unknown buckets. */
export const RATE_LIMIT_BUCKETS = {
  files: { limit: 80, windowMs: 60 * 60 * 1000 },
  "blob-upload": { limit: 40, windowMs: 60 * 60 * 1000 },
  transcribe: { limit: 20, windowMs: 60 * 60 * 1000 },
  "send-email": { limit: 20, windowMs: 60 * 60 * 1000 },
  "draft-email": { limit: 40, windowMs: 60 * 60 * 1000 },
  "google-sync": { limit: 30, windowMs: 60 * 60 * 1000 },
};
