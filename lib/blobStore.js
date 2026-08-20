import { put, get, issueSignedToken, presignUrl } from "@vercel/blob";

/**
 * This project's blob store was created as public, and that mode cannot be
 * changed later. Uploads used to request `access: "private"`, which Vercel
 * rejects with "Cannot use private access on a public store" — that is why
 * press-kit PNGs came back as "Could not store the file."
 *
 * If a private store is connected later, set BLOB_ACCESS=private.
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
