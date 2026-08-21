import { useMemo, useState } from "react";
import { Plus, Users, ExternalLink, Video, CheckSquare, Square, X, EyeOff } from "lucide-react";
import { useStore } from "../lib/store";
import { makeTask } from "../lib/model";
import { formatShort, uid, tsFromDateInput } from "../lib/format";
import { isSyncedMeeting, excludeMeetingFromSync, visibleMeetings } from "../lib/calendarExclusions";
import {
  ViewHeader, EmptyState, ModalShell, Field, ConfirmButton, InlineText, InlineSelect, MemberPicker, Badge,
} from "../ui/kit";

function MeetingCard({ meeting, onRecord }) {
  const { data, update, remove, add, patch, updateSettings, currentUser, showToast } = useStore();
  const [newTask, setNewTask] = useState("");
  const tasks = data.tasks.filter((t) => t.meetingId === meeting.id);
  const open = tasks.filter((t) => t.status !== "done").length;
  const call = data.calls.find((c) => c.meetingId === meeting.id);

  const addTask = () => {
    if (!newTask.trim()) return;
    add("tasks", makeTask({
      title: newTask.trim(),
      meetingId: meeting.id,
      projectId: meeting.projectId || null,
      assigneeIds: currentUser ? [currentUser.id] : [],
      source: "meeting",
    }, currentUser && currentUser.id));
    setNewTask("");
  };

  return (
    <div className="md-card" style={{ padding: 18, marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div className="md-mono" style={{ fontSize: 11, color: "var(--accent)", marginBottom: 4, fontWeight: 600 }}>{formatShort(meeting.date)}</div>
          <InlineText value={meeting.title} style={{ fontSize: 16, fontWeight: 700 }} onCommit={(v) => update("meetings", meeting.id, { title: v })} />
          {meeting.attendees && (
            <div style={{ fontSize: 12, color: "var(--dim)", marginTop: 4 }}>
              <Users size={12} style={{ display: "inline", marginRight: 5, verticalAlign: -1 }} />{meeting.attendees}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <InlineSelect value={meeting.projectId} options={data.projects.map((p) => ({ key: p.id, label: p.title }))} placeholder="Link project"
            onCommit={(v) => update("meetings", meeting.id, { projectId: v })} />
          {isSyncedMeeting(meeting) && (
            <button className="md-btn md-btn-ghost" title="Hide from calendar sync"
              onClick={() => excludeMeetingFromSync(meeting, {
                meetings: data.meetings, settings: data.settings, patch, updateSettings, showToast,
              })}>
              <EyeOff size={13} /> Hide
            </button>
          )}
          <ConfirmButton label="" confirmLabel="Delete?" onConfirm={() => remove("meetings", meeting.id)} />
        </div>
      </div>

      {meeting.meetingLink && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <a className="md-btn md-btn-ghost" href={meeting.meetingLink} target="_blank" rel="noreferrer"
            style={{ textDecoration: "none", color: "var(--accent)", borderColor: "var(--accent)", border: "1px solid var(--accent)" }}>
            <ExternalLink size={13} /> {/zoom\.us/i.test(meeting.meetingLink) ? "Join Zoom" : "Join Google Meet"}
          </a>
          <button className="md-btn md-btn-ghost" onClick={() => onRecord(meeting)} style={{ color: "var(--red)", border: "1px solid var(--red)" }}>
            <Video size={13} /> Record Call
          </button>
          {call && <Badge label="RECORDED" color="var(--sage)" />}
        </div>
      )}

      <InlineText value={meeting.notes} multiline markdown placeholder="Add meeting notes…" style={{ fontSize: 14, lineHeight: 1.55, marginBottom: 14 }}
        onCommit={(v) => update("meetings", meeting.id, { notes: v })} />

      <div>
        <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)", letterSpacing: ".1em", marginBottom: 8 }}>
          FOLLOW-UPS · {open} OPEN OF {tasks.length}
        </div>
        {tasks.map((t) => (
          <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}>
            <button className="md-btn md-btn-ghost" style={{ padding: 0 }}
              onClick={() => update("tasks", t.id, { status: t.status === "done" ? "todo" : "done", completedAt: t.status === "done" ? null : Date.now() })}>
              {t.status === "done" ? <CheckSquare size={15} color="var(--sage)" /> : <Square size={15} color="var(--dim)" />}
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <InlineText value={t.title} onCommit={(v) => update("tasks", t.id, { title: v })}
                style={{ fontSize: 13, textDecoration: t.status === "done" ? "line-through" : "none", color: t.status === "done" ? "var(--dim)" : "var(--bone)" }} />
            </div>
            <div style={{ width: 140, flexShrink: 0 }}>
              <MemberPicker team={data.team} selectedIds={t.assigneeIds || []} label="Assign" onChange={(ids) => update("tasks", t.id, { assigneeIds: ids })} />
            </div>
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <input className="md-input" placeholder="Add a follow-up…" value={newTask}
            onChange={(e) => setNewTask(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addTask(); }} />
          <button className="md-btn" onClick={addTask}><Plus size={13} /></button>
        </div>
      </div>
    </div>
  );
}

export function NewMeetingModal({ onClose, initialTitle = "", initialNotes = "" }) {
  const { data, add, currentUser } = useStore();
  const [form, setForm] = useState({
    title: initialTitle,
    date: new Date().toISOString().slice(0, 10),
    attendees: "",
    notes: initialNotes,
    projectId: "",
    meetingLink: "",
  });
  const [followUps, setFollowUps] = useState([{ id: uid(), text: "", dueDate: "" }]);
  const [error, setError] = useState("");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = () => {
    if (!form.title.trim()) { setError("Give the meeting a title."); return; }
    const meeting = add("meetings", {
      title: form.title.trim(),
      date: tsFromDateInput(form.date) || Date.now(),
      attendees: form.attendees.trim(),
      notes: form.notes.trim(),
      projectId: form.projectId || null,
      meetingLink: form.meetingLink.trim(),
      followUps: [],
    });
    followUps.filter((f) => f.text.trim()).forEach((f) => {
      add("tasks", makeTask({
        title: f.text.trim(),
        dueDate: f.dueDate ? tsFromDateInput(f.dueDate) : null,
        meetingId: meeting.id,
        projectId: form.projectId || null,
        assigneeIds: currentUser ? [currentUser.id] : [],
        source: "meeting",
      }, currentUser && currentUser.id));
    });
    onClose();
  };

  return (
    <ModalShell title="New Meeting Note" onClose={onClose}>
      <Field label="TITLE"><input className="md-input" autoFocus value={form.title} onChange={set("title")} placeholder="e.g. Slate pitch sync" /></Field>
      <div className="md-split" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="DATE"><input type="date" className="md-input" value={form.date} onChange={set("date")} /></Field>
        <Field label="PROJECT">
          <select className="md-select" value={form.projectId} onChange={set("projectId")}>
            <option value="">No project</option>
            {data.projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </Field>
      </div>
      <Field label="ATTENDEES"><input className="md-input" value={form.attendees} onChange={set("attendees")} placeholder="Comma-separated names" /></Field>
      <Field label="MEETING LINK"><input className="md-input" value={form.meetingLink} onChange={set("meetingLink")} placeholder="Zoom or Google Meet URL" /></Field>
      <Field label="NOTES"><textarea className="md-textarea" rows={4} value={form.notes} onChange={set("notes")} /></Field>
      <Field label="FOLLOW-UPS">
        {followUps.map((f) => (
          <div key={f.id} style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
            <input className="md-input" style={{ flex: "2 1 180px" }} placeholder="Action item" value={f.text}
              onChange={(e) => setFollowUps((fs) => fs.map((x) => (x.id === f.id ? { ...x, text: e.target.value } : x)))} />
            <input type="date" className="md-input" style={{ flex: "1 1 130px" }} value={f.dueDate}
              onChange={(e) => setFollowUps((fs) => fs.map((x) => (x.id === f.id ? { ...x, dueDate: e.target.value } : x)))} />
            {followUps.length > 1 && (
              <button className="md-btn md-btn-ghost" style={{ padding: 6 }} onClick={() => setFollowUps((fs) => fs.filter((x) => x.id !== f.id))}><X size={14} /></button>
            )}
          </div>
        ))}
        <button className="md-btn md-btn-ghost" onClick={() => setFollowUps((fs) => [...fs, { id: uid(), text: "", dueDate: "" }])}>
          <Plus size={13} /> Add follow-up
        </button>
      </Field>
      {error && <div style={{ color: "var(--red)", fontSize: 12, marginBottom: 10 }}>{error}</div>}
      <button className="md-btn md-btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={submit}>Save Meeting Note</button>
    </ModalShell>
  );
}

export default function MeetingsView({ searchQuery, onRecord, onOpenNew }) {
  const { data } = useStore();

  const meetings = useMemo(() => {
    let list = visibleMeetings(data.meetings, data.settings).sort((a, b) => b.date - a.date);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((m) =>
        m.title.toLowerCase().includes(q) ||
        (m.notes || "").toLowerCase().includes(q) ||
        (m.attendees || "").toLowerCase().includes(q));
    }
    return list;
  }, [data.meetings, data.settings, searchQuery]);

  return (
    <div>
      <ViewHeader count={meetings.length} label={`MEETING NOTE${meetings.length === 1 ? "" : "S"}`}>
        <button className="md-btn md-btn-primary" onClick={onOpenNew}><Plus size={14} /> New Meeting Note</button>
      </ViewHeader>
      {meetings.length === 0 ? (
        <EmptyState title="No meeting notes" subtitle="Log a meeting with follow-ups, or connect your Google Calendar to pull meetings in automatically." />
      ) : (
        meetings.map((m) => <MeetingCard key={m.id} meeting={m} onRecord={onRecord} />)
      )}
    </div>
  );
}
