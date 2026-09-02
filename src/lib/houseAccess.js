/** Addresses that belong to the studio, not a contractor inbox. */
export const HOUSE_DOMAINS = ["matriarch-studios.com", "thewizardofops.app"];

export function isHouseEmail(email) {
  const domain = String(email || "").trim().toLowerCase().split("@")[1] || "";
  if (!domain) return false;
  return HOUSE_DOMAINS.some((allowed) => domain === allowed || domain.endsWith(`.${allowed}`));
}

/** Workspace keys a signed-in member may write. Sync state stays internal. */
export const PUBLIC_WORKSPACE_KEYS = ["settings", "pipelines"];

/**
 * Finance, legal, and mailbox history. Contractors can use the rest of the board;
 * these collections are house-only so a joiner cannot wipe production records.
 */
export const HOUSE_ONLY_COLLECTIONS = ["contracts", "invoices", "payments", "emails", "legal"];

export function canWriteCollection(collection, { isHouse } = {}) {
  if (isHouse) return true;
  return !HOUSE_ONLY_COLLECTIONS.includes(collection);
}

/** Same list as writes: contractors must not read mail, legal, or finance. */
export function canReadCollection(collection, { isHouse } = {}) {
  return canWriteCollection(collection, { isHouse });
}

/** Placeholder clerkId on a directory row that has been invited but has not signed in. */
export function pendingClerkId(email) {
  return `pending:${String(email || "").trim().toLowerCase()}`;
}

export function isUnboundClerkId(clerkId) {
  const id = String(clerkId || "");
  return !id || id.startsWith("pending:");
}

export function emailLooksVerified(emailVerified) {
  // Existing members still get in via byClerk when the claim is missing.
  // House auto-join and invite bind require an explicit true.
  return emailVerified === true;
}

/**
 * Whether this identity may see the shared board.
 * House domains join on a verified email. Everyone else must already be in the directory.
 */
export function workspaceAccess({ clerkId, isHouse, emailVerified, byClerk, byEmail }) {
  if (byClerk) return { allow: true };
  if (emailLooksVerified(emailVerified) && byEmail) {
    if (byEmail.clerkId && byEmail.clerkId !== clerkId && !isUnboundClerkId(byEmail.clerkId)) {
      return { allow: false, reason: "That email already belongs to another account." };
    }
    return { allow: true };
  }
  if (emailLooksVerified(emailVerified) && isHouse) return { allow: true };
  return { allow: false, reason: "This workspace is invite-only." };
}

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
 * Unknown non-house sign-ins are refused rather than auto-activated.
 */
export function memberBindPlan({ clerkId, identityEmail, emailVerified, byClerk, byEmail, isHouse }) {
  if (byClerk) {
    return { action: "update", target: byClerk, claimEmail: emailVerified === true };
  }
  if (emailLooksVerified(emailVerified) && byEmail) {
    if (byEmail.clerkId && byEmail.clerkId !== clerkId && !isUnboundClerkId(byEmail.clerkId)) {
      return { action: "refuse", reason: "That email already belongs to another account." };
    }
    return { action: "update", target: byEmail, claimEmail: true };
  }
  if (isHouse && emailLooksVerified(emailVerified)) {
    return { action: "create", claimEmail: true };
  }
  if (isHouse) {
    return { action: "refuse", reason: "Verify your studio email to join." };
  }
  return { action: "refuse", reason: "This workspace is invite-only." };
}

/**
 * Whose declared mailboxes a cron or on-demand sync may actually read.
 * Cron requires googleSyncConsent on the member row. On-demand (callerEmail set)
 * only reads that person's mailbox — pressing sync is consent for yourself.
 */
export function mailboxSyncTargets(members, { declaredEmails, callerEmail } = {}) {
  const declared = declaredEmails instanceof Set
    ? declaredEmails
    : new Set((declaredEmails || []).map((e) => String(e || "").trim().toLowerCase()).filter(Boolean));
  const caller = String(callerEmail || "").trim().toLowerCase();
  return (members || []).filter((m) => {
    if (!m || m.status !== "active" || !m.clerkId || !m.email) return false;
    const email = String(m.email).trim().toLowerCase();
    if (!declared.has(email)) return false;
    if (caller) return email === caller;
    return m.googleSyncConsent === true;
  });
}
