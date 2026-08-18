import { useState } from "react";
import { Sparkles, CheckCircle2, RefreshCw } from "lucide-react";
import { useStore } from "../lib/store";
import { makeTask } from "../lib/model";
import { uid, formatFull, formatClock, dateInputValue } from "../lib/format";
import { ModalShell, Field, Avatar, Badge } from "../ui/kit";

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** "next tuesday at 2pm" -> a timestamp. Falls back to two days out. */
function resolveWhen(text) {
  const lower = text.toLowerCase();
  const base = new Date();
  base.setSeconds(0, 0);

  let target = null;
  const dayIndex = DAY_NAMES.findIndex((d) => lower.includes(d));
  if (dayIndex !== -1) {
    target = new Date(base);
    const delta = (dayIndex - base.getDay() + 7) % 7 || 7;
    target.setDate(base.getDate() + delta);
  } else if (/tomorrow/.test(lower)) {
    target = new Date(base);
    target.setDate(base.getDate() + 1);
  } else if (/today/.test(lower)) {
    target = new Date(base);
  }
  if (!target) {
    target = new Date(base);
    target.setDate(base.getDate() + 2);
  }

  const clock = lower.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/);
  if (clock) {
    let hour = parseInt(clock[1], 10) % 12;
    if (clock[3] === "pm") hour += 12;
    target.setHours(hour, clock[2] ? parseInt(clock[2], 10) : 0, 0, 0);
  } else if (/morning/.test(lower)) {
    target.setHours(10, 0, 0, 0);
  } else if (/afternoon/.test(lower)) {
    target.setHours(14, 0, 0, 0);
  } else {
    target.setHours(11, 0, 0, 0);
  }
  return target.getTime();
}

function pickDuration(text) {
  const m = text.match(/(\d{2,3})\s*-?\s*min/i);
  if (m) return parseInt(m[1], 10);
  if (/\b(\d)\s*hour/i.test(text)) return parseInt(RegExp.$1, 10) * 60;
  return 30;
}

/**
 * Reads a plain-English scheduling request against the real board — the people
 * directory, the project list and the existing calendar — and produces a meeting,
 * its tasks and an invite email for approval. Nothing is written until you confirm.
 */
