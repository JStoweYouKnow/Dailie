import { Component } from "react";

/**
 * The shared board must never be able to blank the app.
 *
 * Convex's useQuery throws when a query fails — an expired session, a missing JWT
 * template, a deployment that is down. React then unmounts the whole tree, which
 * looks exactly like the data has been lost even though it is safe on the server and
 * in this browser. This catches that and falls back to the local board with the
 * reason on screen, so the app stays usable while the cause is fixed.
 */
export default class SharedBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    // Surfaced in the browser console for whoever is debugging the deployment.
    console.error("Shared board unavailable:", error);
  }

  render() {
    if (!this.state.error) return this.props.children;

    const message = String(this.state.error && this.state.error.message ? this.state.error.message : this.state.error);
    const notSignedIn = /not signed in|unauthenticated|identity/i.test(message);

    return this.props.fallback({
      message,
      hint: notSignedIn
        ? "The board could not read your session. Check that the Clerk instance this app signs in with has a JWT template named \"convex\", and that the deployment's CLERK_JWT_ISSUER_DOMAIN matches that instance."
        : "The shared board could not be reached.",
      retry: () => this.setState({ error: null }),
    });
  }
}
