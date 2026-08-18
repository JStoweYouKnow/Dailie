/**
 * Removes meeting notes that came from a Gmail / Google Calendar import, along with
 * the follow-up tasks those imports created.
 *
 * The board lives in the browser, so this runs in the browser: open Dailie, open
 * DevTools (Cmd+Option+J), paste this whole file into the Console, press Enter, then:
 *
 *     dailieCleanup.preview()   // shows exactly what would go, changes nothing
 *     dailieCleanup.remove()    // deletes it and reloads the page
 *
 * If a Google Calendar feed is still subscribed, its events are re-pulled on the next
 * load — preview() warns you, and remove({ disconnectFeeds: true }) unsubscribes too.
 *
 * Anything you typed by hand is left alone — only records carrying an import marker
 * are matched.
 */
(() => {
  const KEYS = ["dailie-data-v6", "dailie-data-v5", "dailie-data-v4", "dailie-data-v3"];

  // Markers the importers stamp on every meeting they create.
  const IMPORT_ID_PREFIX = /^(gmail-|ics-)/;
  const IMPORT_ATTENDEES = ["google calendar sync", "gmail contacts"];

  const isImported = (meeting) => {
    if (!meeting) return false;
    if (IMPORT_ID_PREFIX.test(String(meeting.id || ""))) return true;
    return IMPORT_ATTENDEES.includes(String(meeting.attendees || "").trim().toLowerCase());
  };

  const readKey = (key) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  };

  const scan = () => {
    const found = [];
    for (const key of KEYS) {
      const data = readKey(key);
      if (!data || !Array.isArray(data.meetings)) continue;

      const doomed = data.meetings.filter(isImported);
      const doomedIds = new Set(doomed.map((m) => m.id));
      // Tasks created by those imports go too; tasks you wrote yourself stay.
      const tasks = (data.tasks || []).filter(
        (t) => t.meetingId && doomedIds.has(t.meetingId) && (t.source === "calendar" || t.source === "meeting")
      );
      found.push({ key, data, doomed, tasks, keeping: data.meetings.length - doomed.length });
    }
    return found;
  };

  const describe = (results) => {
    let total = 0;
    for (const r of results) {
      console.log(
        `%c${r.key}%c  ${r.doomed.length} imported meeting(s) to remove, ${r.keeping} kept, ${r.tasks.length} linked task(s)`,
        "font-weight:bold", "font-weight:normal"
      );
      if (r.doomed.length) {
        console.table(r.doomed.map((m) => ({
          title: m.title,
          when: new Date(m.date).toLocaleString(),
          attendees: (m.attendees || "").slice(0, 40),
          id: m.id,
        })));
      }
      total += r.doomed.length;
    }
    if (!total) console.log("Nothing matched — no imported meeting notes are stored.");

    const feeds = feedsInUse(results);
    if (feeds.length) {
      console.warn(
        `${feeds.length} calendar feed(s) are still subscribed (${feeds.map((f) => f.label).join(", ")}). ` +
        "Their events will be pulled back in on the next load. " +
        "Use dailieCleanup.remove({ disconnectFeeds: true }) to unsubscribe as well."
      );
    }
    return total;
  };

  const feedsInUse = (results) => {
    const seen = new Map();
    for (const r of results) {
      for (const feed of (r.data.settings && r.data.settings.calendarFeeds) || []) {
        seen.set(feed.id || feed.url, feed);
      }
    }
    return [...seen.values()];
  };

  const write = async (key, data) => {
    const payload = JSON.stringify(data);
    localStorage.setItem(key, payload);
    // loadStoredData reads window.storage first, so a stale copy there would undo this.
    if (window.storage && typeof window.storage.set === "function") {
      try { await window.storage.set(key, payload, true); } catch (e) { /* not available */ }
    }
  };

  window.dailieCleanup = {
    preview() {
      const results = scan();
      const total = describe(results);
      if (total) console.log("%cRun dailieCleanup.remove() to delete them.", "color:#e8553c;font-weight:bold");
      return total;
    },

    async remove({ disconnectFeeds = false } = {}) {
      const results = scan();
      const total = describe(results);
      if (!total) return 0;

      let removedTasks = 0;
      for (const r of results) {
        const doomedIds = new Set(r.doomed.map((m) => m.id));
        const taskIds = new Set(r.tasks.map((t) => t.id));
        const next = {
          ...r.data,
          meetings: r.data.meetings.filter((m) => !isImported(m)),
          tasks: (r.data.tasks || []).filter((t) => !taskIds.has(t.id)),
          // Calls stay — the recording is the irreplaceable part — but they lose the link.
          calls: (r.data.calls || []).map((c) => (c.meetingId && doomedIds.has(c.meetingId) ? { ...c, meetingId: null } : c)),
        };
        if (disconnectFeeds && next.settings) {
          next.settings = { ...next.settings, calendarFeeds: [] };
        }
        removedTasks += r.tasks.length;
        await write(r.key, next);
      }

      const stillSubscribed = disconnectFeeds ? [] : feedsInUse(results);
      console.log(
        `%cRemoved ${total} meeting(s) and ${removedTasks} task(s)` +
        (disconnectFeeds ? " and unsubscribed every calendar feed" : "") + ". Reloading…",
        "color:#7c9473;font-weight:bold"
      );
      if (stillSubscribed.length) {
        console.warn("Heads up: subscribed feeds will re-import their events on this reload.");
      }
      setTimeout(() => location.reload(), 600);
      return total;
    },
  };

  console.log("%cDailie cleanup ready.", "color:#a7b3a4;font-weight:bold");
  console.log("Run dailieCleanup.preview() to see what would be removed, then dailieCleanup.remove().");
})();
