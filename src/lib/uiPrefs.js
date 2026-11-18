/**
 * Device-local UI preferences, scoped per signed-in user so one person's
 * deal-board layout does not overwrite everyone else's on a shared board.
 */

const DEALS_BOARD_KEY = "dailie-deals-board-v1";

const DEALS_BOARD_DEFAULTS = {
  viewMode: "pipeline",
  boardFilter: "active",
  typeFilter: "all",
  priorityFilter: "all",
  mineOnly: false,
  showArchive: false,
  projectColumnOrder: [],
};

function storageKey(base, userKey) {
  const who = String(userKey || "local").trim() || "local";
  return `${base}:${who}`;
}

function readJson(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (e) {
    return null;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    /* private mode / quota */
  }
}

function normalizeDealsBoardPrefs(raw = {}) {
  const viewMode = ["pipeline", "gallery", "table"].includes(raw.viewMode) ? raw.viewMode : DEALS_BOARD_DEFAULTS.viewMode;
  const boardFilter = ["active", "lost", "stalled", "all"].includes(raw.boardFilter)
    ? raw.boardFilter
    : DEALS_BOARD_DEFAULTS.boardFilter;
  const typeFilter = typeof raw.typeFilter === "string" && raw.typeFilter
    ? raw.typeFilter
    : DEALS_BOARD_DEFAULTS.typeFilter;
  const priorityFilter = ["all", "HIGH", "MEDIUM", "LOW"].includes(raw.priorityFilter)
    ? raw.priorityFilter
    : DEALS_BOARD_DEFAULTS.priorityFilter;
  const projectColumnOrder = Array.isArray(raw.projectColumnOrder)
    ? raw.projectColumnOrder.map(String).filter(Boolean)
    : [];
  return {
    viewMode,
    boardFilter,
    typeFilter,
    priorityFilter,
    mineOnly: !!raw.mineOnly,
    showArchive: !!raw.showArchive,
    projectColumnOrder,
  };
}

/** Load this user's saved deals-board layout, or defaults. */
export function readDealsBoardPrefs(userKey) {
  return normalizeDealsBoardPrefs(readJson(storageKey(DEALS_BOARD_KEY, userKey)) || {});
}

/** Persist deals-board layout for this user. */
export function writeDealsBoardPrefs(userKey, prefs) {
  writeJson(storageKey(DEALS_BOARD_KEY, userKey), normalizeDealsBoardPrefs(prefs || {}));
}

export { DEALS_BOARD_DEFAULTS };
