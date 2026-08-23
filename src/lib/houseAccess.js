/** Addresses that belong to the studio, not a contractor inbox. */
export const HOUSE_DOMAINS = ["matriarch-studios.com", "thewizardofops.app"];

export function isHouseEmail(email) {
  const domain = String(email || "").trim().toLowerCase().split("@")[1] || "";
  if (!domain) return false;
  return HOUSE_DOMAINS.some((allowed) => domain === allowed || domain.endsWith(`.${allowed}`));
}

/** Workspace keys a signed-in member may write. Sync state stays internal. */
export const PUBLIC_WORKSPACE_KEYS = ["settings", "pipelines"];

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...value } : {};
}

/**
 * Contractors can use the board; only house members may change synced mailboxes
 * or secret iCal addresses.
 */
export function lockSharedSettings(value, { isHouse, prior } = {}) {
  const next = asObject(value);
  if (isHouse) return next;
  const prev = asObject(prior);
  next.emailAccounts = Array.isArray(prev.emailAccounts) ? prev.emailAccounts : [];
  next.calendarFeeds = Array.isArray(prev.calendarFeeds) ? prev.calendarFeeds : [];
  return next;
}

/** @deprecated use lockSharedSettings */
export function lockMailboxSettings(value, { isHouse, priorAccounts, priorFeeds } = {}) {
  return lockSharedSettings(value, {
    isHouse,
    prior: { emailAccounts: priorAccounts, calendarFeeds: priorFeeds },
  });
}

/** Drop capability URLs before settings leave the server. */
export function redactSettingsForViewer(settings, { isHouse } = {}) {
  if (!settings || typeof settings !== "object") return settings;
  if (isHouse) return settings;
  const feeds = Array.isArray(settings.calendarFeeds) ? settings.calendarFeeds : [];
  return {
    ...settings,
    calendarFeeds: feeds.map((feed) => (
      feed && typeof feed === "object" ? { ...feed, url: "" } : feed
    )),
  };
}

/**
 * How a sign-in maps onto the members directory.
 * A new Clerk id must not inherit another account's row, even when the email matches.
 */
export function memberBindPlan({ clerkId, identityEmail, emailVerified, byClerk, byEmail }) {
  if (byClerk) {
    return { action: "update", target: byClerk, claimEmail: emailVerified === true };
  }
  if (emailVerified === true && byEmail) {
    if (byEmail.clerkId && byEmail.clerkId !== clerkId) {
      return { action: "create", claimEmail: false };
    }
    return { action: "update", target: byEmail, claimEmail: true };
  }
  return { action: "create", claimEmail: emailVerified === true && !byEmail };
}
