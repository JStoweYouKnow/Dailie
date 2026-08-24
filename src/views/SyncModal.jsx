import { useEffect, useState } from "react";
import { RefreshCw, Plus, X, Calendar as CalendarIcon, Trash2, CheckCircle2 } from "lucide-react";
import { useStore } from "../lib/store";
import { parseSyncPayload, isICalendarFeed } from "../calendarSync";
import { makeTask } from "../lib/model";
import { formatShort, formatClock, relativeDays, tsFromDateInput } from "../lib/format";
import { ModalShell, Field, Section, Badge, ConfirmButton } from "../ui/kit";
import { mergeSyncedMeetings, excludedMeetingList, excludedCalendarIdSet, restoreExcludedMeeting, setCalendarExcluded } from "../lib/calendarExclusions";
import { syncFromGoogle, requestGoogleAccess, googleHasScope, GOOGLE_CALENDAR_SCOPE, GOOGLE_DRIVE_SCOPE, GOOGLE_SYNC_SCOPES, shouldResumeGoogleCalendarSync, markGoogleCalendarResumeStarted, clearGoogleCalendarResume } from "../lib/googleSync";
import { useAccount, useAuthToken, useClerkUser } from "../lib/auth";
import { apiFetch } from "../lib/sessionToken";
import { isHouseEmail } from "../lib/houseAccess";

/**
 * Primary path is OAuth ("Sync my Google Calendar"). Secret iCal feeds are a fallback
 * for calendars that are not on the signed-in Google account.
 */