export default function SchedulerAgent({ onClose, onScheduled }) {
  const { data, add, currentUser, showToast } = useStore();
  const [prompt, setPrompt] = useState("");
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState([]);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState("");

  const samples = [
    "Pitch meeting with David Sterling next Tuesday at 2 PM about The Obsidian Echo",
    "30-min slate review with Marcus Vance on Friday at 10 AM for Wilderness Tide",
    "Distribution sync with Sarah Chen next Monday afternoon on Neon Horizon",
  ];

  const run = async (input) => {
    const text = (input || prompt).trim();
    if (!text) return;
    setRunning(true);
    setError("");
    setDraft(null);

    const advance = (id, label, keep) => setSteps((prev) => [
      ...prev.map((s) => (keep && s.id === keep ? { ...s, status: "done" } : s)),
      { id, text: label, status: "active" },
    ]);

    setSteps([{ id: 1, text: "Reading the request…", status: "active" }]);
    await new Promise((r) => setTimeout(r, 450));

    advance(2, "Matching people in the directory…", 1);
    const lower = text.toLowerCase();
    const people = data.people.filter((p) => {
      const first = p.name.toLowerCase().split(" ")[0];
      return first.length > 2 && lower.includes(first);
    });
    await new Promise((r) => setTimeout(r, 450));

    advance(3, "Matching the project…", 2);
    const project = data.projects.find((p) => lower.includes(p.title.toLowerCase()))
      || data.projects.find((p) => people.some((x) => (x.projectIds || []).includes(p.id)))
      || null;
    await new Promise((r) => setTimeout(r, 450));

    advance(4, "Checking the calendar for clashes…", 3);
    const when = resolveWhen(text);
    const duration = pickDuration(text);
    const clash = data.meetings.find((m) => Math.abs(m.date - when) < duration * 60000);
    await new Promise((r) => setTimeout(r, 450));

    setSteps((prev) => [...prev.map((s) => (s.id === 4 ? { ...s, status: "done" } : s)),
      { id: 5, text: "Drafting the invite…", status: "done" }]);

    if (!people.length) {
      setError("No one in your People tab matched that request. Add them first, or name someone already on the board.");
      setRunning(false);
      return;
    }

    const title = project ? `${project.title} — ${people.map((p) => p.name.split(" ")[0]).join(" / ")}` : text.slice(0, 60);
    setDraft({
      title,
      when,
      duration,
      people,
      project,
      clash,
      tasks: [
        `Send agenda to ${people.map((p) => p.name).join(", ")}`,
        "Confirm the video link",
      ],
      request: text,
    });
    setRunning(false);
  };

  const confirm = () => {
    if (!draft) return;
    const meeting = add("meetings", {
      title: draft.title,
      date: draft.when,
      attendees: [...draft.people.map((p) => `${p.name} (${p.email || "no email"})`), currentUser ? currentUser.name : ""].filter(Boolean).join(", "),
      notes: `Scheduled from: "${draft.request}"`,
      projectId: draft.project ? draft.project.id : null,
      meetingLink: "",
      followUps: [],
    });

    draft.tasks.forEach((title) => {
      add("tasks", makeTask({
        title,
        meetingId: meeting.id,
        projectId: draft.project ? draft.project.id : null,
        personId: draft.people[0] ? draft.people[0].id : null,
        dueDate: draft.when,
        assigneeIds: currentUser ? [currentUser.id] : [],
        source: "scheduler",
      }, currentUser && currentUser.id));
    });

    const recipients = draft.people.map((p) => p.email).filter(Boolean);
    if (recipients.length) {
      const account = (data.settings.emailAccounts[0] || {}).address || (currentUser && currentUser.email) || "";
      add("emails", {
        direction: "out",
        account,
        from: account,
        to: recipients,
        subject: `Invite: ${draft.title}`,
        body: `${formatFull(draft.when)} at ${formatClock(draft.when)} (${draft.duration} min)\n\n${draft.request}`,
        snippet: draft.request.slice(0, 180),
        sentAt: Date.now(),
        status: "Invite logged",
        openCount: 0,
        lastOpened: null,
        personId: draft.people[0].id,
        companyId: draft.people[0].companyId || null,
        projectId: draft.project ? draft.project.id : null,
      });
    }

    showToast(`"${draft.title}" scheduled with ${draft.tasks.length} tasks.`, "success");
    if (onScheduled) onScheduled(meeting);
    onClose();
  };

  return (
    <ModalShell title="Meeting Scheduler" subtitle="Describe the meeting; it reads your directory and calendar" onClose={onClose}>
      <Field label="WHAT DO YOU WANT TO SCHEDULE">
        <textarea className="md-textarea" rows={3} value={prompt} onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. Pitch meeting with David Sterling next Tuesday at 2 PM about The Obsidian Echo" />
      </Field>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        {samples.map((s) => (
          <button key={s} className="md-btn md-btn-ghost" style={{ fontSize: 10, padding: "4px 8px", border: "1px solid var(--rule)" }}
            onClick={() => { setPrompt(s); run(s); }}>{s.slice(0, 42)}…</button>
        ))}
      </div>

      {!running && !draft && (
        <button className="md-btn md-btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={() => run()} disabled={!prompt.trim()}>
          <Sparkles size={14} /> Draft the meeting
        </button>
      )}

      {steps.length > 0 && (
        <div style={{ background: "var(--panel-raised)", padding: 14, borderRadius: 10, border: "1px solid var(--rule)", margin: "16px 0" }}>
          <div className="md-mono" style={{ fontSize: 10, color: "var(--accent)", letterSpacing: ".1em", marginBottom: 8, fontWeight: 700 }}>PROGRESS</div>
          {steps.map((s) => (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginBottom: 6, color: s.status === "done" ? "var(--bone)" : "var(--accent)" }}>
              {s.status === "done" ? <CheckCircle2 size={14} color="var(--sage)" /> : <RefreshCw size={14} className="md-spin" color="var(--accent)" />}
              <span>{s.text}</span>
            </div>
          ))}
        </div>
      )}

      {error && <div style={{ color: "var(--red)", fontSize: 12, marginBottom: 14, lineHeight: 1.5 }}>{error}</div>}

      {draft && (
        <div style={{ border: "1px solid var(--accent)", background: "rgba(167,179,164,.1)", borderRadius: 10, padding: 14, marginBottom: 16 }}>
          <div className="md-mono" style={{ fontSize: 10, color: "var(--accent)", fontWeight: 800, marginBottom: 8, letterSpacing: ".1em" }}>READY TO SCHEDULE</div>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>{draft.title}</div>
          <div style={{ fontSize: 12, color: "var(--dim)", marginBottom: 8 }}>
            {formatFull(draft.when)} at {formatClock(draft.when)} · {draft.duration} min
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
            {draft.people.map((p) => (
              <span key={p.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--bone)" }}>
                <Avatar name={p.name} size={20} />{p.name}
                {!p.email && <Badge label="NO EMAIL" color="var(--red)" />}
              </span>
            ))}
          </div>
          {draft.project && <div style={{ fontSize: 12, color: "var(--dim)", marginBottom: 6 }}>Project: <strong style={{ color: "var(--bone)" }}>{draft.project.title}</strong></div>}
          {draft.clash && (
            <div style={{ fontSize: 12, color: "var(--red)", marginBottom: 6 }}>
              Clashes with “{draft.clash.title}” at {formatClock(draft.clash.date)}. Schedule it anyway, or reword the time.
            </div>
          )}
          <div style={{ fontSize: 12, color: "var(--dim)" }}>Creates {draft.tasks.length} tasks and logs the invite email.</div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button className="md-btn" style={{ flex: 1, justifyContent: "center" }} onClick={() => { setDraft(null); setSteps([]); }}>Start over</button>
            <button className="md-btn md-btn-primary" style={{ flex: 2, justifyContent: "center" }} onClick={confirm}>Confirm & add to the board</button>
          </div>
        </div>
      )}
    </ModalShell>
  );
}
