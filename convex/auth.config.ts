// Clerk JWT validation. Both apps share one Clerk instance, so this is the same
// issuer Interface uses. Set it on each Convex deployment:
//   npx convex env set CLERK_JWT_ISSUER_DOMAIN <clerk frontend api url>
//   npx convex env set CLERK_JWT_ISSUER_DOMAIN <url> --prod
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN,
      applicationID: "convex",
    },
  ],
};
