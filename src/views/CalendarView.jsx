import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Video, ExternalLink, EyeOff } from "lucide-react";
import { useStore } from "../lib/store";
import { RECORD_TYPES, recordTypeInfo, EVENT_KINDS, lookupColor, lookupLabel } from "../lib/model";
import { formatClock } from "../lib/format";
import { FilterChips, Section, Badge } from "../ui/kit";
import { visibleMeetings, isSyncedMeeting, excludeMeetingFromSync } from "../lib/calendarExclusions";

function dateKey(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function CalendarView({ onOpenProject, onOpenTab, onRecord }) {
  const { data, patch, updateSettings, showToast } = useStore();
  const [cursor, setCursor] = useState(new Date());
  const [filter, setFilter] = useState("all");

  /**
   * Both project types land on the same grid; the filter is what lets you look at
   * Service Production alone, or Original IP alone, without losing the combined view.
   */
  const eventsByDay = useMemo(() => {
    const map = {};
    const push = (ts, event) => {
      const key = dateKey(ts);
      if (!key) return;
      if (!map[key]) map[key] = [];
      map[key].push(event);
    };

    if (filter === "all" || filter === "meetings") {
      visibleMeetings(data.meetings, data.settings).forEach((m) => push(m.date, {
        id: `m-${m.id}`, kind: "meeting", label: m.title, color: "var(--accent)", ts: m.date, meeting: m,
      }));
    }

    if (filter === "all" || filter === "tasks") {
      data.tasks.filter((t) => t.dueDate && t.status !== "done").forEach((t) => push(t.dueDate, {
        id: `t-${t.id}`, kind: "task", label: t.title, color: t.dueDate < Date.now() ? "var(--red)" : "var(--warn)", ts: t.dueDate,
      }));
    }

    if (filter === "all" || filter === "events") {
      (data.events || [])
        .filter((e) => e.date && e.status !== "declined")
        .forEach((e) => push(e.date, {
          id: `e-${e.id}`, kind: "event", label: `${e.name} — ${lookupLabel(EVENT_KINDS, e.kind)}`,
          color: lookupColor(EVENT_KINDS, e.kind), ts: e.date, event: e,
        }));
    }

    const typeFilters = RECORD_TYPES.map((t) => t.key);
    if (filter === "all" || typeFilters.includes(filter)) {
      data.projects
        .filter((p) => filter === "all" || p.recordType === filter)
        .forEach((p) => {
          const type = recordTypeInfo(p.recordType);
          if (p.startDate) push(p.startDate, { id: `ps-${p.id}`, kind: "project", label: `${p.title} — start`, color: type.color, ts: p.startDate, project: p });
          if (p.endDate) push(p.endDate, { id: `pe-${p.id}`, kind: "project", label: `${p.title} — delivery`, color: type.color, ts: p.endDate, project: p });
        });
    }

    Object.values(map).forEach((list) => list.sort((a, b) => a.ts - b.ts));
    return map;
  }, [data.meetings, data.settings, data.tasks, data.projects, data.events, filter]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = firstDay.getDay();
  const todayKey = dateKey(Date.now());

  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  const move = (delta) => setCursor(new Date(year, month + delta, 1));

  const filterOptions = [
    ...RECORD_TYPES.map((t) => ({ key: t.key, label: t.short, color: t.color })),
    { key: "meetings", label: "Meetings" },
    { key: "events", label: "Events" },
    { key: "tasks", label: "Task Due Dates" },
  ];

  const openEntry = (e) => {
    if (e.project && onOpenProject) onOpenProject(e.project);
    else if (e.kind === "meeting" && onOpenTab) onOpenTab("meetings");
    else if (e.kind === "task" && onOpenTab) onOpenTab("tasks");
    else if (e.kind === "event" && onOpenTab) onOpenTab("events");
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="md-btn md-btn-ghost" onClick={() => move(-1)} style={{ padding: 7 }}><ChevronLeft size={16} /></button>
          <div className="md-display" style={{ fontSize: 18, minWidth: 190, textAlign: "center" }}>
            {cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </div>
          <button className="md-btn md-btn-ghost" onClick={() => move(1)} style={{ padding: 7 }}><ChevronRight size={16} /></button>
          <button className="md-btn md-btn-ghost" style={{ border: "1px solid var(--rule)", fontSize: 12 }} onClick={() => setCursor(new Date())}>Today</button>
        </div>
      </div>

      <div style={{ marginBottom: 18 }}>
        <FilterChips options={filterOptions} value={filter} onChange={setFilter} allLabel="Everything" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1, background: "var(--rule)", border: "1px solid var(--rule)", borderRadius: 12, overflow: "hidden" }}>
        {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((d) => (
          <div key={d} className="md-mono" style={{ background: "var(--panel-raised)", padding: "9px 6px", fontSize: 10, color: "var(--dim)", textAlign: "center", letterSpacing: ".1em", fontWeight: 700 }}>{d}</div>
        ))}
        {cells.map((date, i) => {
          if (!date) return <div key={`empty-${i}`} style={{ background: "var(--panel)", minHeight: 108 }} />;
          const key = dateKey(date.getTime());
          const events = eventsByDay[key] || [];
          const isToday = key === todayKey;
          return (
            <div key={key} style={{ background: "var(--panel)", minHeight: 108, padding: 7, borderTop: isToday ? "2px solid var(--accent)" : "none" }}>
              <div className="md-mono" style={{ fontSize: 11, color: isToday ? "var(--accent)" : "var(--dim)", fontWeight: isToday ? 800 : 500, marginBottom: 5 }}>
                {date.getDate()}
              </div>
              {events.slice(0, 4).map((e) => (
                <div key={e.id} role="button" tabIndex={0}
                  onClick={() => openEntry(e)}
                  onKeyDown={(ev) => { if (ev.key === "Enter") openEntry(e); }}
                  title={e.label}
                  style={{
                    fontSize: 10, padding: "3px 5px", marginBottom: 3, borderRadius: 4, cursor: "pointer",
                    background: `${e.color === "var(--accent)" ? "var(--accent-soft)" : `${e.color}22`}`,
                    borderLeft: `2px solid ${e.color}`, color: "var(--bone)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                  {e.kind === "meeting" ? `${formatClock(e.ts)} ` : ""}{e.label}
                </div>
              ))}
              {events.length > 4 && (
                <div className="md-mono" style={{ fontSize: 9, color: "var(--dim)" }}>+{events.length - 4} more</div>
              )}
            </div>
          );
        })}
      </div>

      <Section title="NEXT UP" style={{ marginTop: 26 }}>
        {visibleMeetings(data.meetings, data.settings)
          .filter((m) => m.date >= Date.now() - 60 * 60 * 1000)
          .sort((a, b) => a.date - b.date)
          .slice(0, 5)
          .map((m) => (
            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: "1px solid var(--rule)", flexWrap: "wrap" }}>
              <span className="md-mono" style={{ fontSize: 11, color: "var(--dim)", width: 120 }}>
                {new Date(m.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {formatClock(m.date)}
              </span>
              <span style={{ flex: "1 1 180px", fontSize: 13, fontWeight: 600 }}>{m.title}</span>
              {m.meetingLink && (
                <>
                  <a className="md-btn md-btn-ghost" href={m.meetingLink} target="_blank" rel="noreferrer" style={{ textDecoration: "none", border: "1px solid var(--rule)", fontSize: 12 }}>
                    <ExternalLink size={12} /> Join
                  </a>
                  <button className="md-btn md-btn-ghost" style={{ border: "1px solid var(--red)", color: "var(--red)", fontSize: 12 }} onClick={() => onRecord && onRecord(m)}>
                    <Video size={12} /> Record
                  </button>
                </>
              )}
              {isSyncedMeeting(m) && (
                <button className="md-btn md-btn-ghost" title="Hide from calendar sync" style={{ fontSize: 12 }}
                  onClick={() => excludeMeetingFromSync(m, {
                    meetings: data.meetings, settings: data.settings, patch, updateSettings, showToast,
                  })}>
                  <EyeOff size={12} /> Hide
                </button>
              )}
            </div>
          ))}
        {visibleMeetings(data.meetings, data.settings).filter((m) => m.date >= Date.now() - 60 * 60 * 1000).length === 0 && (
          <div style={{ fontSize: 13, color: "var(--dim)" }}>Nothing scheduled. Connect a Google Calendar feed to pull meetings in.</div>
        )}
      </Section>
    </div>
  );
}
