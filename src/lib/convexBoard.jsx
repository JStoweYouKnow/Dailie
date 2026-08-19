import { useMemo, useCallback, useRef, useEffect, useState } from "react";
import { ConvexReactClient, useQuery, useMutation } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useAuth } from "@clerk/clerk-react";
import { api } from "../../convex/_generated/api";
import { normalizeData, SEED_DATA } from "./model";
import { AUTH_ENABLED } from "./auth";
import { uid } from "./format";
import { fromSharedBoard, toSharedPayload, hasLocalContent, SHARED_COLLECTIONS } from "./sharedBoard";
import { loadStoredData } from "./store";

/**
 * The shared board.
 *
 * Reads are one live query, so a project someone else adds shows up here without a
 * refresh. Writes are per record rather than whole-board, so two people editing
 * different projects at the same time do not overwrite each other.
 *
 * Without VITE_CONVEX_URL none of this loads and the app keeps its browser-local
 * board — the same degradation the auth layer uses, so a missing deployment is a
 * smaller product rather than a broken one.
 */
export const CONVEX_URL = import.meta.env.VITE_CONVEX_URL || "";

/**
 * The shared board is only reachable with a session — every function requires an
 * identity — and its provider reads Clerk's useAuth, which throws outside a
 * ClerkProvider. So a Convex URL without a publishable key is not a half-working
 * setup, it is a crash; fall back to the local board instead.
 */
export const SHARED_ENABLED = !!CONVEX_URL && AUTH_ENABLED;

export const convexClient = SHARED_ENABLED ? new ConvexReactClient(CONVEX_URL) : null;

export function SharedProvider({ children }) {
  if (!SHARED_ENABLED) return children;
  return (
    <ConvexProviderWithClerk client={convexClient} useAuth={useAuth}>
      {children}
    </ConvexProviderWithClerk>
  );
}

