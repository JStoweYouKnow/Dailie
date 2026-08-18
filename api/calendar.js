// Fetches a Google Calendar secret-iCal feed server-side. Browsers cannot read these
// directly (no CORS headers on calendar.google.com), so the app proxies through here.
const ALLOWED_HOSTS = [
  "calendar.google.com",
  "www.google.com",
  "outlook.office365.com",
  "outlook.live.com",
  "p.calendarlabs.com",
  "webcal.calendar.yahoo.com",
];

const MAX_BYTES = 4 * 1024 * 1024;

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
    upstream = await fetch(target.toString(), { headers: { Accept: "text/calendar, text/plain" } });
  } catch (err) {
    return Response.json({ error: "Could not reach the calendar feed." }, { status: 502 });
  }

  if (!upstream.ok) {
    const hint = upstream.status === 404
      ? "The feed URL was rejected. In Google Calendar use Settings → your calendar → Secret address in iCal format."
      : `The calendar provider returned ${upstream.status}.`;
    return Response.json({ error: hint }, { status: 502 });
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
