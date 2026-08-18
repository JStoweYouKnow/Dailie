# Microfrontends

Dailie and Interface are one site on one domain: **`www.thewizardofops.app`**.

| | Vercel project | Framework | Serves |
|---|---|---|---|
| Default app | `dailie` | Vite + React | `www.thewizardofops.app/*` |
| Child app | `interface` | Next.js 16 | `www.thewizardofops.app/production/*` |

Interface is the [production-tracking app](https://github.com/JStoweYouKnow/Interface) — shots, tasks, review, schedule, AI usage. The link at the bottom of Dailie is a plain `<a href="/production">`: a real navigation into the other app, same origin, same tab.

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

`/production` returns 404 while `interfacestudio.vercel.app` looks fine:

```bash
vercel microfrontends pull
```

`Project is not part of a microfrontends group (404)` means the group itself does not exist, and no `microfrontends.json` in this repo will do anything until it does. Create it in the Vercel dashboard under the `dailie` project — Settings → Microfrontends — with `dailie` as the default app and `interface` added to the group. Microfrontends is a Pro/Enterprise feature.

Checking the child app directly is misleading in two ways worth knowing:

- Its routes are behind Clerk, and Clerk answers non-document requests with 404 rather than a redirect. A bare `curl` therefore reports 404 for healthy pages. Send `Accept: text/html` and `Sec-Fetch-Dest: document` to see the real behaviour — a 307 into the Clerk handshake is a working app, not a broken one.
- Since Interface sets `basePath`, its own domain serves `interfacestudio.vercel.app/production/*` too. The bare paths 404 there by design.
