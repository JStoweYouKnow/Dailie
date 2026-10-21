import { put, get, issueSignedToken, presignUrl } from "@vercel/blob";

/**
 * Uploads request private access unless BLOB_ACCESS=public. This project's first
 * store was created public and that mode cannot be changed later — private
 * uploads then fail with "Cannot use private access on a public store".
 *
 * BLOB_ACCESS=private fails closed (no public retry). Unset still retries public
 * so the existing store keeps working. Durable public URLs are never returned.
 */
export function allowPublicBlobFallback() {
  return process.env.BLOB_ACCESS !== "private";
}

function preferredAccess() {
  return process.env.BLOB_ACCESS === "public" ? "public" : "private";
}

function withoutStoreUrl(result) {
  if (!result || typeof result !== "object") return result;
  return { ...result, url: "" };
}

function isWrongAccess(err) {
  const msg = String((err && err.message) || err || "");
  return /Cannot use (private|public) access on a (public|private) store/i.test(msg);
}

function otherAccess(access) {
  return access === "private" ? "public" : "private";
}

let resolvedAccess = "";

function rememberAccess(access) {
  resolvedAccess = access;
}

export async function putOnStore(pathname, body, options = {}) {
  const access = resolvedAccess || preferredAccess();
  try {
    const result = await put(pathname, body, { ...options, access });
    rememberAccess(access);
    return withoutStoreUrl(result);
  } catch (err) {
    if (!isWrongAccess(err) || !allowPublicBlobFallback()) throw err;
    const other = otherAccess(access);
    const result = await put(pathname, body, { ...options, access: other });
    rememberAccess(other);
    return withoutStoreUrl(result);
  }
}

export async function getFromStore(pathname) {
  const access = resolvedAccess || preferredAccess();
  try {
    const result = await get(pathname, { access });
    rememberAccess(access);
    return result;
  } catch (err) {
    if (!isWrongAccess(err) || !allowPublicBlobFallback()) throw err;
    const other = otherAccess(access);
    const result = await get(pathname, { access: other });
    rememberAccess(other);
    return result;
  }
}

export async function redirectToBlob(pathname) {
  const access = resolvedAccess || preferredAccess();
  const validUntil = Date.now() + 60 * 60 * 1000;
  try {
    const token = await issueSignedToken({ pathname, operations: ["get"], validUntil });
    const { presignedUrl } = await presignUrl(token, { operation: "get", pathname, access, validUntil });
    rememberAccess(access);
    return new Response(null, {
      status: 302,
      headers: { Location: presignedUrl, "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    if (!isWrongAccess(err) || !allowPublicBlobFallback()) throw err;
    const other = otherAccess(access);
    const token = await issueSignedToken({ pathname, operations: ["get"], validUntil });
    const { presignedUrl } = await presignUrl(token, {
      operation: "get", pathname, access: other, validUntil,
    });
    rememberAccess(other);
    return new Response(null, {
      status: 302,
      headers: { Location: presignedUrl, "Cache-Control": "private, no-store" },
    });
  }
}

/**
 * Direct browser uploads issue a token once, so they cannot retry the other mode.
 * Probe (or reuse a remembered mode) before minting that token.
 */
export async function detectStoreAccess() {
  if (resolvedAccess) return resolvedAccess;
  const access = preferredAccess();
  try {
    await put("_dailie/access-probe.bin", new Uint8Array([0x20]), {
      access,
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/octet-stream",
    });
    rememberAccess(access);
    return access;
  } catch (err) {
    if (!isWrongAccess(err) || !allowPublicBlobFallback()) return access;
    const other = otherAccess(access);
    rememberAccess(other);
    return other;
  }
}

export function clientUploadAccess() {
  return resolvedAccess || preferredAccess();
}

