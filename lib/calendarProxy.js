/** Hosts the iCal proxy may fetch. www.google.com is deliberately omitted. */
export const ALLOWED_CALENDAR_HOSTS = [
  "calendar.google.com",
  "calendarusercontent.google.com",
  "outlook.office365.com",
  "outlook.live.com",
  "p.calendarlabs.com",
  "webcal.calendar.yahoo.com",
];

const MAX_REDIRECTS = 5;

export function isAllowedCalendarHost(hostname) {
  return ALLOWED_CALENDAR_HOSTS.includes(String(hostname || "").toLowerCase());
}

/**
 * Next hop after a 3xx. Returns a URL only when the destination is still https
 * and on the allowlist. Relative Location values resolve against the current URL.
 */
export function calendarRedirectTarget(currentUrl, locationHeader) {
  const loc = String(locationHeader || "").trim();
  if (!loc) return { error: "Calendar redirect had no Location." };
  let next;
  try {
    next = new URL(loc, currentUrl);
  } catch (err) {
    return { error: "Calendar redirect was not a valid URL." };
  }
  if (next.protocol !== "https:") {
    return { error: "Calendar feeds must be https." };
  }
  if (!isAllowedCalendarHost(next.hostname)) {
    return { error: "Calendar redirect left the allowed hosts." };
  }
  return { url: next };
}

export async function fetchCalendarFeed(initialUrl, { fetchImpl = fetch, headers = {}, maxRedirects = MAX_REDIRECTS } = {}) {
  let current = initialUrl;
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const upstream = await fetchImpl(current.toString(), {
      redirect: "manual",
      headers,
    });
    if (upstream.status >= 300 && upstream.status < 400) {
      const next = calendarRedirectTarget(current, upstream.headers.get("location"));
      if (next.error) {
        const err = new Error(next.error);
        err.status = 400;
        throw err;
      }
      current = next.url;
      continue;
    }
    return { response: upstream, finalUrl: current };
  }
  const err = new Error("Too many calendar redirects.");
  err.status = 400;
  throw err;
}
