/**
 * Shape helpers for moving the board between the browser-local copy and the shared
 * one. Kept separate from the React layer so the mapping can be tested on its own.
 */
import { normalizeData, SEED_DATA } from "./model.js";

/** Collections that live as rows in the shared board. */
export const SHARED_COLLECTIONS = [
  "companies", "people", "projects", "tasks", "notes", "meetings",
  "calls", "emails", "contracts", "invoices", "payments", "talent",
  "events", "press", "slate", "social", "legal", "mandates", "pitches", "logs", "notifications",
];

export function isSharedCollection(name) {
  return SHARED_COLLECTIONS.includes(name);
}

/**
 * The canned demo board every empty browser starts with (Obsidian Echo, A24, …).
 * Sharing that with the team is never useful — it is sample data, not someone's work.
 */
const SEED_RECORD_IDS = (() => {
  const ids = new Set();
  for (const name of SHARED_COLLECTIONS) {
    for (const record of SEED_DATA[name] || []) {
      if (record && record.id) ids.add(String(record.id));
    }
  }
  return ids;
})();

export function isSeedRecordId(id) {
  return SEED_RECORD_IDS.has(String(id || ""));
}

/** Drop the canned demo rows so they cannot be lifted onto the shared board. */
export function withoutSeedRecords(data) {
  const next = { ...(data || {}) };
  for (const name of SHARED_COLLECTIONS) {
    const list = Array.isArray(data && data[name]) ? data[name] : [];
    next[name] = list.filter((r) => r && r.id && !isSeedRecordId(r.id));
  }
  return next;
}

/**
 * Records on this device that the shared board has never seen, excluding the canned
 * demo. Used for the "Share with the team" banner so sample data cannot keep offering
 * itself after every sign-in.
 */
export function pendingLocalContribution(local, sharedCollections) {
  const counts = {};
  for (const name of SHARED_COLLECTIONS) {
    const shared = new Set(
      ((sharedCollections && sharedCollections[name]) || []).map((r) => String(r && r.id))
    );
    const missing = (local[name] || []).filter(
      (r) => r && r.id && !isSeedRecordId(r.id) && !shared.has(String(r.id))
    );
    if (missing.length) counts[name] = missing.length;
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return total ? { counts, total } : null;
}

/**
 * Just the records.
 *
 * Contributing to a board someone else already set up must not carry your own
 * settings or pipelines across — those are the team's, and a joiner should not
 * silently redefine them. Only `seed`, which runs on a genuinely empty board,
 * takes those too.
 */
export function toRecordsPayload(data) {
  const { collections } = toSharedPayload(data);
  return { collections };
}

/** Local board -> the payload the seed mutation expects. */
export function toSharedPayload(data) {
  const collections = {};
  for (const name of SHARED_COLLECTIONS) {
    collections[name] = Array.isArray(data[name]) ? data[name] : [];
  }
  return { collections, settings: data.settings || null, pipelines: data.pipelines || null };
}

/**
 * Shared board -> the shape every view already reads.
 *
 * The team comes from the directory rather than from a stored collection: anyone who
 * has signed in is a member, which is what makes a new colleague appear without
 * anyone adding them by hand.
 */
export function fromSharedBoard(board, fallback) {
  if (!board) return fallback;
  const merged = {
    ...fallback,
    ...Object.fromEntries(SHARED_COLLECTIONS.map((name) => [name, (board.collections && board.collections[name]) || []])),
    team: (board.team && board.team.length) ? board.team : fallback.team,
    settings: board.settings || fallback.settings,
    pipelines: board.pipelines || fallback.pipelines,
  };
  // Runs the same migrations and defaults a local board gets, so shared and local
  // boards can never drift into different shapes.
  return normalizeData(merged);
}

/** True when a local board holds real work, not just the canned demo. */
export function hasLocalContent(data) {
  const real = withoutSeedRecords(data);
  return SHARED_COLLECTIONS.some((name) => Array.isArray(real[name]) && real[name].length > 0);
}
