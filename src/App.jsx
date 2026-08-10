import { useState, useEffect, useMemo, useRef } from "react";
import { Film, Users, Plus, X, RefreshCw, CheckSquare, Square, Trash2, Download, Upload, Search, ChevronRight } from "lucide-react";

const STAGES = [
  { key: "development", label: "Development", color: "#948FA0" },
  { key: "packaging", label: "Packaging", color: "#8C7A3A" },
  { key: "preproduction", label: "Pre-Production", color: "#5E8C86" },
  { key: "production", label: "Production", color: "#C1443C" },
  { key: "postproduction", label: "Post-Production", color: "#8C6E9C" },
  { key: "delivered", label: "Delivered", color: "#7C9473" },
  { key: "onhold", label: "On Hold", color: "#6B6775" },
];

const TABS = [
  { key: "timeline", label: "TIMELINE" },
  { key: "projects", label: "PROJECTS" },
  { key: "meetings", label: "MEETING NOTES" },
];

const SEED_DATA = {
  projects: [
    {
      id: "proj-1",
      title: "The Obsidian Echo",
      description: "Sci-fi psychological thriller centered around deep sea sonic research.",
      stage: "packaging",
      owner: "Elena Rostova",
      nextStep: "Finalize lead attachment deal memo with agent",
      createdAt: Date.now() - 14 * 86400000,
      updatedAt: Date.now() - 2 * 3600000,
      history: [
        { id: "h1", date: Date.now() - 14 * 86400000, note: "Added to the board — Development" },
        { id: "h2", date: Date.now() - 8 * 86400000, note: "Script revision 3 completed by writer room" },
        { id: "h3", date: Date.now() - 2 * 3600000, note: "Moved to Packaging — Sent offer to lead actor" }
      ]
    },
    {
      id: "proj-2",
      title: "Wilderness Tide",
      description: "Feature documentary exploring wildlife migration along Pacific coastlines.",
      stage: "production",
      owner: "Marcus Vance",
      nextStep: "Commence principal photography unit B in Alaska",
      createdAt: Date.now() - 30 * 86400000,
      updatedAt: Date.now() - 1 * 86400000,
      history: [
        { id: "h4", date: Date.now() - 30 * 86400000, note: "Added to the board — Pre-Production" },
        { id: "h5", date: Date.now() - 10 * 86400000, note: "Permits approved for national park drone shoots" },
        { id: "h6", date: Date.now() - 1 * 86400000, note: "Moved to Production — Day 1 camera roll underway" }
      ]
    },
    {
      id: "proj-3",
      title: "Neon Horizon",
      description: "Limited 6-episode cyberpunk noir drama for streaming.",
      stage: "development",
      owner: "Sarah Chen",
      nextStep: "Schedule pitch meeting with studio executive",
      createdAt: Date.now() - 5 * 86400000,
      updatedAt: Date.now() - 5 * 86400000,
      history: [
        { id: "h7", date: Date.now() - 5 * 86400000, note: "Added to the board — Development" }
      ]
    }
  ],
  meetings: [
    {
      id: "meet-1",
      title: "Q3 Slate Review with Distribution Partners",
      date: Date.now() - 86400000,
      attendees: "Elena R., Marcus V., Studio Rep (Warner/A24)",
      notes: "Discussed festival release strategy for Wilderness Tide and presales for Obsidian Echo. Positive feedback on initial script pass.",
      followUps: [
        { id: "f1", text: "Send updated budget breakdown for Obsidian Echo", owner: "Elena R.", dueDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10), done: false },
        { id: "f2", text: "Confirm Sundance submission deadline dates", owner: "Marcus V.", dueDate: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10), done: true }
      ]
    }
  ],
  logs: [
    { id: "log-1", date: Date.now() - 4 * 3600000, text: "Call with line producer regarding UK tax incentives.", author: "Elena Rostova" }
  ]
};

const STORAGE_KEY = "matriarch-data-v1";
const AUTHOR_KEY = "matriarch-author-name-v1";

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function stageInfo(key) {
  return STAGES.find((s) => s.key === key) || STAGES[0];
}

