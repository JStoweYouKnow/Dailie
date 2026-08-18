import { put, get, del } from "@vercel/blob";

// Attachments are private: NDAs, deal contracts and invoices must not be reachable
// from the blob CDN by anyone holding the URL. This route is the only read path.
const KINDS = new Set(["documents", "images", "recordings", "video"]);
const PATH_RE = /^(documents|images|recordings|video)\/[A-Za-z0-9._-]+$/;
const MAX_BYTES = 25 * 1024 * 1024;

function extensionFor(name, contentType) {
  const fromName = String(name || "").match(/\.([A-Za-z0-9]{1,8})$/);
  if (fromName) return fromName[1].toLowerCase();
  const map = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "audio/webm": "webm", "video/webm": "webm" };
  return map[String(contentType || "").split(";")[0]] || "bin";
}

export async function POST(request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.VERCEL_OIDC_TOKEN) {
    // The client falls back to an inline data URL for small files when it sees this.
    return Response.json({ error: "No blob store is configured. Set BLOB_READ_WRITE_TOKEN to store attachments." }, { status: 501 });
  }

  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") || "documents";
  if (!KINDS.has(kind)) {
    return Response.json({ error: "Unknown attachment kind." }, { status: 400 });
  }

  let body;
  try {
    body = new Uint8Array(await request.arrayBuffer());
  } catch (err) {
    return Response.json({ error: "Could not read the uploaded file." }, { status: 400 });
  }
  if (body.byteLength === 0) return Response.json({ error: "The uploaded file was empty." }, { status: 400 });
  if (body.byteLength > MAX_BYTES) {
    return Response.json({ error: `File is ${Math.round(body.byteLength / (1024 * 1024))} MB. The limit is 25 MB.` }, { status: 413 });
  }

  const contentType = request.headers.get("content-type") || "application/octet-stream";
  const ext = extensionFor(url.searchParams.get("name"), contentType);

  try {
    const result = await put(`${kind}/${crypto.randomUUID()}.${ext}`, body, { access: "private", contentType });
    return Response.json({ path: result.pathname, size: body.byteLength, contentType });
  } catch (err) {
    console.error("blob upload failed", err);
    return Response.json({ error: "Could not store the file." }, { status: 502 });
  }
}

export async function GET(request) {
  const path = new URL(request.url).searchParams.get("path") || "";

  // Only ever fetch keys this app wrote — otherwise the route is an open proxy.
  if (!PATH_RE.test(path)) return Response.json({ error: "Invalid attachment path." }, { status: 400 });

  let result;
  try {
    result = await get(path, { access: "private" });
  } catch (err) {
    console.error("blob read failed", err);
    return Response.json({ error: "Could not read the attachment." }, { status: 502 });
  }
  if (!result) return Response.json({ error: "Attachment not found." }, { status: 404 });

  return new Response(result.stream, {
    headers: {
      "Content-Type": result.blob.contentType || "application/octet-stream",
      "Content-Length": String(result.blob.size),
      "Cache-Control": "private, max-age=3600",
    },
  });
}

export async function DELETE(request) {
  const path = new URL(request.url).searchParams.get("path") || "";
  if (!PATH_RE.test(path)) return Response.json({ error: "Invalid attachment path." }, { status: 400 });
  try {
    await del(path);
  } catch (err) {
    console.error("blob delete failed", err);
    return Response.json({ error: "Could not delete the attachment." }, { status: 502 });
  }
  return Response.json({ ok: true });
}
