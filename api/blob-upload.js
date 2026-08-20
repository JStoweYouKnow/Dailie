import { handleUpload } from "@vercel/blob/client";
import { clientUploadAccess } from "../lib/blobStore.js";

/**
 * Issues short-lived client tokens so the browser uploads straight to blob storage.
 *
 * Call videos are far too big to pass through a function: at the recorder's bitrate a
 * 30-minute call is ~170 MB, well past any request-body limit. Uploading direct from
 * the browser also means multipart and retries for free.
 */
const ALLOWED_PREFIX = /^(video|recordings|documents|images)\//;
const MAX_BYTES = 2 * 1024 * 1024 * 1024;

const CONTENT_TYPES = [
  "video/webm", "video/mp4",
  "audio/webm", "audio/mpeg", "audio/mp4", "audio/wav", "audio/x-m4a",
  "image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif", "image/heic", "image/heif",
  "application/pdf",
  "application/zip", "application/x-zip-compressed",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/octet-stream",
];

export async function POST(request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.VERCEL_OIDC_TOKEN) {
    // The client falls back to the buffered route, then to an inline data URL.
    return Response.json({ error: "No blob store is configured." }, { status: 501 });
  }

  let body;
  try {
    body = await request.json();
  } catch (err) {
    return Response.json({ error: "Invalid upload request." }, { status: 400 });
  }

  try {
    const result = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname) => {
        // The token is scoped to one pathname, so this is the only gate on where a
        // browser may write. Anything outside our own prefixes is refused.
        if (!ALLOWED_PREFIX.test(pathname)) {
          throw new Error("That upload path is not allowed.");
        }
        return {
          access: clientUploadAccess(),
          allowedContentTypes: CONTENT_TYPES,
          maximumSizeInBytes: MAX_BYTES,
          addRandomSuffix: true,
          tokenPayload: null,
        };
      },
    });
    return Response.json(result);
  } catch (err) {
    return Response.json({ error: err.message || "Could not authorise the upload." }, { status: 400 });
  }
}