function formatDay(ts) {
  const d = new Date(ts);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "TODAY";
  if (d.toDateString() === yest.toDateString()) return "YESTERDAY";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase();
}

function formatClock(ts) {
  return new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatShort(ts) {
  const d = new Date(ts);
  const opts = { month: "short", day: "numeric" };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString("en-US", opts).toUpperCase();
}

async function getStoredData() {
  try {
    if (window.storage && typeof window.storage.get === "function") {
      const res = await window.storage.get(STORAGE_KEY, true);
      if (res && res.value) return JSON.parse(res.value);
    }
  } catch (e) {}

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}

  return SEED_DATA;
}

async function setStoredData(data) {
  try {
    if (window.storage && typeof window.storage.set === "function") {
      await window.storage.set(STORAGE_KEY, JSON.stringify(data), true);
    }
  } catch (e) {}

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {}
}

function Stat({ label, value, accent }) {
  return (
    <div>
      <div className="md-mono" style={{ fontSize: 22, fontWeight: 600, color: accent || "var(--paper)" }}>{value}</div>
      <div className="md-mono" style={{ fontSize: 10, color: "var(--muted)", letterSpacing: ".1em" }}>{label}</div>
    </div>
  );
}

function LoadingState() {
  return (
    <div style={{ padding: "60px 0", textAlign: "center", color: "var(--muted)" }}>
      <Film size={22} className="md-spin" style={{ marginBottom: 10 }} />
      <div className="md-mono" style={{ fontSize: 12, letterSpacing: ".08em" }}>LOADING THE BOARD…</div>
    </div>
  );
}

function EmptyState({ title, subtitle }) {
  return (
    <div style={{ padding: "48px 20px", textAlign: "center", border: "1px dashed var(--rule)", borderRadius: 10 }}>
      <div className="md-display" style={{ fontSize: 16, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13, color: "var(--muted)" }}>{subtitle}</div>
    </div>
  );
}

