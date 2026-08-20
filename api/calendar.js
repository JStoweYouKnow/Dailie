// Fetches a Google Calendar secret-iCal feed server-side. Browsers cannot read these
// directly (no CORS headers on calendar.google.com), so the app proxies through here.
const ALLOWED_HOSTS = [
  "calendar.google.com",
  "www.google.com",
  "calendarusercontent.google.com",
  "outlook.office365.com",
  "outlook.live.com",
  "p.calendarlabs.com",
  "webcal.calendar.yahoo.com",
];

const MAX_BYTES = 4 * 1024 * 1024;

function feedHint(status, target) {
  const path = (target && target.pathname) || "";
  const isGoogle = target && /google\.com$/i.test(target.hostname);
  const usedPublic = /\/public\//i.test(path);
  const usedSecret = /\/private-/i.test(path);

  if (status === 401 || status === 403) {
    if (isGoogle && usedPublic) {
      return "Google rejected that public iCal address (the calendar is private). Copy the Secret address in iCal format: Settings → the calendar → Integrate calendar.";
    }
    if (isGoogle && usedSecret) {
      return "Google rejected that secret iCal address (401). Reset it under Settings → the calendar → Integrate calendar, or use Sync my Google Calendar instead — private feeds often fail from the server.";
    }
    if (isGoogle) {
      return "Google returned 401. Use the Secret address in iCal format (Settings → the calendar → Integrate calendar), not the calendar's web page. Sync my Google Calendar is the more reliable path.";
    }
    return "The calendar provider returned 401. The feed is private or the URL is stale.";
  }
  if (status === 404) {
    return "The feed URL was rejected. In Google Calendar use Settings → your calendar → Secret address in iCal format.";
  }
  return `The calendar provider returned ${status}.`;
}

export async function GET(request) {
  const raw = new URL(request.url).searchParams.get("url") || "";
  const normalized = raw.replace(/^webcal:\/\//i, "https://");

  let target;
  try {
    target = new URL(normalized);
  } catch (err) {
    return Response.json({ error: "That does not look like a calendar URL." }, { status: 400 });
  }

  if (target.protocol !== "https:") {
    return Response.json({ error: "Calendar feeds must be https." }, { status: 400 });
  }
  // Restricting the host keeps this from becoming a general-purpose SSRF proxy.
  if (!ALLOWED_HOSTS.includes(target.hostname)) {
    return Response.json(
      { error: `Only calendar providers are allowed here (${ALLOWED_HOSTS.slice(0, 3).join(", ")}…).` },
      { status: 400 }
    );
  }

  let upstream;
  try {
    upstream = await fetch(target.toString(), {
      redirect: "follow",
      headers: {
        Accept: "text/calendar, text/plain, */*",
        // Google 401s many datacenter fetches that omit a browser-like UA.
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      },
    });
  } catch (err) {
    return Response.json({ error: "Could not reach the calendar feed." }, { status: 502 });
  }

  if (!upstream.ok) {
    return Response.json({ error: feedHint(upstream.status, target) }, { status: 502 });
  }

  const text = await upstream.text();
  if (text.length > MAX_BYTES) {
    return Response.json({ error: "That calendar feed is too large to sync." }, { status: 413 });
  }
  if (!/BEGIN:VCALENDAR/i.test(text)) {
    return Response.json({ error: "That URL did not return an iCal feed." }, { status: 422 });
  }

  return new Response(text, {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "no-store" },
  });
}
