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

// Clerk's own components, dressed in the Feelie palette so signing in does not
// look like it belongs to a different product.
const appearance = {
  variables: {
    colorPrimary: "#6f917d",
    colorBackground: "#141a17",
    colorText: "#f0f3ee",
    colorTextSecondary: "#9aaba1",
    colorInputBackground: "#1c2420",
    colorInputText: "#f0f3ee",
    colorDanger: "#c08d7a",
    // Clerk puts white on the primary colour, which only reaches 3.5:1 against this
    // sage. The rest of the app sets dark ink on accent for the same reason.
    colorTextOnPrimaryBackground: "#0a0d0b",
    borderRadius: "8px",
    fontFamily: "Archivo, -apple-system, sans-serif",
  },
  elements: {
    card: { boxShadow: "none", border: "1px solid rgba(240,243,238,0.12)" },
    footer: { display: "none" },
    // The Clerk application is named "Interface", so its stock header reads
    // "Sign in to Interface" even here. The branding above the card says where you
    // are; renaming the app in the Clerk dashboard would fix it for both products.
    header: { display: "none" },
    // Social buttons carry their own colours rather than inheriting colorText, and
    // they assume a light card. On this dark one that left "Continue with Google"
    // near-black on near-black.
    socialButtonsBlockButton: {
      backgroundColor: "#1c2420",
      borderColor: "rgba(240,243,238,0.22)",
      color: "#f0f3ee",
    },
    socialButtonsBlockButtonText: { color: "#f0f3ee", fontWeight: 600 },
    socialButtonsProviderIcon: { filter: "none" },
    dividerLine: { backgroundColor: "rgba(240,243,238,0.12)" },
    dividerText: { color: "#9aaba1" },
    formFieldLabel: { color: "#9aaba1" },
    formFieldInput: { borderColor: "rgba(240,243,238,0.22)" },
    identityPreviewText: { color: "#f0f3ee" },
    formResendCodeLink: { color: "#6f917d" },
    otpCodeFieldInput: { color: "#f0f3ee", borderColor: "rgba(240,243,238,0.22)" },
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
  return (
    <svg width="34" height="34" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="11" width="30" height="22" rx="5" fill="var(--panel-raised)" stroke="var(--accent)" strokeWidth="2" />
      <path d="M3 12C3 9.79086 4.79086 8 7 8H29C31.2091 8 33 9.79086 33 12V15H3V12Z" fill="var(--accent)" />
      <path d="M8 8L12 15" stroke="var(--ink)" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M16 8L20 15" stroke="var(--ink)" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M24 8L28 15" stroke="var(--ink)" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="10" cy="22" r="2" fill="var(--bone)" />
      <circle cx="18" cy="22" r="2" fill="var(--bone)" />
      <circle cx="26" cy="22" r="2" fill="var(--bone)" />
    </svg>
  );
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
        <div className="md-display" style={{ fontSize: 22, letterSpacing: "-0.03em", color: "var(--bone)" }}>DAILIE</div>
        <div className="md-mono" style={{ fontSize: 9.5, color: "var(--dim-2)", letterSpacing: ".2em", marginTop: 5 }}>
          MATRIARCH STUDIOS · OPERATIONS
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
      <div className="md-display" style={{ fontSize: 22, letterSpacing: "-0.03em", color: "var(--bone)" }}>DAILIE</div>
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
