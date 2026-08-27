import { put, get, issueSignedToken, presignUrl } from "@vercel/blob";

/**
 * Uploads request the access mode in BLOB_ACCESS (default public). This project's
 * first store was created public and that mode cannot be changed later — private
 * uploads fail with "Cannot use private access on a public store", then we retry
 * the other mode so press-kit PNGs still land.
 *
 * Durable public URLs are not stored on board records. Clients read through
 * authenticated /api/files. Connect a private store and set BLOB_ACCESS=private
 * (and VITE_BLOB_ACCESS=private) to stop the CDN serving blobs without a session.
 */
function preferredAccess() {
  return process.env.BLOB_ACCESS === "private" ? "private" : "public";
}

function isWrongAccess(err) {
  const msg = String((err && err.message) || err || "");
  return /Cannot use (private|public) access on a (public|private) store/i.test(msg);
}

function otherAccess(access) {
  return access === "private" ? "public" : "private";
}

export async function putOnStore(pathname, body, options = {}) {
  const access = preferredAccess();
  try {
    return await put(pathname, body, { ...options, access });
  } catch (err) {
    if (!isWrongAccess(err)) throw err;
    return await put(pathname, body, { ...options, access: otherAccess(access) });
  }
}

export async function getFromStore(pathname) {
  const access = preferredAccess();
  try {
    return await get(pathname, { access });
  } catch (err) {
    if (!isWrongAccess(err)) throw err;
    return await get(pathname, { access: otherAccess(access) });
  }
}

export async function redirectToBlob(pathname) {
  const access = preferredAccess();
  const validUntil = Date.now() + 60 * 60 * 1000;
  try {
    const token = await issueSignedToken({ pathname, operations: ["get"], validUntil });
    const { presignedUrl } = await presignUrl(token, { operation: "get", pathname, access, validUntil });
    return new Response(null, {
      status: 302,
      headers: { Location: presignedUrl, "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    if (!isWrongAccess(err)) throw err;
    const token = await issueSignedToken({ pathname, operations: ["get"], validUntil });
    const { presignedUrl } = await presignUrl(token, {
      operation: "get", pathname, access: otherAccess(access), validUntil,
    });
    return new Response(null, {
      status: 302,
      headers: { Location: presignedUrl, "Cache-Control": "private, no-store" },
    });
  }
}

export function clientUploadAccess() {
  return preferredAccess();
}
