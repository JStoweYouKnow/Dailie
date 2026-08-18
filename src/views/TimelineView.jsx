import { useMemo, useState, useEffect } from "react";
import { Plus, Mic } from "lucide-react";
import { useStore } from "../lib/store";
import { stageInfo, recordTypeInfo } from "../lib/model";
import { formatDay, formatClock, uid } from "../lib/format";
import { FilterChips, EmptyState } from "../ui/kit";

function QuickLogBar({ onAdd, onRecord }) {
  const { currentUser } = useStore();
  const [text, setText] = useState("");
  const submit = () => {
    if (!text.trim()) return;
    onAdd(text.trim());
    setText("");
  };
  return (
    <div className="md-card" style={{ padding: 14, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 20 }}>
      <input className="md-input" style={{ flex: "2 1 260px" }} placeholder="Log a note — call, send-out, decision, cut…"
        value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
      <span className="md-mono" style={{ fontSize: 11, color: "var(--dim)" }}>as {currentUser ? currentUser.name : "you"}</span>
      <button className="md-btn md-btn-primary" onClick={submit}><Plus size={14} /> Log Note</button>
      <button className="md-btn md-btn-ghost" onClick={() => onRecord(null)} style={{ border: "1px solid var(--red)", color: "var(--red)" }}>
        <Mic size={14} /> Record Call
      </button>
    </div>
  );
}

export default function TimelineView({ searchQuery, onRecord }) {
  const { data, add, currentUser, memberName } = useStore();
  const [filter, setFilter] = useState("all");

  const entries = useMemo(() => {
    const list = [];
    data.projects.forEach((p) => {
      (p.history || []).forEach((h) => list.push({
        id: `p-${h.id}`, ts: h.date, type: "project", kind: "PROJECT",
        title: p.title, subtitle: h.note, color: recordTypeInfo(p.recordType).color,
      }));
    });
    data.meetings.forEach((m) => {
      const open = data.tasks.filter((t) => t.meetingId === m.id && t.status !== "done").length;
      list.push({
        id: `m-${m.id}`, ts: m.date, type: "meeting", kind: "MEETING", title: m.title,
        subtitle: open ? `${open} open follow-up${open === 1 ? "" : "s"}` : m.attendees, color: "var(--accent)",
      });
    });
    data.calls.forEach((c) => list.push({
      id: `c-${c.id}`, ts: c.startedAt, type: "call", kind: "CALL", title: c.title,
      subtitle: c.summary ? c.summary.slice(0, 140) : `${(c.nextSteps || []).length} next steps`, color: "var(--info)",
    }));
    data.emails.forEach((e) => list.push({
      id: `e-${e.id}`, ts: e.sentAt, type: "email", kind: e.direction === "in" ? "EMAIL IN" : "EMAIL OUT",
      title: e.subject, subtitle: e.direction === "in" ? `from ${e.from}` : `to ${(e.to || []).join(", ")}`, color: "var(--sage)",
    }));
    data.tasks.filter((t) => t.status === "done" && t.completedAt).forEach((t) => list.push({
      id: `t-${t.id}`, ts: t.completedAt, type: "task", kind: "TASK DONE", title: t.title,
      subtitle: (t.assigneeIds || []).map(memberName).filter(Boolean).join(", "), color: "var(--sage)",
    }));
    (data.logs || []).forEach((l) => list.push({
      id: `l-${l.id}`, ts: l.date, type: "log", kind: "NOTE", title: l.text,
      subtitle: l.author ? `Logged by ${l.author}` : "", color: "var(--bone)",
    }));
    return list.sort((a, b) => b.ts - a.ts);
  }, [data, memberName]);

  const filtered = useMemo(() => {
    let list = entries;
    if (filter !== "all") list = list.filter((e) => e.type === filter);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((e) => (e.title || "").toLowerCase().includes(q) || (e.subtitle || "").toLowerCase().includes(q));
    }
    return list.slice(0, 250);
  }, [entries, filter, searchQuery]);

  const groups = useMemo(() => {
    const out = [];
    let lastDay = null;
    filtered.forEach((e) => {
      const day = formatDay(e.ts);
      if (day !== lastDay) { out.push({ day, items: [] }); lastDay = day; }
      out[out.length - 1].items.push(e);
    });
    return out;
  }, [filtered]);

  const addLog = (text) => add("logs", { date: Date.now(), text, author: currentUser ? currentUser.name : "Unnamed" });

  return (
    <div>
      <QuickLogBar onAdd={addLog} onRecord={onRecord} />
      <div style={{ marginBottom: 20 }}>
        <FilterChips
          options={[
            { key: "project", label: "Projects" },
            { key: "meeting", label: "Meetings" },
            { key: "call", label: "Calls" },
            { key: "email", label: "Emails" },
            { key: "task", label: "Tasks" },
            { key: "log", label: "Notes" },
          ]}
          value={filter} onChange={setFilter} allLabel="All Activity"
        />
      </div>
      {groups.length === 0 ? (
        <EmptyState title="Nothing on the timeline yet" subtitle="Project moves, meetings, calls, emails and completed tasks all land here." />
      ) : (
        groups.map((g, i) => (
          <div key={`${g.day}-${i}`} style={{ marginBottom: 24 }}>
            <div className="md-mono" style={{ fontSize: 11, color: "var(--accent)", letterSpacing: ".14em", marginBottom: 12, fontWeight: 600 }}>{g.day}</div>
            <div style={{ borderLeft: "1px solid var(--rule)", marginLeft: 3 }}>
              {g.items.map((it) => (
                <div key={it.id} style={{ position: "relative", padding: "0 0 20px 24px" }}>
                  <div className="md-sprocket" style={{ position: "absolute", left: -3.5, top: 6, background: it.color }} />
                  <div className="md-mono" style={{ fontSize: 11, color: "var(--dim)", marginBottom: 4 }}>{formatClock(it.ts)} · {it.kind}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "var(--bone)" }}>{it.title}</div>
                  {it.subtitle && <div style={{ fontSize: 13, color: "var(--dim)", marginTop: 2 }}>{it.subtitle}</div>}
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
