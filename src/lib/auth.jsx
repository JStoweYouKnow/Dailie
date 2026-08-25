import { useEffect } from "react";
import { ClerkProvider, SignedIn, SignedOut, SignIn, useUser, useClerk, useAuth } from "@clerk/clerk-react";
import { bindSessionToken } from "./sessionToken";

/**
 * Dailie and Interface share one Clerk session.
 *
 * That works because the microfrontends group puts both apps on one origin —
 * www.thewizardofops.app serves Dailie at / and Interface at /production — so the
 * session cookie Clerk sets is visible to both. Signing in on either one signs you
 * into the other; there is no token passing to get wrong.
 *
 * Without a publishable key the app runs exactly as it did before, unauthenticated.
 * That keeps `vite dev` and the test suites usable without credentials, and means a
 * missing env var degrades to the old behaviour rather than a white screen.
 */
export const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || "";
export const AUTH_ENABLED = !!PUBLISHABLE_KEY;

// Clerk's own components, dressed like The Callsheet so signing in does not
// look like it belongs to a different product.
const appearance = {
  variables: {
    colorPrimary: "#0a0a0a",
    colorBackground: "#ffffff",
    colorText: "#0a0a0a",
    colorTextSecondary: "#5c5c5c",
    colorInputBackground: "#fafaf8",
    colorInputText: "#0a0a0a",
    colorDanger: "#c41e3a",
    colorTextOnPrimaryBackground: "#fafaf8",
    borderRadius: "0px",
    fontFamily: "Helvetica Neue, Helvetica, Arial, sans-serif",
  },
  elements: {
    card: { boxShadow: "8px 8px 0 rgba(10, 10, 10, 0.06)", border: "1px solid #0a0a0a", borderRadius: "0px" },
    footer: { display: "none" },
    header: { display: "none" },
    socialButtonsBlockButton: {
      backgroundColor: "#ffffff",
      borderColor: "#0a0a0a",
      color: "#0a0a0a",
      borderRadius: "0px",
    },
    socialButtonsBlockButtonText: { color: "#0a0a0a", fontWeight: 600 },
    socialButtonsProviderIcon: { filter: "none" },
    dividerLine: { backgroundColor: "rgba(10,10,10,0.12)" },
    dividerText: { color: "#5c5c5c" },
    formFieldLabel: { color: "#5c5c5c" },
    formFieldInput: { borderColor: "rgba(10,10,10,0.28)", borderRadius: "0px" },
    identityPreviewText: { color: "#0a0a0a" },
    formResendCodeLink: { color: "#0a0a0a" },
    otpCodeFieldInput: { color: "#0a0a0a", borderColor: "rgba(10,10,10,0.28)" },
    formButtonPrimary: { borderRadius: "0px", backgroundColor: "#0a0a0a", color: "#fafaf8" },
  },
};

function TokenBinder() {
  const { getToken } = useAuth();
  useEffect(() => {
    bindSessionToken(() => getToken());
    return () => bindSessionToken(null);
  }, [getToken]);
  return null;
}

export function AuthProvider({ children }) {
  if (!AUTH_ENABLED) return children;
  return (
    <ClerkProvider publishableKey={PUBLISHABLE_KEY} appearance={appearance} afterSignOutUrl="/">
      <TokenBinder />
      {children}
    </ClerkProvider>
  );
}

function BrandMark() {
  return <span className="dailie-mark" style={{ width: 36, height: 36, fontSize: 15 }}>B</span>;
}

/**
 * Signed out, this is the whole page. Virtual routing keeps the flow inside the
 * component — Dailie is a single-view SPA with no router to hand Clerk.
 */
function SignInScreen() {
  return (
    <div style={{
      minHeight: "100vh", background: "var(--ink)", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: "40px 20px", gap: 26,
    }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}><BrandMark /></div>
        <div className="dailie-wordmark" style={{ fontSize: 22 }}>Bench</div>
        <div className="dailie-tag">
          Matriarch Studios · Operations
        </div>
        <p style={{ fontSize: 13, color: "var(--dim)", marginTop: 14, maxWidth: 330, lineHeight: 1.55 }}>
          One sign-in covers the ops board and production tracking.
        </p>
      </div>
      <SignIn routing="virtual" />
    </div>
  );
}

function MissingAuthScreen() {
  return (
    <div style={{
      minHeight: "100vh", background: "var(--ink)", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: "40px 20px", gap: 16,
    }}>
      <div className="dailie-wordmark" style={{ fontSize: 22 }}>Bench</div>
      <p style={{ fontSize: 13, color: "var(--dim)", maxWidth: 360, lineHeight: 1.55, textAlign: "center" }}>
        Sign-in is not configured on this deployment. Set VITE_CLERK_PUBLISHABLE_KEY before going live.
      </p>
    </div>
  );
}

export function AuthGate({ children }) {
  if (!AUTH_ENABLED) {
    if (import.meta.env.PROD) return <MissingAuthScreen />;
    return children;
  }
  return (
    <>
      <SignedIn>{children}</SignedIn>
      <SignedOut><SignInScreen /></SignedOut>
    </>
  );
}

/** The signed-in account, flattened to what the board needs. Null when auth is off. */
export function useClerkUser() {
  if (!AUTH_ENABLED) return { enabled: false, isLoaded: true, user: null };
  const { isLoaded, user } = useUser();
  return { enabled: true, isLoaded, user: user || null };
}

export function useAccount() {
  if (!AUTH_ENABLED) return { enabled: false, ready: true, account: null };
  // Safe: AUTH_ENABLED is fixed for the lifetime of the bundle, so the hook order
  // below never changes between renders.
  const { isLoaded, user } = useUser();
  if (!isLoaded || !user) return { enabled: true, ready: isLoaded, account: null };
  const email = (user.primaryEmailAddress && user.primaryEmailAddress.emailAddress) || "";
  return {
    enabled: true,
    ready: true,
    account: {
      id: user.id,
      name: user.fullName || user.firstName || (email ? email.split("@")[0] : "Account"),
      email: email.toLowerCase(),
      imageUrl: user.imageUrl || "",
    },
  };
}

export function useSignOut() {
  if (!AUTH_ENABLED) return null;
  const { signOut } = useClerk();
  return signOut;
}

/**
 * Session token for calling our own API routes.
 *
 * The cookie alone is not enough: Clerk's development instances wrap the session in
 * a handshake, so a plain fetch from the browser reached the function unauthenticated
 * and it answered 401. Sending the token explicitly works on both instance types.
 */
export function useAuthToken() {
  if (!AUTH_ENABLED) return null;
  const { getToken } = useAuth();
  return getToken;
}
