import { useMemo, useCallback, useRef, useEffect, useState } from "react";
import { ConvexReactClient, useQuery, useMutation, useConvexAuth } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useAuth } from "@clerk/clerk-react";
import { api } from "../../convex/_generated/api";
import { normalizeData, SEED_DATA, assignmentNotices } from "./model";
import { AUTH_ENABLED } from "./auth";
import { uid } from "./format";
import { fromSharedBoard, toSharedPayload, toRecordsPayload, hasLocalContent, withoutSeedRecords, pendingLocalContribution, SHARED_COLLECTIONS } from "./sharedBoard";
import { loadStoredData } from "./store";
import { canWriteCollection, isHouseEmail } from "./houseAccess";

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

// A Convex mutation takes a bounded argument payload, and an imported mailbox is far
// past it. Records are written in batches of this many.
const CHUNK_SIZE = 200;

/** Convex rejects `undefined` anywhere in a mutation argument. */
function convexData(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

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
  const { isLoading: authLoading, isAuthenticated } = useConvexAuth();
  const board = useQuery(api.board.get, isAuthenticated ? {} : "skip");
  const put = useMutation(api.board.put);
  const removeRecord = useMutation(api.board.remove);
  const putMany = useMutation(api.board.putMany);
  const pruneCollection = useMutation(api.board.pruneCollection);
  const setWorkspace = useMutation(api.board.setWorkspace);
  const touchMember = useMutation(api.board.touchMember);
  const inviteMember = useMutation(api.board.inviteMember);
  const removeMember = useMutation(api.board.removeMember);
  const setGoogleSyncConsent = useMutation(api.board.setGoogleSyncConsent);
  const seed = useMutation(api.board.seed);
  const merge = useMutation(api.board.merge);

  const [saveError, setSaveError] = useState("");
  // Records sitting in this browser that the shared board has never seen.
  const [pendingLocal, setPendingLocal] = useState(null);
  /**
   * Edits applied locally while their write is in flight.
   *
   * Without this an inline field re-syncs from the server value the moment it
   * commits — and that value has not come back yet, so the edit appears to revert
   * and the record looks uneditable. The local board never showed this because its
   * writes are synchronous.
   */
  const [overlay, setOverlay] = useState({});
  const inFlight = useRef(0);
  const [toast, setToast] = useState(null);
  const [authGaveUp, setAuthGaveUp] = useState(false);
  const seeded = useRef(false);
  const announced = useRef(false);

  const showToast = useCallback((message, tone = "info") => setToast({ id: uid(), message, tone }), []);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(t);
  }, [toast]);

  const denied = !!(board && board.denied);
  const deniedReason = denied ? (board.reason || "This workspace is invite-only.") : "";
  const fallback = useMemo(() => normalizeData(SEED_DATA), []);
  const liveBoard = denied ? null : board;
  const serverData = useMemo(() => fromSharedBoard(liveBoard, fallback), [liveBoard, fallback]);
  const data = useMemo(() => {
    const keys = Object.keys(overlay);
    if (!keys.length) return serverData;
    const next = { ...serverData };
    for (const key of keys) {
      const at = key.indexOf(":");
      const collection = key.slice(0, at);
      const id = key.slice(at + 1);
      const record = overlay[key];
      const list = [...(next[collection] || [])];
      const idx = list.findIndex((r) => String(r.id) === id);
      if (record === null) {
        if (idx >= 0) list.splice(idx, 1);
      } else if (idx >= 0) {
        list[idx] = record;
      } else {
        list.unshift(record);
      }
      next[collection] = list;
    }
    return next;
  }, [serverData, overlay]);
  const loading = authLoading || !isAuthenticated || (board == null && !denied);

  // Clerk can be signed in while Convex still has no JWT (missing "convex" template
  // or a mismatched CLERK_JWT_ISSUER_DOMAIN). Wait a beat, then fall through to the
  // local board rather than spinning forever.
  useEffect(() => {
    if (isAuthenticated) {
      setAuthGaveUp(false);
      return undefined;
    }
    if (authLoading) return undefined;
    const t = setTimeout(() => setAuthGaveUp(true), 8000);
    return () => clearTimeout(t);
  }, [isAuthenticated, authLoading]);

  // Known members and verified house emails join (or refresh) the directory.
  useEffect(() => {
    if (!account || loading || denied) return;
    touchMember({ name: account.name, email: account.email, imageUrl: account.imageUrl || "" })
      .catch(() => { /* the next sign-in retries */ });
  }, [account && account.id, loading, denied, touchMember]);

  // First run on a fresh deployment: lift whatever this browser was holding.
  useEffect(() => {
    if (loading || denied || seeded.current || !liveBoard) return;
    const empty = SHARED_COLLECTIONS.every((name) => !(liveBoard.collections && liveBoard.collections[name] || []).length);
    if (!empty) { seeded.current = true; return; }
    seeded.current = true;
    (async () => {
      const local = withoutSeedRecords(await loadStoredData());
      if (!hasLocalContent(local)) return;
      const result = await seed(toSharedPayload(local)).catch(() => null);
      if (result && result.seeded && !announced.current) {
        announced.current = true;
        showToast(`Moved ${result.count} records into the shared board.`, "success");
      }
    })();
  }, [loading, denied, liveBoard, seed, showToast]);

  /**
   * Anyone who used the board before it was shared still has those records in their
   * own browser. `seed` only fires on an empty board, so everyone after the first
   * person needs a way to contribute theirs — this counts what is still only local.
   */
  useEffect(() => {
    if (loading || denied || !liveBoard) return;
    let cancelled = false;
    (async () => {
      const local = await loadStoredData();
      if (!cancelled) setPendingLocal(pendingLocalContribution(local, liveBoard.collections));
    })();
    return () => { cancelled = true; };
  }, [loading, denied, liveBoard]);

  const publishLocal = useCallback(async () => {
    const local = withoutSeedRecords(await loadStoredData());
    try {
      const result = await merge(toRecordsPayload(local));
      setPendingLocal(null);
      showToast(
        result.total
          ? `Shared ${result.total} record${result.total === 1 ? "" : "s"} with the team.`
          : "Everything on this device is already shared.",
        "success"
      );
      return result;
    } catch (err) {
      // Publishing failed silently before this: the promise rejected, Settings
      // stayed put, and the only sign was a console line nobody was watching.
      setSaveError(err && err.message ? err.message : "Could not share these records.");
      showToast("Could not share these records — see the message above.", "error");
      throw err;
    }
  }, [merge, showToast]);

  /**
   * Restoring a backup onto a shared board must not mean "make the board look like
   * my file" — that would delete every record a colleague added since. It adds what
   * is missing and leaves the rest alone.
   */
  const importBoard = useCallback(async (parsed) => {
    const result = await merge(toRecordsPayload(normalizeData(parsed)));
    showToast(
      result.total
        ? `Added ${result.total} record${result.total === 1 ? "" : "s"} from the backup${result.skipped ? `, ${result.skipped} already there` : ""}.`
        : "Everything in that backup is already on the board.",
      "success"
    );
  }, [merge, showToast]);

  /**
   * Shows the change immediately, then trusts the server once every write has
   * settled — clearing early would flash the pre-edit value back.
   */
  const stage = (collection, id, record) =>
    setOverlay((o) => ({ ...o, [`${collection}:${id}`]: record }));

  const settle = (promise) => {
    inFlight.current += 1;
    return promise
      .catch((err) => {
        setSaveError(err && err.message ? err.message : "Could not save to the shared board.");
        throw err;
      })
      .finally(() => {
        inFlight.current -= 1;
        if (inFlight.current === 0) setOverlay({});
      });
  };

  // Bulk writes used to fail with nothing but a red line above the header, which is
  // easy to miss when the button you pressed is halfway down the page.
  const guard = (promise) => promise.catch((err) => {
    const message = (err && err.message) || "Could not save to the shared board.";
    setSaveError(message);
    showToast("That did not save — see the message at the top of the page.", "error");
  });

  /**
   * Who the board thinks is doing the writing. Resolved the same way `currentUser` is,
   * but needed here, above it, so a write can leave itself out of its own notices.
   */
  const resolveActorId = useCallback(() => {
    const team = data.team || [];
    if (account) {
      const email = (account.email || "").toLowerCase();
      const hit = team.find((m) => m.clerkId === account.id || (m.email || "").toLowerCase() === email);
      if (hit) return hit.id;
    }
    const fallback = team.find((m) => m.id === data.settings.currentUserId) || team[0];
    return fallback ? fallback.id : null;
  }, [data.team, data.settings, account]);

  /** Notices are ordinary records, written the same way as everything else. */
  const emitNotices = useCallback((notices) => {
    notices.forEach((n) => {
      const item = { id: uid(), ...n };
      stage("notifications", String(item.id), item);
      settle(put({ collection: "notifications", docId: String(item.id), data: convexData(item) })).catch(() => {});
    });
  }, [put]);

  const houseWriter = !AUTH_ENABLED || isHouseEmail(account && account.email);
  const allowWrite = useCallback((collection) => {
    if (canWriteCollection(collection, { isHouse: houseWriter })) return true;
    showToast("Only a studio account can edit this part of the board.", "error");
    return false;
  }, [houseWriter, showToast]);

  const add = useCallback((collection, record, { prepend = true } = {}) => {
    if (!allowWrite(collection)) return null;
    const item = { id: uid(), createdAt: Date.now(), ...record };
    stage(collection, String(item.id), item);
    settle(put({ collection, docId: String(item.id), data: convexData(item) })).catch(() => {});
    emitNotices(assignmentNotices(collection, null, item, resolveActorId()));
    return item;
  }, [allowWrite, put, emitNotices, resolveActorId]);

  const update = useCallback((collection, id, changes) => {
    if (!allowWrite(collection)) return;
    const current = (data[collection] || []).find((r) => r.id === id);
    if (!current) return;
    const delta = typeof changes === "function" ? changes(current) : changes;
    const next = { ...current, ...delta };
    stage(collection, String(id), next);
    settle(put({ collection, docId: String(id), data: convexData(next) })).catch(() => {});
    emitNotices(assignmentNotices(collection, current, next, resolveActorId()));
  }, [allowWrite, data, put, emitNotices, resolveActorId]);

  const remove = useCallback((collection, id) => {
    if (!allowWrite(collection)) return;
    stage(collection, String(id), null);
    settle(removeRecord({ collection, docId: String(id) })).catch(() => {});
  }, [allowWrite, removeRecord]);

  const updateSettings = useCallback((changes) => {
    guard(setWorkspace({ key: "settings", value: { ...data.settings, ...changes } }));
  }, [data.settings, setWorkspace]);

  const updateProject = useCallback((id, changes, note) => {
    const current = (data.projects || []).find((p) => p.id === id);
    if (!current) return;
    const delta = typeof changes === "function" ? changes(current) : changes;
    const history = note ? [...(current.history || []), { id: uid(), date: Date.now(), note }] : current.history;
    const next = { ...current, ...delta, updatedAt: Date.now(), history };
    stage("projects", String(id), next);
    settle(put({ collection: "projects", docId: String(id), data: convexData(next) })).catch(() => {});
    emitNotices(assignmentNotices("projects", current, next, resolveActorId()));
  }, [data.projects, put, emitNotices, resolveActorId]);

  /**
   * A whole collection in one mutation, or several when it is too big for one.
   *
   * "Populate from email" re-sends every message it has ever imported, and a mailbox
   * of any size blows past the per-mutation argument limit — which is what made the
   * button look like it did nothing. Chunks are written with prune off, since a chunk
   * cannot tell a deleted record from one sitting in the next chunk; the final pass
   * carries the whole id list and does the pruning.
   */
  const writeCollection = useCallback(async (collection, records) => {
    if (!allowWrite(collection)) return;
    if (records.length <= CHUNK_SIZE) return putMany({ collection, records });
    for (let i = 0; i < records.length; i += CHUNK_SIZE) {
      await putMany({ collection, records: records.slice(i, i + CHUNK_SIZE), prune: false });
    }
    // Everything is stored; this last call only removes what is no longer in the list.
    return pruneCollection({ collection, keepIds: records.map((r) => String(r.id)) });
  }, [allowWrite, putMany, pruneCollection]);

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
      else if (SHARED_COLLECTIONS.includes(key) && Array.isArray(value)) guard(writeCollection(key, value));
      // `team` is the directory and is not writable from the client.
    }
  }, [data, setWorkspace, writeCollection]);

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

  const memberName = useCallback((id) => nameOf(data.team, id), [data.team]);
  const projectName = useCallback((id) => nameOf(data.projects, id, "title"), [data.projects]);
  const companyName = useCallback((id) => nameOf(data.companies, id), [data.companies]);
  const personName = useCallback((id) => nameOf(data.people, id), [data.people]);

  const invite = useCallback(async ({ name, email }) => {
    return inviteMember({ name, email });
  }, [inviteMember]);

  const removeDirectoryMember = useCallback(async (clerkId) => {
    return removeMember({ clerkId });
  }, [removeMember]);

  if (authGaveUp && !isAuthenticated) {
    throw new Error("Not signed in.");
  }

  return {
    data,
    loading,
    saveError,
    shared: true,
    denied,
    deniedReason,
    patch, add, update, remove, updateSettings, updateProject,
    inviteMember: invite,
    removeMember: removeDirectoryMember,
    setGoogleSyncConsent,
    setData: () => { /* the shared board is the source of truth */ },
    persist: () => {},
    reload: async () => data,
    currentUser,
    memberName,
    projectName,
    companyName,
    personName,
    toast, showToast,
    pendingLocal, publishLocal, importBoard,
    linkAccount: () => { /* handled by touchMember */ },
  };
}
