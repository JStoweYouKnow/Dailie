import { useState } from "react";
import { RefreshCw, Plus, X, Calendar as CalendarIcon, Trash2, CheckCircle2 } from "lucide-react";
import { useStore } from "../lib/store";
import { parseSyncPayload, isICalendarFeed } from "../calendarSync";
import { makeTask } from "../lib/model";
import { formatShort, formatClock, relativeDays, tsFromDateInput } from "../lib/format";
import { ModalShell, Field, Section, Badge, ConfirmButton } from "../ui/kit";
import { syncFromGoogle } from "../lib/googleSync";
import { useAccount, useAuthToken } from "../lib/auth";

/**
 * Google does not expose a calendar API to a browser app without an OAuth backend, but
 * every Google Calendar publishes a private iCal address. Subscribing to that address
 * is a real connection: it refreshes on demand and survives reloads.
 */
export default function SyncModal({ onClose }) {
  const { data, patch, add, updateSettings, currentUser, showToast } = useStore();
  const { enabled: authEnabled, account } = useAccount();
  const getToken = useAuthToken();
  const [googleState, setGoogleState] = useState("idle");
  const [googleError, setGoogleError] = useState("");
  const [feedUrl, setFeedUrl] = useState("");
  const [feedLabel, setFeedLabel] = useState("");
  const [busyFeed, setBusyFeed] = useState(null);
  const [error, setError] = useState("");
  const [paste, setPaste] = useState("");
  const [preview, setPreview] = useState(null);

  const feeds = data.settings.calendarFeeds || [];

  /** Merges by event id so a repeated pull updates rather than duplicates. */
  const mergeMeetings = (incoming) => {
    const existing = new Map(data.meetings.map((m) => [m.id, m]));
    let added = 0;
    let updated = 0;
    incoming.forEach((event) => {
      const prior = existing.get(event.id);
      if (prior) {
        existing.set(event.id, { ...prior, title: event.title, date: event.date, attendees: event.attendees, meetingLink: event.meetingLink || prior.meetingLink, notes: prior.notes || event.notes });
        updated += 1;
      } else {
        existing.set(event.id, { ...event, followUps: [], projectId: null });
        added += 1;
      }
    });
    patch({ meetings: [...existing.values()].sort((a, b) => b.date - a.date) });
    return { added, updated };
  };

  const syncFeed = async (feed) => {
    setBusyFeed(feed.id);
    setError("");
    try {
      const res = await fetch(`/api/calendar?url=${encodeURIComponent(feed.url)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `The calendar feed returned ${res.status}.`);
      }
      const text = await res.text();
      if (!isICalendarFeed(text)) {
        throw new Error("That URL did not return a calendar. Use the Secret address in iCal format, not the calendar's web page.");
      }
      const parsed = parseSyncPayload(text);
      const { added, updated } = mergeMeetings(parsed.meetings);
      updateSettings({
        calendarFeeds: feeds.map((f) => (f.id === feed.id ? { ...f, lastSyncedAt: Date.now(), eventCount: parsed.meetings.length } : f)),
      });
      showToast(`${feed.label}: ${added} new, ${updated} updated.`, "success");
    } catch (err) {
      setError(err.message || "Could not sync that calendar.");
    }
    setBusyFeed(null);
  };

  const addFeed = async () => {
    const url = feedUrl.trim();
    if (!url) return;
    const feed = { id: `feed-${Date.now()}`, label: feedLabel.trim() || "Google Calendar", url, lastSyncedAt: null };
    updateSettings({ calendarFeeds: [...feeds, feed] });
    setFeedUrl("");
    setFeedLabel("");
    await syncFeed(feed);
  };

  const removeFeed = (id) => updateSettings({ calendarFeeds: feeds.filter((f) => f.id !== id) });

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
            Pulls straight from the calendar of the account you signed in with
            {account ? <> — <strong style={{ color: "var(--bone)" }}>{account.email}</strong></> : null}. No feed URL, no pasting.
          </div>
          <button className="md-btn md-btn-primary" disabled={googleState === "running"}
            onClick={async () => {
              setGoogleState("running");
              setGoogleError("");
              try {
                const result = await syncFromGoogle("calendar", { getToken });
                const { added, updated } = mergeMeetings(result.meetings || []);
                showToast(`Google Calendar: ${added} new, ${updated} updated.`, "success");
                setGoogleState("idle");
              } catch (err) {
                setGoogleError(err.message || "Sync failed.");
                setGoogleState("idle");
              }
            }}>
            <RefreshCw size={13} className={googleState === "running" ? "md-spin" : ""} />
            {googleState === "running" ? "Syncing…" : "Sync my Google Calendar"}
          </button>
          {googleError && (
            <div style={{ fontSize: 12, color: "var(--red)", marginTop: 10, lineHeight: 1.55 }}>{googleError}</div>
          )}
        </Section>
      )}

      <Section title="SUBSCRIBED CALENDARS">
        {feeds.length === 0 && (
          <div style={{ fontSize: 13, color: "var(--dim)", marginBottom: 12, lineHeight: 1.6 }}>
            In Google Calendar open <strong style={{ color: "var(--bone)" }}>Settings → your calendar → Integrate calendar</strong> and copy the
            <strong style={{ color: "var(--bone)" }}> Secret address in iCal format</strong>. Paste it below and Dailie keeps pulling from it.
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
            <button className="md-btn md-btn-ghost" style={{ border: "1px solid var(--rule)", fontSize: 12 }} onClick={() => syncFeed(feed)} disabled={busyFeed === feed.id}>
              <RefreshCw size={12} className={busyFeed === feed.id ? "md-spin" : ""} /> {busyFeed === feed.id ? "Syncing…" : "Sync now"}
            </button>
            <ConfirmButton label="" confirmLabel="Remove?" icon={<Trash2 size={13} />} onConfirm={() => removeFeed(feed.id)} />
          </div>
        ))}

        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <input className="md-input" style={{ flex: "1 1 130px" }} placeholder="Label (e.g. Elena)" value={feedLabel} onChange={(e) => setFeedLabel(e.target.value)} />
          <input className="md-input" style={{ flex: "3 1 260px" }} placeholder="https://calendar.google.com/calendar/ical/…/basic.ics" value={feedUrl}
            onChange={(e) => setFeedUrl(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addFeed(); }} />
          <button className="md-btn md-btn-primary" onClick={addFeed} disabled={!feedUrl.trim()}><Plus size={13} /> Connect</button>
        </div>
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
