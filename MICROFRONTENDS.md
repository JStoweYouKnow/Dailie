# Microfrontends

Dailie and Interface are one site on one domain: **`www.thewizardofops.app`**.

| | Vercel project | Framework | Serves |
|---|---|---|---|
| Default app | `dailie` | Vite + React | `www.thewizardofops.app/*` |
| Child app | `interface` | Next.js 16 | `www.thewizardofops.app/production/*` |

Interface is the [production-tracking app](https://github.com/JStoweYouKnow/Interface) — shots, tasks, review, schedule, AI usage. The link at the bottom of Dailie is a plain `<a href="/production">`: a real navigation into the other app, same origin, same tab.

Bench (Vercel project `bench-talent`) is a **separate site**, not a child of this group. Pro includes two microfrontend projects; a third is billed. The footer links out to [bench-talent-kappa.vercel.app](https://bench-talent-kappa.vercel.app).

`thewizardofops.app` redirects to the `www` host, and `dailie.vercel.app` remains an alias of the default app.

**This repo owns [`microfrontends.json`](./microfrontends.json)** — the routing config for the whole group. Vercel reads it from Dailie's production deployment. Interface pulls a local copy with `vercel microfrontends pull` and does not commit one.

## The contract with Interface

Requests reach the child app with the `/production` prefix still on them. Interface therefore sets `basePath: "/production"` in its `next.config.ts`, which also puts its static assets under `/production/_next/*` — inside the same routing rule, so no separate asset prefix is needed.

Break that and every route behind `/production` returns 404 while both projects still look healthy on their own domains. If you ever change the prefix here, change `basePath` there in the same cutover.

## Local development

```bash
npm install

# terminal 1 — this app on its assigned port
npm run dev

# terminal 2 — the routing proxy
npm run proxy       # Interface falls back to its production deployment
npm run proxy:all   # or, if Interface is also running locally
```

Open <http://localhost:3024> (the proxy), not the Vite port — that's the only origin where `/` and `/production` both resolve. `npm run dev:solo` runs the SPA alone on port 3000 with no proxy involved.

Set `MFE_DEBUG=1` to log which app the proxy picked for each request.

## Changing routing

Edit `microfrontends.json` and deploy this repo. Two cautions:

- The projects don't roll out in lockstep — deploy the target app before pointing paths at it.
- Paths must map uniquely to one app; overlapping patterns are rejected.

## Troubleshooting

Clerk on `/production` fails with `failed_to_load_clerk_js` for `/__clerk/npm/@clerk/clerk-js@…`:

Interface's Clerk SDK loads first-party scripts from `/__clerk/…` on this origin. That path is not under `/production`, so the group sent it to Dailie and it 404'd. `vercel.json` rewrites `/__clerk/:path*` to `https://clerk.thewizardofops.app/:path*` (the Clerk Frontend API host). Do not add `/__clerk` to Interface's routing unless its middleware also treats those URLs as public — `auth.protect()` currently 404s them when signed out.

`/production` returns 404 while `interfacestudio.vercel.app` looks fine:

```bash
vercel microfrontends pull
```

`Project is not part of a microfrontends group (404)` means the group itself does not exist, and no `microfrontends.json` in this repo will do anything until it does. Create it in the Vercel dashboard under the `dailie` project — Settings → Microfrontends — with `dailie` as the default app and `interface` added to the group. Microfrontends is a Pro/Enterprise feature.

Checking the child app directly is misleading in two ways worth knowing:

- Its routes are behind Clerk, and Clerk answers non-document requests with 404 rather than a redirect. A bare `curl` therefore reports 404 for healthy pages. Send `Accept: text/html` and `Sec-Fetch-Dest: document` to see the real behaviour — a 307 into the Clerk handshake is a working app, not a broken one.
- Since Interface sets `basePath`, its own domain serves `interfacestudio.vercel.app/production/*` too. The bare paths 404 there by design.


## Google Workspace

Dailie and Interface share one Clerk session (see `src/lib/auth.jsx`), and Clerk's Google
connection is already enabled — "Continue with Google" works today.

Syncing Gmail and Calendar needs more than sign-in, and it is blocked on one thing:

```
oauth_google: enabled, custom_credentials = false
```

Clerk is using its **shared development** Google credentials, which are fixed to
`openid`, `userinfo.email` and `userinfo.profile`. Extra scopes cannot be added to
them, and neither can a Workspace domain restriction. To switch:

1. In Google Cloud Console, create an OAuth client (Web application) for the
   Workspace org. Authorised redirect URI: the one Clerk shows on its Google
   connection page.
2. Enable the **Gmail API** and **Google Calendar API** on that project.
3. In the Clerk dashboard, open the Google connection, turn off "use shared
   credentials", paste the client id and secret, and add the scopes:
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/calendar.readonly`
4. Existing users reconnect Google once, to consent to the wider scopes.

To limit sign-in to the Workspace domain, restrict the OAuth client to internal
users in Google Cloud — that is enforced by Google rather than by this app.

Until then the sync buttons report exactly what is missing and the paste importers
remain, so nothing is stranded. `api/google-sync.js` verifies the Clerk session,
exchanges it for the user's Google token server-side and returns records already in
the board's shape; the token never reaches the browser.


## Shared board

Dailie's data lived in each browser's localStorage, so two people signing in saw two
different boards. `convex/` holds the shared one: a live query that pushes changes to
everyone with the app open, and per-record writes so two people editing different
projects do not overwrite each other.

The team list is the directory. A row is written the first time someone signs in, so
a new colleague appears as an active member without anyone adding them by hand.

It is inert until a deployment exists, exactly like the auth layer: without
`VITE_CONVEX_URL` the app keeps the browser-local board and nothing changes.

### Turning it on

```bash
npx convex dev            # creates the project, prints the deployment URL
```

Then, using the Clerk Frontend API URL as the issuer:

```bash
npx convex env set CLERK_JWT_ISSUER_DOMAIN https://measured-camel-85.clerk.accounts.dev
npx convex env set CLERK_JWT_ISSUER_DOMAIN https://clerk.thewizardofops.app --prod
```

Add `VITE_CONVEX_URL` to the Vercel project for every environment, and redeploy.
Clerk needs a JWT template named `convex` — Interface already uses one on the same
instance, so there is nothing new to create.

The first person to open the app after that has their local board lifted into the
shared one; the mutation refuses if anything is already there, so a second person
cannot overwrite it.
