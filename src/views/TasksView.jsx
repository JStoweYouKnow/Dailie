import { useMemo, useState } from "react";
import { Plus, CheckSquare, Square, MessageSquare, Send, Star, LayoutGrid, Table as TableIcon } from "lucide-react";
import { useStore } from "../lib/store";
import { TASK_STATUSES, PRIORITIES, makeTask, lookupColor } from "../lib/model";
import { formatShort, relativeDays, uid } from "../lib/format";
import {
  ViewHeader, FilterChips, EmptyState, DataTable, KanbanBoard, Badge, Avatar, AvatarStack,
  InlineText, InlineSelect, InlineDate, MemberPicker, ConfirmButton, Section, ExportMenu,
} from "../ui/kit";

function TaskCard({ task, onOpen, memberName, projectName, onToggle }) {
  const overdue = task.dueDate && task.dueDate < Date.now() && task.status !== "done";
  return (
    <div className="md-card" style={{ padding: 12, marginBottom: 10, cursor: "pointer", overflow: "hidden" }} onClick={onOpen} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", minWidth: 0 }}>
        <button className="md-btn md-btn-ghost" style={{ padding: 0, marginTop: 1, flexShrink: 0 }}
          onClick={(e) => { e.stopPropagation(); onToggle(); }}>
          {task.status === "done" ? <CheckSquare size={15} color="var(--sage)" /> : <Square size={15} color="var(--dim)" />}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            title={task.title}
            style={{
              fontSize: 13, fontWeight: 600, lineHeight: 1.45, wordBreak: "break-word",
              color: task.status === "done" ? "var(--dim)" : "var(--bone)",
              textDecoration: task.status === "done" ? "line-through" : "none",
              display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden",
            }}
          >
            {task.title}
          </div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 8, alignItems: "center", minWidth: 0 }}>
            {task.projectId && <Badge label={projectName(task.projectId)} subtle />}
            {task.priority === "HIGH" && <Badge label="HIGH" color="var(--red)" />}
            {task.dueDate && <Badge label={formatShort(task.dueDate)} color={overdue ? "var(--red)" : undefined} subtle={!overdue} />}
            {task.source === "call" && <Badge label="FROM CALL" color="var(--info)" />}
            {(task.comments || []).length > 0 && (
              <span className="md-mono" style={{ fontSize: 10, color: "var(--dim)", display: "inline-flex", alignItems: "center", gap: 3 }}>
                <MessageSquare size={10} /> {task.comments.length}
              </span>
            )}
          </div>
        </div>
        <div style={{ flexShrink: 0 }}>
          <AvatarStack names={(task.assigneeIds || []).map(memberName)} size={22} max={2} />
        </div>
      </div>
    </div>
  );
}

