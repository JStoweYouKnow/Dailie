import { handleUpload } from "@vercel/blob/client";
import { clientUploadAccess } from "../lib/blobStore.js";
import { requireApiAuth } from "../lib/requireApiAuth.js";
import { rateLimit } from "../lib/rateLimit.js";
import { ALLOWED_CONTENT_TYPES } from "../lib/allowedUploads.js";

/**
 * Issues short-lived client tokens so the browser uploads straight to blob storage.
 *
 * Call videos are far too big to pass through a function: at the recorder's bitrate a
 * 30-minute call is ~170 MB, well past any request-body limit. Uploading direct from
 * the browser also means multipart and retries for free.
 */
const ALLOWED_PREFIX = /^(video|recordings|documents|images)\//;
const MAX_BYTES = 2 * 1024 * 1024 * 1024;

export async function POST(request) {
  const gate = await requireApiAuth(request);
  if (gate.error) return gate.error;
  const limited = rateLimit({ key: `blob-upload:${gate.auth.userId}`, limit: 40, windowMs: 60 * 60 * 1000 });
  if (limited.error) return limited.error;

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
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
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