export default function SyncModal({ onClose }) {
  const { data, patch, add, updateSettings, currentUser, showToast } = useStore();
  const { enabled: authEnabled, account } = useAccount();
  const { user, isLoaded: userLoaded } = useClerkUser();
  const getToken = useAuthToken();
  const [googleState, setGoogleState] = useState("idle");
  const [googleError, setGoogleError] = useState("");
  const [feedUrl, setFeedUrl] = useState("");
  const [feedLabel, setFeedLabel] = useState("");
  const [busyFeed, setBusyFeed] = useState(null);
  const [error, setError] = useState("");
  const [paste, setPaste] = useState("");
  const [preview, setPreview] = useState(null);

  const canManageFeeds = !authEnabled || isHouseEmail(account && account.email);
  const feeds = data.settings.calendarFeeds || [];
  const googleCalendars = data.settings.googleCalendars || [];
  const excludedCalendars = excludedCalendarIdSet(data.settings);
  const hiddenEvents = excludedMeetingList(data.settings);

  /** Merges by event id so a repeated pull updates rather than duplicates. */
  const mergeMeetings = (incoming) => {
    const { meetings, added, updated } = mergeSyncedMeetings(data.meetings, incoming, data.settings);
    patch({ meetings });
    return { added, updated };
  };

  const syncFeed = async (feed, { persist = true } = {}) => {
    if (!feed.url) {
      setError("Only a studio account can sync a secret calendar feed.");
      return null;
    }
    setBusyFeed(feed.id);
    setError("");
    try {
      const res = await apiFetch(`/api/calendar?url=${encodeURIComponent(feed.url)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `The calendar feed returned ${res.status}.`);
      }
      const text = await res.text();
      if (!isICalendarFeed(text)) {
        throw new Error("That URL did not return a calendar. Use the Secret address in iCal format, not the calendar's web page.");
      }
      const parsed = parseSyncPayload(text);
      const stamped = parsed.meetings.map((m) => ({
        ...m,
        calendarId: `feed:${feed.id}`,
        calendarLabel: feed.label,
      }));
      const { added, updated } = mergeMeetings(stamped);
      if (persist) {
        updateSettings({
          calendarFeeds: feeds.map((f) => (f.id === feed.id ? { ...f, lastSyncedAt: Date.now(), eventCount: parsed.meetings.length } : f)),
        });
      }
      showToast(`${feed.label}: ${added} new, ${updated} updated.`, "success");
      setBusyFeed(null);
      return { eventCount: parsed.meetings.length };
    } catch (err) {
      setError(err.message || "Could not sync that calendar.");
      setBusyFeed(null);
      return null;
    }
  };

  const addFeed = async () => {
    if (!canManageFeeds) return;
    const url = feedUrl.trim();
    if (!url) return;
    const feed = { id: `feed-${Date.now()}`, label: feedLabel.trim() || "Google Calendar", url, lastSyncedAt: null };
    const synced = await syncFeed(feed, { persist: false });
    if (!synced) return;
    updateSettings({
      calendarFeeds: [...feeds, { ...feed, lastSyncedAt: Date.now(), eventCount: synced.eventCount }],
    });
    setFeedUrl("");
    setFeedLabel("");
  };

  const runGoogleSync = async ({ afterRedirect = false } = {}) => {
    setGoogleState("running");
    setGoogleError("");
    try {
      if (user && !googleHasScope(user, GOOGLE_CALENDAR_SCOPE)) {
        if (afterRedirect) {
          clearGoogleCalendarResume();
          setGoogleError(
            "Google still did not grant Calendar access. In Clerk, switch the Google connection to your own OAuth client, enable the Google Calendar API, add the calendar.readonly scope, then reconnect Google once."
          );
          setGoogleState("idle");
          return;
        }
        const access = await requestGoogleAccess(user, GOOGLE_SYNC_SCOPES);
        if (access.redirecting) return;
      } else if (user && !afterRedirect && !googleHasScope(user, GOOGLE_DRIVE_SCOPE)) {
        // Notes shared in from other organisations need Drive. Ask once, on the way
        // past — but never hold the calendar sync hostage to it: someone who declines
        // comes back without it and syncs their calendar as before.
        const access = await requestGoogleAccess(user, GOOGLE_SYNC_SCOPES);
        if (access.redirecting) return;
      }
      const result = await syncFromGoogle("calendar", {
        getToken,
        excludedCalendarIds: data.settings.excludedCalendarIds || [],
      });
      if (result.calendars) {
        updateSettings({ googleCalendars: result.calendars });
      }
      clearGoogleCalendarResume();
      const { added, updated } = mergeMeetings(result.meetings || []);
      showToast(`Google Calendar: ${added} new, ${updated} updated.`, "success");
      setGoogleState("idle");
    } catch (err) {
      if (!afterRedirect && user && (err.needsReauth || err.missingScope)) {
        try {
          const access = await requestGoogleAccess(user, GOOGLE_SYNC_SCOPES, { force: true });
          if (access.redirecting) return;
        } catch (reauthErr) {
          clearGoogleCalendarResume();
          setGoogleError(reauthErr.message || err.message || "Sync failed.");
          setGoogleState("idle");
          return;
        }
      }
      clearGoogleCalendarResume();
      setGoogleError(err.message || "Sync failed.");
      setGoogleState("idle");
    }
  };

  useEffect(() => {
    if (!userLoaded || !shouldResumeGoogleCalendarSync()) return;
    markGoogleCalendarResumeStarted();
    runGoogleSync({ afterRedirect: true });
    // Intentionally once after returning from Google consent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLoaded, user && user.id]);

  const removeFeed = (id) => {
    if (!canManageFeeds) return;
    updateSettings({ calendarFeeds: feeds.filter((f) => f.id !== id) });
  };

  const scanPaste = () => {
    if (!paste.trim()) return;
    const parsed = parseSyncPayload(paste);
    if (!parsed.meetings.length) {
      setPreview({ error: "No meeting was found in that paste. Copy a Google Calendar invite email or an .ics file's contents." });
      return;
    }
    setPreview({ meetings: parsed.meetings, kind: parsed.kind });
  };

  const commitPaste = () => {
    if (!preview || !preview.meetings) return;
    // Imported invites carry their own follow-ups; those become real tasks.
    const { added, updated } = mergeMeetings(preview.meetings.map((m) => ({ ...m, followUps: [] })));
    preview.meetings.forEach((m) => {
      (m.followUps || []).forEach((f) => {
        if (!f.text) return;
        add("tasks", makeTask({
          title: f.text,
          dueDate: f.dueDate ? tsFromDateInput(f.dueDate) : null,
          meetingId: m.id,
          source: "calendar",
          assigneeIds: currentUser ? [currentUser.id] : [],
        }, currentUser && currentUser.id));
      });
    });
    showToast(`${added} meeting${added === 1 ? "" : "s"} imported, ${updated} updated.`, "success");
    setPaste("");
    setPreview(null);
  };

  return (
    <ModalShell wide title="Connect Google Calendar" subtitle="Meetings sync into the board and the calendar" onClose={onClose}>
      {authEnabled && (
        <Section title="YOUR GOOGLE CALENDAR">
          <div style={{ fontSize: 13, color: "var(--dim)", marginBottom: 12, lineHeight: 1.55 }}>
            Pulls every calendar on the account you signed in with
            {account ? <> — <strong style={{ color: "var(--bone)" }}>{account.email}</strong></> : null},
            including subscribed ones. Google will ask for Calendar access the first time.
          </div>
          <button className="md-btn md-btn-primary" disabled={googleState === "running"}
            onClick={() => runGoogleSync()}>
            <RefreshCw size={13} className={googleState === "running" ? "md-spin" : ""} />
            {googleState === "running" ? "Syncing…" : "Sync my Google Calendar"}
          </button>
          {googleError && (
            <div style={{ fontSize: 12, color: "var(--red)", marginTop: 10, lineHeight: 1.55 }}>{googleError}</div>
          )}
          {googleCalendars.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)", letterSpacing: ".12em", marginBottom: 8, fontWeight: 700 }}>
                CALENDARS TO SYNC
              </div>
              {googleCalendars.map((cal) => {
                const on = !excludedCalendars.has(cal.id);
                return (
                  <label key={cal.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", fontSize: 13, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) => setCalendarExcluded(cal.id, !e.target.checked, {
                        meetings: data.meetings,
                        settings: data.settings,
                        patch,
                        updateSettings,
                      })}
                    />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      {cal.summary}
                      {cal.primary ? <span className="md-mono" style={{ fontSize: 10, color: "var(--dim)", marginLeft: 8 }}>PRIMARY</span> : null}
                    </span>
                  </label>
                );
              })}
              <div style={{ fontSize: 12, color: "var(--dim)", marginTop: 4, lineHeight: 1.5 }}>
                Uncheck a calendar to drop its events and skip it on the next sync. Sync again after turning one back on.
              </div>
            </div>
          )}
        </Section>
      )}

      {hiddenEvents.length > 0 && (
        <Section title={`HIDDEN FROM SYNC · ${hiddenEvents.length}`}>
          <div style={{ fontSize: 12, color: "var(--dim)", marginBottom: 10, lineHeight: 1.5 }}>
            These events stay off the board and are skipped on the next pull. Restore one to bring it back next time you sync.
          </div>
          {hiddenEvents.map((entry) => (
            <div key={entry.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid var(--rule)" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.title}</div>
                <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)" }}>
                  {[entry.calendarLabel, entry.date ? formatShort(entry.date) : ""].filter(Boolean).join(" · ")}
                </div>
              </div>
              <button className="md-btn md-btn-ghost" style={{ border: "1px solid var(--rule)", fontSize: 12 }}
                onClick={() => restoreExcludedMeeting(entry.id, { settings: data.settings, updateSettings, showToast })}>
                Restore
              </button>
            </div>
          ))}
        </Section>
      )}

      <Section title="SUBSCRIBED CALENDARS">
        {feeds.length === 0 && (
          <div style={{ fontSize: 13, color: "var(--dim)", marginBottom: 12, lineHeight: 1.6 }}>
            Prefer <strong style={{ color: "var(--bone)" }}>Sync my Google Calendar</strong> above. A subscribed feed only works with the
            <strong style={{ color: "var(--bone)" }}> Secret address in iCal format</strong> (Settings → the calendar → Integrate calendar), not a public or web URL.
          </div>
        )}
        {feeds.map((feed) => (
          <div key={feed.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: "1px solid var(--rule)", borderRadius: 10, marginBottom: 8, flexWrap: "wrap" }}>
            <CalendarIcon size={15} color="var(--accent)" />
            <div style={{ flex: "1 1 180px", minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{feed.label}</div>
              <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {feed.lastSyncedAt ? `Synced ${relativeDays(feed.lastSyncedAt)}` : "Never synced"}
              </div>
            </div>
            {canManageFeeds && feed.url && (
              <button className="md-btn md-btn-ghost" style={{ border: "1px solid var(--rule)", fontSize: 12 }} onClick={() => syncFeed(feed)} disabled={busyFeed === feed.id}>
                <RefreshCw size={12} className={busyFeed === feed.id ? "md-spin" : ""} /> {busyFeed === feed.id ? "Syncing…" : "Sync now"}
              </button>
            )}
            {canManageFeeds && (
              <ConfirmButton label="" confirmLabel="Remove?" icon={<Trash2 size={13} />} onConfirm={() => removeFeed(feed.id)} />
            )}
          </div>
        ))}

        {canManageFeeds ? (
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <input className="md-input" style={{ flex: "1 1 130px" }} placeholder="Label (e.g. Elena)" value={feedLabel} onChange={(e) => setFeedLabel(e.target.value)} />
            <input className="md-input" style={{ flex: "3 1 260px" }} placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" value={feedUrl}
              onChange={(e) => setFeedUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addFeed(); }} />
            <button className="md-btn md-btn-primary" onClick={addFeed} disabled={!feedUrl.trim()}><Plus size={13} /> Connect</button>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: "var(--dim)", marginTop: 10, lineHeight: 1.55 }}>
            Only a studio account can add or refresh a secret iCal address. Use Sync my Google Calendar for your own account.
          </div>
        )}
        {error && <div style={{ color: "var(--red)", fontSize: 12, marginTop: 10 }}>{error}</div>}
      </Section>

      <Section title="OR PASTE AN INVITE">
        <div style={{ fontSize: 12, color: "var(--dim)", marginBottom: 10 }}>
          Paste a Google Calendar invite email, or the contents of an .ics file, for a one-off import.
        </div>
        <textarea className="md-textarea" rows={6} value={paste} onChange={(e) => { setPaste(e.target.value); setPreview(null); }}
          placeholder={"Invitation: Slate Review @ Thu Aug 20, 2026 9am\nWhen: Thursday, August 20, 2026 9:00 AM\nGuests\nelena@matriarch-studios.com"} />
        {preview && preview.error && <div style={{ color: "var(--red)", fontSize: 12, marginTop: 10 }}>{preview.error}</div>}
        {preview && preview.meetings && (
          <div style={{ border: "1px solid var(--rule)", borderRadius: 10, padding: 12, marginTop: 12, background: "var(--panel-raised)" }}>
            <div className="md-mono" style={{ fontSize: 11, color: "var(--accent)", marginBottom: 8 }}>
              FOUND {preview.meetings.length} MEETING{preview.meetings.length === 1 ? "" : "S"}
            </div>
            {preview.meetings.slice(0, 6).map((m) => (
              <div key={m.id} style={{ display: "flex", gap: 10, fontSize: 12, padding: "4px 0", alignItems: "center" }}>
                <span className="md-mono" style={{ color: "var(--dim)", width: 110 }}>{formatShort(m.date)} {formatClock(m.date)}</span>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.title}</span>
                {m.meetingLink && <Badge label={/zoom/i.test(m.meetingLink) ? "ZOOM" : "MEET"} color="var(--accent)" />}
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button className="md-btn" style={{ flex: 1, justifyContent: "center" }} onClick={scanPaste} disabled={!paste.trim()}>Scan Paste</button>
          <button className="md-btn md-btn-primary" style={{ flex: 1, justifyContent: "center", opacity: preview && preview.meetings ? 1 : 0.5 }}
            onClick={commitPaste} disabled={!preview || !preview.meetings}>
            <CheckCircle2 size={14} /> Import
          </button>
        </div>
      </Section>
    </ModalShell>
  );
}