function TaskDetail({ task, onClose }) {
  const { data, update, remove, currentUser, memberName } = useStore();
  const [comment, setComment] = useState("");

  const postComment = () => {
    if (!comment.trim()) return;
    update("tasks", task.id, (t) => ({
      comments: [...(t.comments || []), { id: uid(), authorId: currentUser && currentUser.id, text: comment.trim(), createdAt: Date.now() }],
    }));
    setComment("");
  };

  return (
    <div className="md-overlay" onClick={onClose}>
      <div className="md-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 620 }}>
        <div style={{ padding: 20 }}>
          <InlineText value={task.title} style={{ fontSize: 17, fontWeight: 700, whiteSpace: "normal", overflow: "visible" }} onCommit={(v) => v.trim() && update("tasks", task.id, { title: v.trim() })} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 160px), 1fr))", gap: 12, margin: "18px 0" }}>
            <div style={{ minWidth: 0 }}>
              <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)", marginBottom: 5 }}>STATUS</div>
              <InlineSelect value={task.status} options={TASK_STATUSES} color={lookupColor(TASK_STATUSES, task.status)}
                onCommit={(v) => update("tasks", task.id, { status: v, completedAt: v === "done" ? Date.now() : null })} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)", marginBottom: 5 }}>ASSIGNEES</div>
              <MemberPicker team={data.team} selectedIds={task.assigneeIds || []} onChange={(ids) => update("tasks", task.id, { assigneeIds: ids })} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)", marginBottom: 5 }}>DUE</div>
              <InlineDate value={task.dueDate} onCommit={(v) => update("tasks", task.id, { dueDate: v })} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)", marginBottom: 5 }}>PRIORITY</div>
              <InlineSelect value={task.priority} options={PRIORITIES.map((p) => ({ key: p, label: p }))} onCommit={(v) => update("tasks", task.id, { priority: v })} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)", marginBottom: 5 }}>PROJECT</div>
              <InlineSelect value={task.projectId} options={data.projects.map((p) => ({ key: p.id, label: p.title }))} placeholder="None"
                onCommit={(v) => update("tasks", task.id, { projectId: v })} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)", marginBottom: 5 }}>PERSON</div>
              <InlineSelect value={task.personId} options={data.people.map((p) => ({ key: p.id, label: p.name }))} placeholder="None"
                onCommit={(v) => update("tasks", task.id, { personId: v })} />
            </div>
          </div>

          <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)", marginBottom: 6 }}>DETAIL</div>
          <InlineText value={task.notes} multiline placeholder="Add detail…" onCommit={(v) => update("tasks", task.id, { notes: v })} />

          <Section title={`COMMENTS · ${(task.comments || []).length}`} style={{ marginTop: 24 }}>
            {(task.comments || []).map((c) => (
              <div key={c.id} style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                <Avatar name={memberName(c.authorId) || "?"} size={26} />
                <div style={{ flex: 1 }}>
                  <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)" }}>{memberName(c.authorId) || "Unknown"} · {formatShort(c.createdAt)}</div>
                  <div style={{ fontSize: 13, color: "var(--bone)" }}>{c.text}</div>
                </div>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8 }}>
              <input className="md-input" placeholder="Comment…" value={comment} onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") postComment(); }} />
              <button className="md-btn" onClick={postComment}><Send size={13} /></button>
            </div>
          </Section>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--rule)", paddingTop: 14 }}>
            <ConfirmButton label="Delete task" confirmLabel="Yes, delete" onConfirm={() => { remove("tasks", task.id); onClose(); }} />
            <button className="md-btn md-btn-primary" onClick={onClose}>Done</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function NotesPane({ searchQuery }) {
  const { data, add, update, remove, currentUser, memberName } = useStore();
  const [draft, setDraft] = useState("");

  const notes = useMemo(() => {
    let list = [...data.notes].sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((n) => (n.title || "").toLowerCase().includes(q) || (n.body || "").toLowerCase().includes(q));
    }
    return list;
  }, [data.notes, searchQuery]);

  const create = () => {
    if (!draft.trim()) return;
    add("notes", {
      title: draft.trim().slice(0, 70),
      body: draft.trim(),
      authorId: currentUser && currentUser.id,
      projectId: null,
      collaboratorIds: [],
      comments: [],
      updatedAt: Date.now(),
    });
    setDraft("");
  };

  return (
    <div>
      <div className="md-card" style={{ padding: 14, display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        <input className="md-input" style={{ flex: "2 1 260px" }} placeholder="Write a shared note the whole team can edit…"
          value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") create(); }} />
        <button className="md-btn md-btn-primary" onClick={create}><Plus size={14} /> Add Note</button>
      </div>

      {notes.length === 0 ? (
        <EmptyState title="No notes yet" subtitle="Notes are shared — anyone on the team can edit them and add collaborators." />
      ) : (
        <div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
            <ExportMenu title="Notes" columns={[
              { key: "title", label: "TITLE" },
              { key: "notes", label: "BODY" },
              { key: "updated", label: "UPDATED" },
            ]} rows={notes} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
          {notes.map((n) => (
            <div key={n.id} className="md-card" style={{ padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <InlineText value={n.title} style={{ fontWeight: 700, fontSize: 14 }} onCommit={(v) => update("notes", n.id, { title: v, updatedAt: Date.now() })} />
                </div>
                <ConfirmButton label="" confirmLabel="Sure?" onConfirm={() => remove("notes", n.id)} />
              </div>
              <InlineText value={n.body} multiline markdown placeholder="Write…" style={{ fontSize: 13, color: "var(--dim)" }}
                onCommit={(v) => update("notes", n.id, { body: v, updatedAt: Date.now() })} />
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                <Avatar name={memberName(n.authorId) || "?"} size={22} />
                <span className="md-mono" style={{ fontSize: 10, color: "var(--dim)" }}>{relativeDays(n.updatedAt || n.createdAt)}</span>
                <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
                  <div style={{ width: 130 }}>
                    <MemberPicker team={data.team} selectedIds={n.collaboratorIds || []} label="Share"
                      onChange={(ids) => update("notes", n.id, { collaboratorIds: ids, updatedAt: Date.now() })} />
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 8 }}>
                <InlineSelect value={n.projectId} options={data.projects.map((p) => ({ key: p.id, label: p.title }))} placeholder="Link project"
                  onCommit={(v) => update("notes", n.id, { projectId: v, updatedAt: Date.now() })} />
              </div>
            </div>
          ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function TasksView({ searchQuery }) {
  const { data, add, update, remove, currentUser, memberName, projectName } = useStore();
  const [pane, setPane] = useState("tasks");
  const [statusFilter, setStatusFilter] = useState("all");
  const [mineOnly, setMineOnly] = useState(false);
  const [viewMode, setViewMode] = useState("board");
  const [openTask, setOpenTask] = useState(null);
  const [draft, setDraft] = useState("");

  const tasks = useMemo(() => {
    let list = data.tasks;
    if (statusFilter !== "all") list = list.filter((t) => t.status === statusFilter);
    if (mineOnly) list = list.filter((t) => (t.assigneeIds || []).includes(currentUser && currentUser.id));
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((t) => t.title.toLowerCase().includes(q) || (t.notes || "").toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => (a.dueDate || Infinity) - (b.dueDate || Infinity));
  }, [data.tasks, statusFilter, mineOnly, searchQuery, currentUser]);

  const createTask = () => {
    if (!draft.trim()) return;
    add("tasks", makeTask({
      title: draft.trim(),
      assigneeIds: currentUser ? [currentUser.id] : [],
    }, currentUser && currentUser.id));
    setDraft("");
  };

  const toggle = (task) => update("tasks", task.id, {
    status: task.status === "done" ? "todo" : "done",
    completedAt: task.status === "done" ? null : Date.now(),
  });

  const columns = [
    { key: "done", label: "", width: 40, stopClick: true, render: (t) => (
      <button className="md-btn md-btn-ghost" style={{ padding: 2 }} onClick={() => toggle(t)}>
        {t.status === "done" ? <CheckSquare size={15} color="var(--sage)" /> : <Square size={15} color="var(--dim)" />}
      </button>
    ) },
    { key: "title", label: "TASK", cellStyle: { minWidth: 260 }, stopClick: true, render: (t) => (
      <InlineText value={t.title} onCommit={(v) => update("tasks", t.id, { title: v })}
        style={{ fontWeight: 600, textDecoration: t.status === "done" ? "line-through" : "none", color: t.status === "done" ? "var(--dim)" : "var(--bone)" }} />
    ) },
    { key: "assignees", label: "ASSIGNED TO", stopClick: true, width: 170, render: (t) => (
      <MemberPicker team={data.team} selectedIds={t.assigneeIds || []} onChange={(ids) => update("tasks", t.id, { assigneeIds: ids })} />
    ) },
    { key: "status", label: "STATUS", stopClick: true, render: (t) => (
      <InlineSelect value={t.status} options={TASK_STATUSES} color={lookupColor(TASK_STATUSES, t.status)}
        onCommit={(v) => update("tasks", t.id, { status: v, completedAt: v === "done" ? Date.now() : null })} />
    ) },
    { key: "due", label: "DUE", stopClick: true, render: (t) => <InlineDate value={t.dueDate} onCommit={(v) => update("tasks", t.id, { dueDate: v })} /> },
    { key: "project", label: "PROJECT", stopClick: true, cellStyle: { maxWidth: 220 }, render: (t) => (
      <InlineSelect value={t.projectId} options={data.projects.map((p) => ({ key: p.id, label: p.title }))} placeholder="—"
        onCommit={(v) => update("tasks", t.id, { projectId: v })} />
    ) },
    { key: "priority", label: "PRIORITY", stopClick: true, render: (t) => (
      <InlineSelect value={t.priority} options={PRIORITIES.map((p) => ({ key: p, label: p }))}
        color={t.priority === "HIGH" ? "var(--red)" : undefined} onCommit={(v) => update("tasks", t.id, { priority: v })} />
    ) },
    { key: "source", label: "SOURCE", render: (t) => <Badge label={(t.source || "manual").toUpperCase()} subtle /> },
    { key: "del", label: "", stopClick: true, render: (t) => <ConfirmButton label="" confirmLabel="Sure?" onConfirm={() => remove("tasks", t.id)} /> },
  ];

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        {[["tasks", "Tasks"], ["notes", "Notes"]].map(([k, l]) => (
          <div key={k} className={"md-chip" + (pane === k ? " active" : "")} role="button" tabIndex={0}
            onClick={() => setPane(k)} onKeyDown={(e) => { if (e.key === "Enter") setPane(k); }}>{l}</div>
        ))}
      </div>

      {pane === "notes" ? <NotesPane searchQuery={searchQuery} /> : (
        <div>
          <ViewHeader count={tasks.length} label={`TASK${tasks.length === 1 ? "" : "S"}${mineOnly ? " ASSIGNED TO ME" : ""}`}>
            <button className="md-chip" onClick={() => setMineOnly((m) => !m)}
              style={mineOnly ? { background: "var(--accent)", borderColor: "var(--accent)", color: "var(--ink)" } : undefined}>
              <Star size={11} style={{ marginRight: 5, verticalAlign: -1 }} /> My Tasks
            </button>
            <div style={{ display: "flex", background: "var(--panel-raised)", border: "1px solid var(--rule)", borderRadius: 6, padding: 2 }}>
              <button className="md-btn md-btn-ghost" onClick={() => setViewMode("board")} style={{ padding: "5px 9px", background: viewMode === "board" ? "var(--panel)" : "transparent" }}>
                <LayoutGrid size={14} color={viewMode === "board" ? "var(--accent)" : "var(--dim)"} />
              </button>
              <button className="md-btn md-btn-ghost" onClick={() => setViewMode("table")} style={{ padding: "5px 9px", background: viewMode === "table" ? "var(--panel)" : "transparent" }}>
                <TableIcon size={14} color={viewMode === "table" ? "var(--accent)" : "var(--dim)"} />
              </button>
            </div>
            <ExportMenu title="Tasks" columns={columns} rows={tasks} />
          </ViewHeader>

          <div className="md-card" style={{ padding: 14, display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
            <input className="md-input" style={{ flex: "2 1 260px" }} placeholder="Add a task — assign it to anyone on the team…"
              value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") createTask(); }} />
            <button className="md-btn md-btn-primary" onClick={createTask}><Plus size={14} /> Add Task</button>
          </div>

          <div style={{ marginBottom: 16 }}>
            <FilterChips options={TASK_STATUSES.map((s) => ({ ...s, count: data.tasks.filter((t) => t.status === s.key).length }))}
              value={statusFilter} onChange={setStatusFilter} allLabel="All" />
          </div>

          {tasks.length === 0 ? (
            <EmptyState title="No tasks match" subtitle="Add a task above, or clear the filters. Call recordings and meetings add tasks here automatically." />
          ) : viewMode === "table" ? (
            <DataTable columns={columns} rows={tasks} onRowClick={setOpenTask} hideExport />
          ) : (
            <KanbanBoard
              columns={TASK_STATUSES}
              items={tasks}
              columnOf={(t) => t.status}
              onMove={(id, status) => update("tasks", id, { status, completedAt: status === "done" ? Date.now() : null })}
              emptyHint="Drag a task here"
              renderCard={(t) => (
                <TaskCard task={t} memberName={memberName} projectName={projectName}
                  onOpen={() => setOpenTask(t)} onToggle={() => toggle(t)} />
              )}
            />
          )}
        </div>
      )}

      {openTask && (
        <TaskDetail task={data.tasks.find((t) => t.id === openTask.id) || openTask} onClose={() => setOpenTask(null)} />
      )}
    </div>
  );
}
