import { get } from "@vercel/blob";

// Recordings are stored privately, so they are not reachable from the blob CDN
// directly. This route is the only read path.
const RECORDING_PATH = /^recordings\/[A-Za-z0-9._-]+$/;

export async function GET(request) {
  const path = new URL(request.url).searchParams.get("path") || "";

  // Only ever fetch keys this app wrote. Accepting an arbitrary URL here would
  // turn the route into an open proxy.
  if (!RECORDING_PATH.test(path)) {
    return Response.json({ error: "Invalid recording path." }, { status: 400 });
  }

  let result;
  try {
    result = await get(path, { access: "private" });
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
      // Streamed whole; the player buffers rather than seeking by byte range.
      "Accept-Ranges": "none",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