/** Mirrors useBoardStore's API, backed by the shared board instead of localStorage. */
export function useSharedBoard(account) {
  const board = useQuery(api.board.get, {});
  const put = useMutation(api.board.put);
  const removeRecord = useMutation(api.board.remove);
  const putMany = useMutation(api.board.putMany);
  const setWorkspace = useMutation(api.board.setWorkspace);
  const touchMember = useMutation(api.board.touchMember);
  const seed = useMutation(api.board.seed);
  const merge = useMutation(api.board.merge);

  const [saveError, setSaveError] = useState("");
  // Records sitting in this browser that the shared board has never seen.
  const [pendingLocal, setPendingLocal] = useState(null);
  const [toast, setToast] = useState(null);
  const seeded = useRef(false);
  const announced = useRef(false);

  const showToast = useCallback((message, tone = "info") => setToast({ id: uid(), message, tone }), []);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(t);
  }, [toast]);

  const fallback = useMemo(() => normalizeData(SEED_DATA), []);
  const data = useMemo(() => fromSharedBoard(board, fallback), [board, fallback]);
  const loading = board === undefined;

  // Anyone who signs in joins the directory, which is what the team list reads from.
  useEffect(() => {
    if (!account || loading) return;
    touchMember({ name: account.name, email: account.email, imageUrl: account.imageUrl || "" })
      .catch(() => { /* the next sign-in retries */ });
  }, [account && account.id, loading, touchMember]);

  // First run on a fresh deployment: lift whatever this browser was holding.
  useEffect(() => {
    if (loading || seeded.current || !board) return;
    const empty = SHARED_COLLECTIONS.every((name) => !(board.collections && board.collections[name] || []).length);
    if (!empty) { seeded.current = true; return; }
    seeded.current = true;
    (async () => {
      const local = await loadStoredData();
      if (!hasLocalContent(local)) return;
      const result = await seed(toSharedPayload(local)).catch(() => null);
      if (result && result.seeded && !announced.current) {
        announced.current = true;
        showToast(`Moved ${result.count} records into the shared board.`, "success");
      }
    })();
  }, [loading, board, seed, showToast]);

  /**
   * Anyone who used the board before it was shared still has those records in their
   * own browser. `seed` only fires on an empty board, so everyone after the first
   * person needs a way to contribute theirs — this counts what is still only local.
   */
  useEffect(() => {
    if (loading || !board) return;
    let cancelled = false;
    (async () => {
      const local = await loadStoredData();
      const counts = {};
      for (const name of SHARED_COLLECTIONS) {
        const shared = new Set(((board.collections && board.collections[name]) || []).map((r) => String(r.id)));
        const missing = (local[name] || []).filter((r) => r && r.id && !shared.has(String(r.id)));
        if (missing.length) counts[name] = missing.length;
      }
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      if (!cancelled) setPendingLocal(total ? { counts, total } : null);
    })();
    return () => { cancelled = true; };
  }, [loading, board]);

  const publishLocal = useCallback(async () => {
    const local = await loadStoredData();
    const result = await merge(toSharedPayload(local));
    setPendingLocal(null);
    showToast(
      result.total
        ? `Shared ${result.total} record${result.total === 1 ? "" : "s"} with the team.`
        : "Everything on this device is already shared.",
      "success"
    );
    return result;
  }, [merge, showToast]);

  /**
   * Restoring a backup onto a shared board must not mean "make the board look like
   * my file" — that would delete every record a colleague added since. It adds what
   * is missing and leaves the rest alone.
   */
  const importBoard = useCallback(async (parsed) => {
    const result = await merge(toSharedPayload(normalizeData(parsed)));
    showToast(
      result.total
        ? `Added ${result.total} record${result.total === 1 ? "" : "s"} from the backup${result.skipped ? `, ${result.skipped} already there` : ""}.`
        : "Everything in that backup is already on the board.",
      "success"
    );
  }, [merge, showToast]);

  const guard = (promise) => promise.catch((err) => setSaveError(err.message || "Could not save to the shared board."));

  const add = useCallback((collection, record, { prepend = true } = {}) => {
    const item = { id: uid(), createdAt: Date.now(), ...record };
    guard(put({ collection, docId: String(item.id), data: item }));
    return item;
  }, [put]);

  const update = useCallback((collection, id, changes) => {
    const current = (data[collection] || []).find((r) => r.id === id);
    if (!current) return;
    const delta = typeof changes === "function" ? changes(current) : changes;
    guard(put({ collection, docId: String(id), data: { ...current, ...delta } }));
  }, [data, put]);

  const remove = useCallback((collection, id) => {
    guard(removeRecord({ collection, docId: String(id) }));
  }, [removeRecord]);

  const updateSettings = useCallback((changes) => {
    guard(setWorkspace({ key: "settings", value: { ...data.settings, ...changes } }));
  }, [data.settings, setWorkspace]);

  const updateProject = useCallback((id, changes, note) => {
    const current = (data.projects || []).find((p) => p.id === id);
    if (!current) return;
    const delta = typeof changes === "function" ? changes(current) : changes;
    const history = note ? [...(current.history || []), { id: uid(), date: Date.now(), note }] : current.history;
    guard(put({ collection: "projects", docId: String(id), data: { ...current, ...delta, updatedAt: Date.now(), history } }));
  }, [data.projects, put]);

  /**
   * Bulk edits. `patch` is how views change a whole collection at once (reordering a
   * pipeline, rebuilding the directory from mail), so each touched collection is
   * written in one mutation rather than record by record.
   */
  const patch = useCallback((updateOrDelta) => {
    const delta = typeof updateOrDelta === "function" ? updateOrDelta(data) : updateOrDelta;
    for (const [key, value] of Object.entries(delta || {})) {
      if (key === "settings") guard(setWorkspace({ key: "settings", value }));
      else if (key === "pipelines") guard(setWorkspace({ key: "pipelines", value }));
      else if (SHARED_COLLECTIONS.includes(key) && Array.isArray(value)) guard(putMany({ collection: key, records: value }));
      // `team` is the directory and is not writable from the client.
    }
  }, [data, setWorkspace, putMany]);

  const currentUser = useMemo(() => {
    if (account) {
      const hit = data.team.find((m) => m.clerkId === account.id || (m.email || "").toLowerCase() === account.email);
      if (hit) return hit;
    }
    return data.team.find((m) => m.id === data.settings.currentUserId) || data.team[0] || null;
  }, [data.team, data.settings.currentUserId, account]);

  const nameOf = (list, id, field = "name") => {
    const hit = (list || []).find((x) => x.id === id);
    return hit ? hit[field] : "";
  };

  return {
    data,
    loading,
    saveError,
    shared: true,
    patch, add, update, remove, updateSettings, updateProject,
    setData: () => { /* the shared board is the source of truth */ },
    persist: () => {},
    reload: async () => data,
    currentUser,
    memberName: useCallback((id) => nameOf(data.team, id), [data.team]),
    projectName: useCallback((id) => nameOf(data.projects, id, "title"), [data.projects]),
    companyName: useCallback((id) => nameOf(data.companies, id), [data.companies]),
    personName: useCallback((id) => nameOf(data.people, id), [data.people]),
    toast, showToast,
    pendingLocal, publishLocal, importBoard,
    linkAccount: () => { /* handled by touchMember */ },
  };
}
