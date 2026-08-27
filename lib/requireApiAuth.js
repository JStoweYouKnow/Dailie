import { createClerkClient } from "@clerk/backend";
import { isHouseEmail } from "../src/lib/houseAccess.js";

const AUTHORIZED_PARTIES = [
  "https://www.thewizardofops.app",
  "https://thewizardofops.app",
  "https://dailie.vercel.app",
  "http://localhost:3000",
  "http://localhost:3460",
  "http://localhost:3461",
];

function emailFromClaims(auth) {
  const claims = (auth && auth.sessionClaims) || {};
  const value = claims.email || claims.email_address || "";
  return String(value || "").trim().toLowerCase();
}

async function emailForUser(clerk, auth) {
  const fromClaims = emailFromClaims(auth);
  if (fromClaims) return fromClaims;
  try {
    const user = await clerk.users.getUser(auth.userId);
    const primary = (user.emailAddresses || []).find((item) => item.id === user.primaryEmailAddressId);
    const fallback = (user.emailAddresses || [])[0];
    return String((primary || fallback || {}).emailAddress || "").trim().toLowerCase();
  } catch (err) {
    return "";
  }
}

/**
 * Same session check google-sync already used. Every spendy or mutating /api
 * route should go through here so the Clerk screen is not the only gate.
 */
export async function requireApiAuth(request, { needEmail = false } = {}) {
  if (!process.env.CLERK_SECRET_KEY) {
    return {
      error: Response.json(
        { error: "Authentication is not configured on the server." },
        { status: 501 }
      ),
    };
  }

  const clerk = createClerkClient({
    secretKey: process.env.CLERK_SECRET_KEY,
    publishableKey: process.env.CLERK_PUBLISHABLE_KEY || undefined,
  });

  try {
    const state = await clerk.authenticateRequest(request, {
      authorizedParties: AUTHORIZED_PARTIES,
    });
    const auth = state.toAuth();
    if (!auth || !auth.userId) {
      return { error: Response.json({ error: "Sign in to continue." }, { status: 401 }) };
    }
    if (!needEmail) return { auth };
    const email = await emailForUser(clerk, auth);
    return { auth: { ...auth, email } };
  } catch (err) {
    return { error: Response.json({ error: "Sign in to continue." }, { status: 401 }) };
  }
}

/** Studio accounts only. Used for send-as-studio and destroying blobs. */
export async function requireHouseApiAuth(request) {
  const gate = await requireApiAuth(request, { needEmail: true });
  if (gate.error) return gate;
  if (!isHouseEmail(gate.auth.email)) {
    return { error: Response.json({ error: "Only a studio account can do that." }, { status: 403 }) };
  }
  return gate;
}
