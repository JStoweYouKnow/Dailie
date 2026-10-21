/** Addresses that belong to the studio, not a contractor inbox. */
export const HOUSE_DOMAINS = ["matriarch-studios.com", "thewizardofops.app"];

/** Stored on the members row. Authorize from this, not from the JWT email domain. */
export const HOUSE_ROLE = "house";
export const CONTRACTOR_ROLE = "contractor";

export function isHouseEmail(email) {
  const domain = String(email || "").trim().toLowerCase().split("@")[1] || "";
  if (!domain) return false;
  return HOUSE_DOMAINS.some((allowed) => domain === allowed || domain.endsWith(`.${allowed}`));
}

/**
 * House vs contractor for this sign-in. Verified house email upgrades; a missing
 * emailVerified claim keeps an existing house (or legacy empty) role so a JWT
 * that omits the claim does not demote a studio account.
 */
export function nextMemberRole({ currentRole, email, emailVerified } = {}) {
  if (emailLooksVerified(emailVerified) && isHouseEmail(email)) return HOUSE_ROLE;
  if (emailLooksVerified(emailVerified)) return CONTRACTOR_ROLE;
  if (currentRole === HOUSE_ROLE) return HOUSE_ROLE;
  if (!currentRole && isHouseEmail(email)) return HOUSE_ROLE;
  return CONTRACTOR_ROLE;
}

/**
 * Server house check. Stored role wins. Legacy empty role on an existing member
 * with a house email still counts so older rows keep working until touchMember
 * backfills. First-time join (no row) still requires a verified house email.
 */
export function isHouseMember(member, identity = {}) {
  if (member && member.role === HOUSE_ROLE) return true;
  if (member && member.role === CONTRACTOR_ROLE) return false;
  const email = (identity && identity.email) || (member && member.email) || "";
  if (member && isHouseEmail(member.email || email)) return true;
  return emailLooksVerified(identity && identity.emailVerified) && isHouseEmail(email);
}

/** UI helper. Prefer the members.role Convex already returned. */
export function isHouseViewer({ role, email, authEnabled = true } = {}) {
  if (!authEnabled) return true;
  if (role === HOUSE_ROLE) return true;
  if (role === CONTRACTOR_ROLE) return false;
  return isHouseEmail(email);
}

/** Workspace keys a signed-in member may write. Sync state stays internal. */
export const PUBLIC_WORKSPACE_KEYS = ["settings", "pipelines"];

/**
 * Finance, legal, and mailbox history. Contractors can use the rest of the board;
 * these collections are house-only so a joiner cannot wipe production records.
 */
export const HOUSE_ONLY_COLLECTIONS = ["contracts", "invoices", "payments", "emails", "legal", "dealUpdates"];

export function canWriteCollection(collection, { isHouse } = {}) {
  if (isHouse) return true;
  return !HOUSE_ONLY_COLLECTIONS.includes(collection);
}

/** Same list as writes: contractors must not read mail, legal, or finance. */
export function canReadCollection(collection, { isHouse } = {}) {
  return canWriteCollection(collection, { isHouse });
}

/**
 * A single record in a shared collection can be house-only too — a follow-up task
 * whose title came out of a client's email, say. Contractors neither see such a
 * record nor overwrite or delete it.
 */
export function isHouseOnlyRecord(record) {
  return !!(record && typeof record === "object" && record.houseOnly === true);
}

export function canReadRecord(collection, record, { isHouse } = {}) {
  if (!canReadCollection(collection, { isHouse })) return false;
  return isHouse || !isHouseOnlyRecord(record);
}

/** `prior` is the stored copy; a contractor cannot take over a house-only row by rewriting it. */
export function canWriteRecord(collection, { prior, next } = {}, { isHouse } = {}) {
  if (!canWriteCollection(collection, { isHouse })) return false;
  if (isHouse) return true;
  return !isHouseOnlyRecord(prior) && !isHouseOnlyRecord(next);
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
 * Layout/recording prefs a contractor may change on the shared settings row.
 * Org mailboxes, calendars, SLA window, and actor id stay house-only.
 */
export const CONTRACTOR_SETTINGS_KEYS = ["projectColumnOrder", "autoArmRecording"];

/**
 * Contractors can use the board; only house members may change org settings.
 * Non-house writes start from the prior document and overlay the allowlist.
 */
export function lockSharedSettings(value, { isHouse, prior } = {}) {
  const next = asObject(value);
  if (isHouse) return next;
  const locked = asObject(prior);
  for (const key of CONTRACTOR_SETTINGS_KEYS) {
    if (Object.prototype.hasOwnProperty.call(next, key)) locked[key] = next[key];
  }
  return locked;
}

/** Display name and photo come from the Clerk JWT, never the client payload. */
export function pictureUrlFromIdentity(identity) {
  const url = String((identity && (identity.pictureUrl || identity.picture)) || "").trim();
  if (!url) return "";
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return "";
    const host = parsed.hostname.toLowerCase();
    if (host === "img.clerk.com" || host.endsWith(".clerk.com") || host.endsWith(".clerk.accounts.dev")) {
      return url;
    }
  } catch {
    return "";
  }
  return "";
}

export function memberDisplayFromIdentity(identity, prior = {}) {
  const jwtName = String((identity && (identity.name || identity.nickname)) || "").trim().slice(0, 120);
  const fromEmail = String((identity && identity.email) || "").trim();
  const local = fromEmail.includes("@") ? fromEmail.split("@")[0] : "";
  const name = jwtName || String(prior.name || "").trim() || local || "New member";
  return {
    name: name.slice(0, 120),
    imageUrl: pictureUrlFromIdentity(identity) || String(prior.imageUrl || ""),
  };
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
 * only reads that person's mailbox — that run is not standing cron consent.
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
