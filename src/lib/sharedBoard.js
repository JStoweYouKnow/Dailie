/**
 * Shape helpers for moving the board between the browser-local copy and the shared
 * one. Kept separate from the React layer so the mapping can be tested on its own.
 */
import { normalizeData } from "./model";

/** Collections that live as rows in the shared board. */
export const SHARED_COLLECTIONS = [
  "companies", "people", "projects", "tasks", "notes", "meetings",
  "calls", "emails", "contracts", "invoices", "payments", "talent",
  "events", "press", "legal", "logs",
];

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

/** True when a local board holds anything worth lifting into the shared one. */
export function hasLocalContent(data) {
  return SHARED_COLLECTIONS.some((name) => Array.isArray(data[name]) && data[name].length > 0);
}
