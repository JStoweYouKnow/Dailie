# Microfrontends

Dailie is the **default app** of a Vercel microfrontends group. It serves `dailie.vercel.app/*`, and hands `/production/*` to [Interface](https://github.com/JStoweYouKnow/Interface) — the Next.js + Convex production-tracking app (shots, tasks, review, schedule, AI usage).

| | Vercel project | Framework | Serves |
|---|---|---|---|
| Default app | `dailie` | Vite + React | `dailie.vercel.app/*` |
| Child app | `interface` | Next.js 16 | `dailie.vercel.app/production/*` |

**This repo owns [`microfrontends.json`](./microfrontends.json)** — the routing config for the whole group. Vercel reads it from Dailie's production deployment. Interface pulls a local copy with `vercel microfrontends pull` and does not commit one.

The PRODUCTION tab in the header is a plain `<a href="/production">`, i.e. a real navigation into the other app, not a tab switch.

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
