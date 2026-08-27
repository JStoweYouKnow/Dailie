import { getFromStore, redirectToBlob } from "../lib/blobStore.js";
import { requireApiAuth } from "../lib/requireApiAuth.js";

// Recordings are read through this route. Clients keep the path, not a public
// store URL — see lib/blobStore.js.
const RECORDING_PATH = /^recordings\/[A-Za-z0-9._-]+$/;

export async function GET(request) {
  const gate = await requireApiAuth(request);
  if (gate.error) return gate.error;

  const path = new URL(request.url).searchParams.get("path") || "";

  // Only ever fetch keys this app wrote. Accepting an arbitrary URL here would
  // turn the route into an open proxy.
  if (!RECORDING_PATH.test(path)) {
    return Response.json({ error: "Invalid recording path." }, { status: 400 });
  }

  // Same reasoning as /api/files: a presigned redirect gives the player byte ranges,
  // which is what makes scrubbing and transcript seeking work.
  try {
    return await redirectToBlob(path);
  } catch (err) {
    console.error("presign failed, streaming instead", err);
  }

  let result;
  try {
    result = await getFromStore(path);
  } catch (err) {
    console.error("blob read failed", err);
    return Response.json({ error: "Could not read the recording." }, { status: 502 });
  }

  if (!result) {
    return Response.json({ error: "Recording not found." }, { status: 404 });
  }

  return new Response(result.stream, {
    headers: {
      "Content-Type": result.blob.contentType || "audio/webm",
      "Content-Length": String(result.blob.size),
      "Accept-Ranges": "none",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