function ModalShell({ title, onClose, children }) {
  return (
    <div className="md-overlay" onClick={onClose}>
      <div className="md-modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 18px", borderBottom: "1px solid var(--rule)" }}>
          <div className="md-display" style={{ fontSize: 17, fontWeight: 600 }}>{title}</div>
          <button className="md-btn md-btn-ghost" onClick={onClose} style={{ padding: 6 }}><X size={16} /></button>
        </div>
        <div style={{ padding: 18 }}>{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div className="md-mono" style={{ fontSize: 10, color: "var(--muted)", letterSpacing: ".08em", marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

function QuickLogBar({ onAdd, defaultAuthor }) {
  const [text, setText] = useState("");
  const [author, setAuthor] = useState(defaultAuthor || "");
  useEffect(() => { setAuthor(defaultAuthor || ""); }, [defaultAuthor]);
  const submit = () => {
    if (!text.trim()) return;
    onAdd({ text: text.trim(), author: author.trim() || "Unnamed" });
    setText("");
  };
  return (
    <div className="md-card" style={{ padding: 12, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 18 }}>
      <input className="md-input" style={{ flex: "2 1 240px" }} placeholder="Log an activity — a call, a send-out, a decision…" value={text}
        onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
      <input className="md-input" style={{ flex: "0 1 140px" }} placeholder="Logged by" value={author} onChange={(e) => setAuthor(e.target.value)} />
      <button className="md-btn md-btn-primary" onClick={submit}><Plus size={14} /> Log</button>
    </div>
  );
}

function TimelineView({ entries, filter, setFilter, onAddLog, defaultAuthor, searchQuery }) {
  const filtered = useMemo(() => {
    let list = entries;
    if (filter !== "all") list = list.filter((e) => e.type === filter);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((e) => e.title.toLowerCase().includes(q) || (e.subtitle && e.subtitle.toLowerCase().includes(q)));
    }
    return list;
  }, [entries, filter, searchQuery]);

  const groups = useMemo(() => {
    const g = [];
    let lastDay = null;
    filtered.forEach((e) => {
      const dayLabel = formatDay(e.ts);
      if (dayLabel !== lastDay) { g.push({ day: dayLabel, items: [] }); lastDay = dayLabel; }
      g[g.length - 1].items.push(e);
    });
    return g;
  }, [filtered]);

  return (
    <div>
      <QuickLogBar onAdd={onAddLog} defaultAuthor={defaultAuthor} />
      <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap", alignItems: "center" }}>
        {[["all", "All Activity"], ["project", "Projects"], ["meeting", "Meetings"], ["log", "Quick Notes"]].map(([k, l]) => (
          <div key={k} className={"md-chip" + (filter === k ? " active" : "")} onClick={() => setFilter(k)} role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter") setFilter(k); }}>{l}</div>
        ))}
      </div>
      {groups.length === 0 ? (
        <EmptyState title="No activity matching filter" subtitle="Add a project, meeting note, or change your search filter to populate the timeline." />
      ) : (
        groups.map((g, gi) => (
          <div key={gi} style={{ marginBottom: 22 }}>
            <div className="md-mono" style={{ fontSize: 11, color: "var(--brass)", letterSpacing: ".12em", marginBottom: 10 }}>{g.day}</div>
            <div style={{ borderLeft: "1px solid var(--rule)", marginLeft: 3 }}>
              {g.items.map((it) => (
                <div key={it.id} style={{ position: "relative", padding: "0 0 18px 22px" }}>
                  <div className="md-sprocket" style={{ position: "absolute", left: -3.5, top: 5, background: it.dotColor || "var(--brass)" }} />
                  <div className="md-mono" style={{ fontSize: 11, color: "var(--muted)", marginBottom: 3 }}>{formatClock(it.ts)} · {it.kindLabel}</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{it.title}</div>
                  {it.subtitle && <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>{it.subtitle}</div>}
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function ProjectCard({ project, onClick }) {
  const info = stageInfo(project.stage);
  return (
    <div className="md-card" onClick={onClick} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") onClick(); }}
      style={{ padding: 12, marginBottom: 10, cursor: "pointer", borderLeft: `3px solid ${info.color}` }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{project.title}</div>
      {project.owner && <div className="md-mono" style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6 }}>OWNER: {project.owner.toUpperCase()}</div>}
      {project.nextStep && <div style={{ fontSize: 12, color: "var(--paper)", opacity: 0.85 }}>Next: {project.nextStep}</div>}
      <div className="md-mono" style={{ fontSize: 10, color: "var(--muted)", marginTop: 8 }}>UPDATED {formatShort(project.updatedAt)}</div>
    </div>
  );
}

function ProjectsView({ projects, onOpenNew, onOpenDetail, searchQuery }) {
  const filteredProjects = useMemo(() => {
    if (!searchQuery) return projects;
    const q = searchQuery.toLowerCase();
    return projects.filter(p => p.title.toLowerCase().includes(q) || (p.description && p.description.toLowerCase().includes(q)) || (p.owner && p.owner.toLowerCase().includes(q)));
  }, [projects, searchQuery]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div className="md-mono" style={{ fontSize: 11, color: "var(--muted)", letterSpacing: ".1em" }}>{filteredProjects.length} PROJECT{filteredProjects.length === 1 ? "" : "S"} ON THE BOARD</div>
        <button className="md-btn md-btn-primary" onClick={onOpenNew}><Plus size={14} /> New Project</button>
      </div>
      {filteredProjects.length === 0 ? (
        <EmptyState title="No projects found" subtitle="Try clearing your search query or add a new project to start tracking." />
      ) : (
        <div className="md-scroll" style={{ display: "flex", gap: 16, overflowX: "auto", paddingBottom: 8 }}>
          {STAGES.map((s) => {
            const items = filteredProjects.filter((p) => p.stage === s.key);
            return (
              <div key={s.key} style={{ minWidth: 240, flex: "0 0 240px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.color, display: "inline-block" }} />
                  <span className="md-mono" style={{ fontSize: 11, letterSpacing: ".08em", color: "var(--muted)" }}>{s.label.toUpperCase()} · {items.length}</span>
                </div>
                {items.map((p) => <ProjectCard key={p.id} project={p} onClick={() => onOpenDetail(p)} />)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NewProjectModal({ onClose, onCreate }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [stage, setStage] = useState(STAGES[0].key);
  const [owner, setOwner] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [error, setError] = useState("");

  const submit = () => {
    if (!title.trim()) { setError("Give the project a title."); return; }
    onCreate({ title: title.trim(), description: description.trim(), stage, owner: owner.trim(), nextStep: nextStep.trim() });
  };

  return (
    <ModalShell title="New Project" onClose={onClose}>
      <Field label="TITLE"><input className="md-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Project title" autoFocus /></Field>
      <Field label="LOGLINE / DESCRIPTION"><textarea className="md-textarea" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this project about?" /></Field>
      <Field label="STAGE">
        <select className="md-select" value={stage} onChange={(e) => setStage(e.target.value)}>
          {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </Field>
      <Field label="OWNER"><input className="md-input" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Who is driving this" /></Field>
      <Field label="NEXT STEP"><input className="md-input" value={nextStep} onChange={(e) => setNextStep(e.target.value)} placeholder="Immediate action item" /></Field>
      {error && <div style={{ color: "var(--red)", fontSize: 12, marginBottom: 10 }}>{error}</div>}
      <button className="md-btn md-btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={submit}>Add to Board</button>
    </ModalShell>
  );
}

function ProjectDetailModal({ project, onClose, onChangeStage, onLog, onDelete }) {
  const [note, setNote] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const history = [...(project.history || [])].sort((a, b) => b.date - a.date);

  const addNote = () => {
    if (!note.trim()) return;
    onLog(project.id, note.trim());
    setNote("");
  };

  return (
    <ModalShell title={project.title} onClose={onClose}>
      {project.description && <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14 }}>{project.description}</div>}
      <div style={{ display: "flex", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 160px" }}>
          <div className="md-mono" style={{ fontSize: 10, color: "var(--muted)", marginBottom: 6 }}>STAGE</div>
          <select className="md-select" value={project.stage} onChange={(e) => onChangeStage(project.id, e.target.value)}>
            {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>
        {project.owner && (
          <div style={{ flex: "1 1 120px" }}>
            <div className="md-mono" style={{ fontSize: 10, color: "var(--muted)", marginBottom: 6 }}>OWNER</div>
            <div style={{ fontSize: 13, paddingTop: 8 }}>{project.owner}</div>
          </div>
        )}
      </div>
      {project.nextStep && (
        <div style={{ fontSize: 13, marginBottom: 16, padding: 10, background: "var(--panel-raised)", borderRadius: 6 }}>
          <span className="md-mono" style={{ fontSize: 10, color: "var(--muted)" }}>NEXT STEP · </span>{project.nextStep}
        </div>
      )}
      <div className="md-mono" style={{ fontSize: 10, color: "var(--muted)", letterSpacing: ".08em", marginBottom: 8 }}>ACTIVITY LOG</div>
      <div style={{ maxHeight: 180, overflowY: "auto", marginBottom: 12, paddingRight: 4 }}>
        {history.map((h) => (
          <div key={h.id} style={{ fontSize: 12, marginBottom: 10, paddingLeft: 10, borderLeft: "2px solid var(--rule)" }}>
            <div className="md-mono" style={{ color: "var(--muted)", fontSize: 10 }}>{formatShort(h.date)}</div>
            <div>{h.note}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        <input className="md-input" placeholder="Add an update note…" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addNote(); }} />
        <button className="md-btn" onClick={addNote}>Add</button>
      </div>
      <div style={{ borderTop: "1px solid var(--rule)", paddingTop: 14 }}>
        {!confirmingDelete ? (
          <button className="md-btn md-btn-ghost" onClick={() => setConfirmingDelete(true)}><Trash2 size={13} /> Remove project</button>
        ) : (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: "var(--red)" }}>Remove project from board?</span>
            <button className="md-btn" style={{ borderColor: "var(--red)", color: "var(--red)" }} onClick={() => onDelete(project.id)}>Yes, remove</button>
            <button className="md-btn md-btn-ghost" onClick={() => setConfirmingDelete(false)}>Cancel</button>
          </div>
        )}
      </div>
    </ModalShell>
  );
}

function MeetingCard({ meeting, onToggleFollowUp, onDelete }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const open = meeting.followUps.filter((f) => !f.done).length;
  return (
    <div className="md-card" style={{ padding: 16, marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
        <div>
          <div className="md-mono" style={{ fontSize: 11, color: "var(--brass)", marginBottom: 3 }}>{formatShort(meeting.date)}</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{meeting.title}</div>
          {meeting.attendees && (
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
              <Users size={11} style={{ display: "inline", marginRight: 4, verticalAlign: -1 }} />{meeting.attendees}
            </div>
          )}
        </div>
        <button className="md-btn md-btn-ghost" style={{ padding: 6 }} onClick={() => setConfirmingDelete(true)}><Trash2 size={13} /></button>
      </div>
      {meeting.notes && <div style={{ fontSize: 13, color: "var(--paper)", opacity: 0.9, marginBottom: 12, whiteSpace: "pre-wrap" }}>{meeting.notes}</div>}
      {meeting.followUps.length > 0 && (
        <div>
          <div className="md-mono" style={{ fontSize: 10, color: "var(--muted)", letterSpacing: ".08em", marginBottom: 6 }}>FOLLOW-UPS · {open} OPEN</div>
          {meeting.followUps.map((f) => (
            <div key={f.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "4px 0", cursor: "pointer" }}
              onClick={() => onToggleFollowUp(meeting.id, f.id)} role="button" tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter") onToggleFollowUp(meeting.id, f.id); }}>
              {f.done ? <CheckSquare size={15} color="var(--sage)" style={{ marginTop: 1, flexShrink: 0 }} /> : <Square size={15} color="var(--muted)" style={{ marginTop: 1, flexShrink: 0 }} />}
              <div style={{ fontSize: 13, textDecoration: f.done ? "line-through" : "none", color: f.done ? "var(--muted)" : "var(--paper)" }}>
                {f.text}{f.owner && <span className="md-mono" style={{ color: "var(--muted)", fontSize: 11 }}> — {f.owner}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
      {confirmingDelete && (
        <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center", borderTop: "1px solid var(--rule)", paddingTop: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "var(--red)" }}>Delete this meeting note?</span>
          <button className="md-btn" style={{ borderColor: "var(--red)", color: "var(--red)" }} onClick={() => onDelete(meeting.id)}>Delete</button>
          <button className="md-btn md-btn-ghost" onClick={() => setConfirmingDelete(false)}>Cancel</button>
        </div>
      )}
    </div>
  );
}

function MeetingsView({ meetings, onOpenNew, onToggleFollowUp, onDelete, searchQuery }) {
  const filtered = useMemo(() => {
    let list = [...meetings].sort((a, b) => b.date - a.date);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(m => m.title.toLowerCase().includes(q) || (m.notes && m.notes.toLowerCase().includes(q)) || (m.attendees && m.attendees.toLowerCase().includes(q)));
    }
    return list;
  }, [meetings, searchQuery]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div className="md-mono" style={{ fontSize: 11, color: "var(--muted)", letterSpacing: ".1em" }}>{filtered.length} MEETING NOTE{filtered.length === 1 ? "" : "S"}</div>
        <button className="md-btn md-btn-primary" onClick={onOpenNew}><Plus size={14} /> New Meeting Note</button>
      </div>
      {filtered.length === 0 ? (
        <EmptyState title="No meeting notes found" subtitle="Log your next meeting with action items and follow-ups to stay synchronized." />
      ) : filtered.map((m) => <MeetingCard key={m.id} meeting={m} onToggleFollowUp={onToggleFollowUp} onDelete={onDelete} />)}
    </div>
  );
}

function NewMeetingModal({ onClose, onCreate, defaultAuthor }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [attendees, setAttendees] = useState("");
  const [notes, setNotes] = useState("");
  const [followUps, setFollowUps] = useState([{ id: uid(), text: "", owner: defaultAuthor || "", dueDate: "" }]);
  const [error, setError] = useState("");

  const updateFollowUp = (id, field, value) => setFollowUps((fs) => fs.map((f) => (f.id === id ? { ...f, [field]: value } : f)));
  const addFollowUpRow = () => setFollowUps((fs) => [...fs, { id: uid(), text: "", owner: "", dueDate: "" }]);
  const removeFollowUpRow = (id) => setFollowUps((fs) => fs.filter((f) => f.id !== id));

  const submit = () => {
    if (!title.trim()) { setError("Give the meeting a title."); return; }
    const cleanFollowUps = followUps.filter((f) => f.text.trim()).map((f) => ({ id: f.id, text: f.text.trim(), owner: f.owner.trim(), dueDate: f.dueDate, done: false }));
    onCreate({ title: title.trim(), date: new Date(date + "T12:00:00").getTime(), attendees: attendees.trim(), notes: notes.trim(), followUps: cleanFollowUps });
  };

  return (
    <ModalShell title="New Meeting Note" onClose={onClose}>
      <Field label="TITLE"><input className="md-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Slate Pitch Sync with Warner Bros" autoFocus /></Field>
      <Field label="DATE"><input type="date" className="md-input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <Field label="ATTENDEES"><input className="md-input" value={attendees} onChange={(e) => setAttendees(e.target.value)} placeholder="Comma-separated names" /></Field>
      <Field label="NOTES"><textarea className="md-textarea" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Key takeaways and decisions" /></Field>
      <Field label="FOLLOW-UPS">
        {followUps.map((f) => (
          <div key={f.id} style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
            <input className="md-input" style={{ flex: "2 1 auto" }} placeholder="Action item" value={f.text} onChange={(e) => updateFollowUp(f.id, "text", e.target.value)} />
            <input className="md-input" style={{ flex: "1 1 90px" }} placeholder="Owner" value={f.owner} onChange={(e) => updateFollowUp(f.id, "owner", e.target.value)} />
            <input type="date" className="md-input" style={{ flex: "1 1 120px" }} value={f.dueDate} onChange={(e) => updateFollowUp(f.id, "dueDate", e.target.value)} />
            {followUps.length > 1 && <button className="md-btn md-btn-ghost" style={{ padding: 6 }} onClick={() => removeFollowUpRow(f.id)}><X size={14} /></button>}
          </div>
        ))}
        <button className="md-btn md-btn-ghost" onClick={addFollowUpRow}><Plus size={13} /> Add follow-up</button>
      </Field>
      {error && <div style={{ color: "var(--red)", fontSize: 12, marginBottom: 10 }}>{error}</div>}
      <button className="md-btn md-btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={submit}>Save Meeting Note</button>
    </ModalShell>
  );
}

export default function App() {
  const [data, setData] = useState(SEED_DATA);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [activeTab, setActiveTab] = useState("timeline");
  const [timelineFilter, setTimelineFilter] = useState("all");
  const [authorName, setAuthorName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showNewProject, setShowNewProject] = useState(false);
  const [showNewMeeting, setShowNewMeeting] = useState(false);
  const [detailProject, setDetailProject] = useState(null);
  const fileInputRef = useRef(null);

  const load = async () => {
    const stored = await getStoredData();
    setData(stored);
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      try {
        const savedAuthor = localStorage.getItem(AUTHOR_KEY);
        if (savedAuthor) setAuthorName(savedAuthor);
      } catch (e) {}
      setLoading(false);
    })();
  }, []);

  const persist = async (newData) => {
    setData(newData);
    try {
      await setStoredData(newData);
      setSaveError("");
    } catch (e) {
      setSaveError("Failed to save changes — storage limit exceeded or disconnected.");
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setTimeout(() => setRefreshing(false), 400);
  };

  const handleAuthorChange = (val) => {
    setAuthorName(val);
    try {
      localStorage.setItem(AUTHOR_KEY, val);
    } catch (e) {}
  };

  const handleExportData = () => {
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `matriarch-ops-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportData = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        if (parsed && Array.isArray(parsed.projects) && Array.isArray(parsed.meetings)) {
          persist(parsed);
          alert("Production board successfully imported!");
        } else {
          alert("Invalid board format.");
        }
      } catch (err) {
        alert("Failed to parse JSON file.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const createProject = (fields) => {
    const now = Date.now();
    const project = {
      id: uid(), title: fields.title, description: fields.description, stage: fields.stage,
      owner: fields.owner, nextStep: fields.nextStep, createdAt: now, updatedAt: now,
      history: [{ id: uid(), date: now, note: "Added to board — " + stageInfo(fields.stage).label }],
    };
    persist({ ...data, projects: [project, ...data.projects] });
    setShowNewProject(false);
  };

  const logProjectUpdate = (projectId, noteText, newStage) => {
    const now = Date.now();
    const projects = data.projects.map((p) => {
      if (p.id !== projectId) return p;
      const note = newStage ? `Moved to ${stageInfo(newStage).label}` + (noteText ? ` — ${noteText}` : "") : noteText;
      return { ...p, stage: newStage || p.stage, updatedAt: now, history: [...p.history, { id: uid(), date: now, note }] };
    });
    persist({ ...data, projects });
  };

  const changeProjectStage = (projectId, newStage) => logProjectUpdate(projectId, "", newStage);
  const addProjectNote = (projectId, noteText) => logProjectUpdate(projectId, noteText, null);

  const deleteProject = (projectId) => {
    persist({ ...data, projects: data.projects.filter((p) => p.id !== projectId) });
    setDetailProject(null);
  };

  const createMeeting = (fields) => {
    const meeting = { id: uid(), ...fields };
    persist({ ...data, meetings: [meeting, ...data.meetings] });
    setShowNewMeeting(false);
  };

  const toggleFollowUp = (meetingId, followUpId) => {
    const meetings = data.meetings.map((m) => (m.id !== meetingId ? m : { ...m, followUps: m.followUps.map((f) => (f.id === followUpId ? { ...f, done: !f.done } : f)) }));
    persist({ ...data, meetings });
  };

  const deleteMeeting = (meetingId) => persist({ ...data, meetings: data.meetings.filter((m) => m.id !== meetingId) });

  const addQuickLog = ({ text, author }) => {
    const log = { id: uid(), date: Date.now(), text, author };
    persist({ ...data, logs: [log, ...data.logs] });
  };

  const allTimelineEntries = useMemo(() => {
    const entries = [];
    data.projects.forEach((p) => {
      (p.history || []).forEach((h) => {
        entries.push({ id: "p-" + h.id, ts: h.date, type: "project", kindLabel: "PROJECT", title: p.title, subtitle: h.note, dotColor: stageInfo(p.stage).color });
      });
    });
    data.meetings.forEach((m) => {
      const openCount = m.followUps.filter((f) => !f.done).length;
      entries.push({
        id: "m-" + m.id, ts: m.date, type: "meeting", kindLabel: "MEETING", title: m.title,
        subtitle: m.followUps.length ? `${openCount} open follow-up${openCount === 1 ? "" : "s"} of ${m.followUps.length}` : m.attendees, dotColor: "var(--brass)",
      });
    });
    data.logs.forEach((l) => {
      entries.push({ id: "l-" + l.id, ts: l.date, type: "log", kindLabel: "NOTE", title: l.text, subtitle: l.author ? `Logged by ${l.author}` : "", dotColor: "var(--paper)" });
    });
    entries.sort((a, b) => b.ts - a.ts);
    return entries;
  }, [data]);

  const activeProjectsCount = data.projects.filter((p) => p.stage !== "delivered" && p.stage !== "onhold").length;
  const openFollowUpsCount = data.meetings.reduce((sum, m) => sum + m.followUps.filter((f) => !f.done).length, 0);
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const weekActivityCount = allTimelineEntries.filter((e) => e.ts >= weekAgo).length;
  const todayLabel = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }).toUpperCase();

  return (
    <div className="md-root">
      <div style={{ padding: "22px 26px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 8, background: "var(--panel-raised)", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--rule)", flexShrink: 0 }}>
              <Film size={19} color="var(--brass)" />
            </div>
            <div>
              <div className="md-display" style={{ fontSize: 21, fontWeight: 700, letterSpacing: ".02em", lineHeight: 1 }}>MATRIARCH</div>
              <div className="md-mono" style={{ fontSize: 10, color: "var(--muted)", letterSpacing: ".14em", marginTop: 3 }}>PRODUCTION OPS BOARD</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ position: "relative", minWidth: 200 }}>
              <Search size={14} color="var(--muted)" style={{ position: "absolute", left: 10, top: 10 }} />
              <input className="md-input" style={{ paddingLeft: 30, fontSize: 12 }} placeholder="Search board..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
            <div>
              <input className="md-input" style={{ fontSize: 12, padding: "6px 8px", width: 120 }} value={authorName} onChange={(e) => handleAuthorChange(e.target.value)} placeholder="Logged by..." />
            </div>
            <button className="md-btn md-btn-ghost" onClick={handleExportData} title="Export Board JSON" style={{ padding: 8 }}>
              <Download size={14} />
            </button>
            <button className="md-btn md-btn-ghost" onClick={() => fileInputRef.current && fileInputRef.current.click()} title="Import Board JSON" style={{ padding: 8 }}>
              <Upload size={14} />
            </button>
            <input type="file" ref={fileInputRef} style={{ display: "none" }} accept=".json" onChange={handleImportData} />
            <button className="md-btn md-btn-ghost" onClick={refresh} title="Refresh Data" style={{ padding: 8 }}>
              <RefreshCw size={14} className={refreshing ? "md-spin" : ""} />
            </button>
            <div className="md-mono" style={{ fontSize: 12, border: "1px solid var(--rule)", padding: "8px 12px", borderRadius: 6 }}>{todayLabel}</div>
          </div>
        </div>
      </div>
      <div className="md-stripe" style={{ margin: "18px 0 0" }} />
      <div style={{ padding: "16px 26px", display: "flex", gap: 32, flexWrap: "wrap", borderBottom: "1px solid var(--rule)", alignItems: "center" }}>
        <Stat label="ACTIVE PROJECTS" value={activeProjectsCount} />
        <Stat label="OPEN FOLLOW-UPS" value={openFollowUpsCount} accent={openFollowUpsCount > 0 ? "var(--red)" : undefined} />
        <Stat label="LOGGED THIS WEEK" value={weekActivityCount} />
        {saveError && <div style={{ marginLeft: "auto", fontSize: 12, color: "var(--red)" }}>{saveError}</div>}
      </div>
      <div className="md-scroll" style={{ display: "flex", gap: 24, padding: "0 26px", borderBottom: "1px solid var(--rule)", overflowX: "auto" }}>
        {TABS.map((t) => (
          <div key={t.key} className={"md-tab" + (activeTab === t.key ? " active" : "")} onClick={() => setActiveTab(t.key)} role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter") setActiveTab(t.key); }}>{t.label}</div>
        ))}
      </div>
      <div style={{ padding: "22px 26px 44px" }}>
        {loading ? (
          <LoadingState />
        ) : activeTab === "timeline" ? (
          <TimelineView entries={allTimelineEntries} filter={timelineFilter} setFilter={setTimelineFilter} onAddLog={addQuickLog} defaultAuthor={authorName} searchQuery={searchQuery} />
        ) : activeTab === "projects" ? (
          <ProjectsView projects={data.projects} onOpenNew={() => setShowNewProject(true)} onOpenDetail={setDetailProject} searchQuery={searchQuery} />
        ) : (
          <MeetingsView meetings={data.meetings} onOpenNew={() => setShowNewMeeting(true)} onToggleFollowUp={toggleFollowUp} onDelete={deleteMeeting} searchQuery={searchQuery} />
        )}
      </div>
      {showNewProject && <NewProjectModal onClose={() => setShowNewProject(false)} onCreate={createProject} />}
      {showNewMeeting && <NewMeetingModal onClose={() => setShowNewMeeting(false)} onCreate={createMeeting} defaultAuthor={authorName} />}
      {detailProject && (
        <ProjectDetailModal
          project={data.projects.find((p) => p.id === detailProject.id) || detailProject}
          onClose={() => setDetailProject(null)}
          onChangeStage={changeProjectStage}
          onLog={addProjectNote}
          onDelete={deleteProject}
        />
      )}
    </div>
  );
}
