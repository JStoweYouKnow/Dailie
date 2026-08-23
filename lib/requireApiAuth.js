import { createClerkClient } from "@clerk/backend";

const AUTHORIZED_PARTIES = [
  "https://www.thewizardofops.app",
  "https://thewizardofops.app",
  "https://dailie.vercel.app",
  "http://localhost:3000",
  "http://localhost:3460",
];

/**
 * Same session check google-sync already used. Every spendy or mutating /api
 * route should go through here so the Clerk screen is not the only gate.
 */
export async function requireApiAuth(request) {
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
    return { auth };
  } catch (err) {
    return { error: Response.json({ error: "Sign in to continue." }, { status: 401 }) };
  }
}
