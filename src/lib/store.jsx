import { createContext, useContext, useCallback, useMemo, useState, useEffect } from "react";
import { uid } from "./format";
import { normalizeData, SEED_DATA, STORAGE_KEY, LEGACY_KEYS, stageInfo, assignmentNotices } from "./model";

const StoreContext = createContext(null);

export async function loadStoredData() {
  // window.storage is the host-provided sync store; localStorage is the fallback.
  try {
    if (window.storage && typeof window.storage.get === "function") {
      const res = await window.storage.get(STORAGE_KEY, true);
      if (res && res.value) return normalizeData(JSON.parse(res.value));
    }
  } catch (e) { /* fall through to localStorage */ }

  for (const key of [STORAGE_KEY, ...LEGACY_KEYS]) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return normalizeData(JSON.parse(raw));
    } catch (e) { /* try the next key */ }
  }
  return normalizeData(SEED_DATA);
}

export async function saveStoredData(data) {
  const payload = JSON.stringify(data);
  let stored = false;
  try {
    if (window.storage && typeof window.storage.set === "function") {
      await window.storage.set(STORAGE_KEY, payload, true);
      stored = true;
    }
  } catch (e) { /* fall through */ }
  try {
    localStorage.setItem(STORAGE_KEY, payload);
    stored = true;
  } catch (e) {
    if (!stored) throw new Error("Storage is full — export a backup and remove old recordings.");
  }
}

export function StoreProvider({ value, children }) {
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside a StoreProvider");
  return ctx;
}

/**
 * One place that owns the board. Views call add/update/remove on a named collection
 * instead of threading a dozen setters through props.
 */
export function useBoardStore() {
  const [data, setData] = useState(() => normalizeData(SEED_DATA));
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState("");
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, tone = "info") => {
    setToast({ id: uid(), message, tone });
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(t);
  }, [toast]);

  const persist = useCallback((next) => {
    setData(next);
    saveStoredData(next).then(
      () => setSaveError(""),
      (err) => setSaveError(err.message || "Failed to save changes.")
    );
    return next;
  }, []);

  const reload = useCallback(async () => {
    const stored = await loadStoredData();
    setData(stored);
    return stored;
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await reload();
      setLoading(false);
    })();
  }, [reload]);

  /** patch may be an object or a function of the current board. */
  const patch = useCallback((update) => {
    setData((current) => {
      const delta = typeof update === "function" ? update(current) : update;
      const next = { ...current, ...delta };
      saveStoredData(next).then(
        () => setSaveError(""),
        (err) => setSaveError(err.message || "Failed to save changes.")
      );
      return next;
    });
  }, []);

  /** Folds any new assignment notices into the same write as the change itself. */
  const withNotices = (current, notices, delta) => (
    notices.length
      ? {
        ...delta,
        notifications: [
          ...notices.map((n) => ({ ...n, id: uid() })),
          ...(current.notifications || []),
        ],
      }
      : delta
  );

  const add = useCallback((collection, record, { prepend = true } = {}) => {
    const item = { id: uid(), createdAt: Date.now(), ...record };
    patch((current) => withNotices(
      current,
      assignmentNotices(collection, null, item, current.settings.currentUserId),
      { [collection]: prepend ? [item, ...(current[collection] || [])] : [...(current[collection] || []), item] },
    ));
    return item;
  }, [patch]);

  const update = useCallback((collection, id, changes) => {
    patch((current) => {
      let notices = [];
      const list = (current[collection] || []).map((item) => {
        if (item.id !== id) return item;
        const delta = typeof changes === "function" ? changes(item) : changes;
        const next = { ...item, ...delta };
        notices = assignmentNotices(collection, item, next, current.settings.currentUserId);
        return next;
      });
      return withNotices(current, notices, { [collection]: list });
    });
  }, [patch]);

  const remove = useCallback((collection, id) => {
    patch((current) => ({ [collection]: (current[collection] || []).filter((item) => item.id !== id) }));
  }, [patch]);

  const updateSettings = useCallback((changes) => {
    patch((current) => ({ settings: { ...current.settings, ...changes } }));
  }, [patch]);

  /** Project edits also write the activity log, so history stays truthful. */
  const updateProject = useCallback((id, changes, note) => {
    patch((current) => {
      let notices = [];
      const projects = current.projects.map((p) => {
        if (p.id !== id) return p;
        const delta = typeof changes === "function" ? changes(p) : changes;
        const history = note ? [...(p.history || []), { id: uid(), date: Date.now(), note }] : p.history;
        const next = { ...p, ...delta, updatedAt: Date.now(), history };
        notices = assignmentNotices("projects", p, next, current.settings.currentUserId);
        return next;
      });
      return withNotices(current, notices, { projects });
    });
  }, [patch]);

  /**
   * Ties the signed-in Clerk account to a row in `team`, which is what task
   * assignment, "My projects" and the Home board all key off. Matching prefers the
   * Clerk id, then the email, then the name, so an account that signs in after
   * someone already typed them into the team lands on that row rather than
   * creating a duplicate.
   */
  const linkAccount = useCallback((account) => {
    if (!account) return;
    setData((current) => {
      const team = current.team || [];
      const email = (account.email || "").toLowerCase();
      const existing =
        team.find((m) => m.clerkId === account.id) ||
        team.find((m) => m.email && m.email.toLowerCase() === email && email) ||
        team.find((m) => m.name && m.name.toLowerCase() === account.name.toLowerCase());

      // Already linked and already selected — nothing to write.
      if (existing && existing.clerkId === account.id && current.settings.currentUserId === existing.id) {
        return current;
      }

      const member = existing
        ? { ...existing, clerkId: account.id, email: existing.email || email, name: existing.name || account.name }
        : { id: uid(), name: account.name, email, role: "", clerkId: account.id };

      const next = {
        ...current,
        team: existing ? team.map((m) => (m.id === member.id ? member : m)) : [...team, member],
        settings: { ...current.settings, currentUserId: member.id },
      };
      saveStoredData(next).catch(() => { /* surfaced by the next write */ });
      return next;
    });
  }, []);

  const currentUser = useMemo(
    () => data.team.find((m) => m.id === data.settings.currentUserId) || data.team[0] || null,
    [data.team, data.settings.currentUserId]
  );

  const memberName = useCallback(
    (id) => {
      const m = data.team.find((x) => x.id === id);
      return m ? m.name : "";
    },
    [data.team]
  );

  const projectName = useCallback(
    (id) => {
      const p = data.projects.find((x) => x.id === id);
      return p ? p.title : "";
    },
    [data.projects]
  );

  const companyName = useCallback(
    (id) => {
      const c = data.companies.find((x) => x.id === id);
      return c ? c.name : "";
    },
    [data.companies]
  );

  const personName = useCallback(
    (id) => {
      const p = data.people.find((x) => x.id === id);
      return p ? p.name : "";
    },
    [data.people]
  );

  return {
    data, setData, persist, patch, add, update, remove, updateSettings, updateProject,
    reload, loading, saveError, currentUser, memberName, projectName, companyName, personName, linkAccount,
    shared: false, pendingLocal: null, publishLocal: null,
    denied: false, deniedReason: "",
    inviteMember: null, removeMember: null, setGoogleSyncConsent: null,
    // A private board has no one else's work to protect, so a restore replaces it.
    importBoard: async (parsed) => patch(normalizeData(parsed)),
    toast, showToast, stageInfo,
  };
}
