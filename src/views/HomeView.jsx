import { useMemo } from "react";
import {
  CheckSquare, Square, Calendar as CalendarIcon, AlertTriangle, Video, ExternalLink,
  ArrowRight, Mail, Clock,
} from "lucide-react";
import { useStore } from "../lib/store";
import { staleFollowUps, alertsFor, recordTypeInfo, lookupColor, PAYMENT_STATUSES, lookupLabel, isOnProject } from "../lib/model";
import { formatShort, formatClock, formatDay, relativeDays, daysSince, DAY } from "../lib/format";
import { imageSrc } from "../lib/files";
import { Section, EmptyState, Badge, Avatar, AvatarStack, Stat } from "../ui/kit";
import { visibleMeetings, isSyncedMeeting, excludeMeetingFromSync } from "../lib/calendarExclusions";

function TaskLine({ task, onToggle, projectName, memberName }) {
  const overdue = task.dueDate && task.dueDate < Date.now() && task.status !== "done";
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--rule)" }}>
      <button className="md-btn md-btn-ghost" style={{ padding: 0, marginTop: 2 }} onClick={onToggle}>
        {task.status === "done" ? <CheckSquare size={15} color="var(--sage)" /> : <Square size={15} color="var(--dim)" />}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: task.status === "done" ? "var(--dim)" : "var(--bone)", textDecoration: task.status === "done" ? "line-through" : "none" }}>
          {task.title}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4, flexWrap: "wrap" }}>
          {task.projectId && <span className="md-mono" style={{ fontSize: 10, color: "var(--dim)" }}>{projectName(task.projectId)}</span>}
          {task.dueDate && <Badge label={overdue ? `OVERDUE · ${formatShort(task.dueDate)}` : formatShort(task.dueDate)} color={overdue ? "var(--red)" : undefined} subtle={!overdue} />}
          {task.source === "call" && <Badge label="FROM CALL" color="var(--info)" />}
        </div>
      </div>
      <AvatarStack names={(task.assigneeIds || []).map(memberName)} size={20} max={2} />
    </div>
  );
}

/** Each team member gets their own column, so the board reads like Attio's task lists. */
function TeamTaskColumns({ onOpenTab }) {
  const { data, update, projectName, memberName, currentUser } = useStore();

  const byMember = useMemo(() => {
    const open = data.tasks.filter((t) => t.status !== "done");
    const columns = data.team.map((m) => ({
      member: m,
      tasks: open.filter((t) => (t.assigneeIds || []).includes(m.id)).sort((a, b) => (a.dueDate || Infinity) - (b.dueDate || Infinity)),
    }));
    const unassigned = open.filter((t) => !(t.assigneeIds || []).length);
    if (unassigned.length) columns.push({ member: { id: "__none", name: "Unassigned" }, tasks: unassigned });
    return columns;
  }, [data.tasks, data.team]);

  const toggle = (task) => update("tasks", task.id, {
    status: task.status === "done" ? "todo" : "done",
    completedAt: task.status === "done" ? null : Date.now(),
  });

  return (
    <div className="md-scroll" style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 10, alignItems: "flex-start" }}>
      {byMember.map(({ member, tasks }) => (
        <div key={member.id} className="md-card" style={{
          minWidth: 290, flex: "0 0 290px", padding: 14,
          borderColor: currentUser && member.id === currentUser.id ? "var(--accent)" : "var(--rule)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}>
            <Avatar name={member.name} size={28} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--bone)" }}>{member.name}</div>
              <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)" }}>
                {tasks.length} OPEN{tasks.filter((t) => t.dueDate && t.dueDate < Date.now()).length ? ` · ${tasks.filter((t) => t.dueDate && t.dueDate < Date.now()).length} OVERDUE` : ""}
              </div>
            </div>
            {currentUser && member.id === currentUser.id && <Badge label="YOU" color="var(--accent)" />}
          </div>
          {tasks.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--dim-2)", padding: "12px 0" }}>Nothing open.</div>
          ) : (
            tasks.slice(0, 8).map((t) => (
              <TaskLine key={t.id} task={t} onToggle={() => toggle(t)} projectName={projectName} memberName={memberName} />
            ))
          )}
          {tasks.length > 8 && (
            <button className="md-btn md-btn-ghost" style={{ marginTop: 10, fontSize: 12 }} onClick={() => onOpenTab("tasks")}>
              {tasks.length - 8} more <ArrowRight size={12} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function MeetingsPanel({ onOpenTab, onRecord }) {
  const { data, patch, updateSettings, showToast } = useStore();

  const upcoming = useMemo(() => {
    const from = Date.now() - 2 * 60 * 60 * 1000;
    return visibleMeetings(data.meetings, data.settings)
      .filter((m) => m.date >= from && m.date <= Date.now() + 14 * DAY)
      .sort((a, b) => a.date - b.date)
      .slice(0, 8);
  }, [data.meetings, data.settings]);

  if (!upcoming.length) {
    return (
      <EmptyState
        title="No meetings on the calendar"
        subtitle="Connect your Google Calendar feed from the header to pull meetings in automatically."
      />
    );
  }

  let lastDay = null;
  return (
    <div>
      {upcoming.map((m) => {
        const dayLabel = formatDay(m.date);
        const showDay = dayLabel !== lastDay;
        lastDay = dayLabel;
        const live = Math.abs(m.date - Date.now()) < 30 * 60 * 1000;
        return (
          <div key={m.id}>
            {showDay && (
              <div className="md-mono" style={{ fontSize: 10, color: "var(--accent)", letterSpacing: ".14em", margin: "14px 0 8px", fontWeight: 600 }}>{dayLabel}</div>
            )}
            <div style={{
              display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", flexWrap: "wrap",
              border: `1px solid ${live ? "var(--accent)" : "var(--rule)"}`, borderRadius: 10, marginBottom: 8,
              background: live ? "var(--panel-raised)" : "transparent",
            }}>
              <span className="md-mono" style={{ fontSize: 12, color: "var(--dim)", width: 66, flexShrink: 0 }}>{formatClock(m.date)}</span>
              <div style={{ flex: "1 1 180px", minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--bone)" }}>{m.title}</div>
                {m.attendees && (
                  <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.attendees}</div>
                )}
              </div>
              {m.meetingLink && (
                <>
                  <a className="md-btn md-btn-ghost" href={m.meetingLink} target="_blank" rel="noreferrer"
                    style={{ textDecoration: "none", border: "1px solid var(--rule)", fontSize: 12 }}>
                    <ExternalLink size={12} /> Join
                  </a>
                  <button className="md-btn md-btn-ghost" style={{ border: "1px solid var(--red)", color: "var(--red)", fontSize: 12 }} onClick={() => onRecord(m)}>
                    <Video size={12} /> Record
                  </button>
                </>
              )}
              {isSyncedMeeting(m) && (
                <button className="md-btn md-btn-ghost" title="Hide from calendar sync" style={{ fontSize: 12 }}
                  onClick={() => excludeMeetingFromSync(m, {
                    meetings: data.meetings, settings: data.settings, patch, updateSettings, showToast,
                  })}>
                  Hide
                </button>
              )}
            </div>
          </div>
        );
      })}
      <button className="md-btn md-btn-ghost" style={{ marginTop: 6, fontSize: 12 }} onClick={() => onOpenTab("calendar")}>
        Open calendar <ArrowRight size={12} />
      </button>
    </div>
  );
}

export default function HomeView({ onOpenTab, onOpenProject, onRecord }) {
  const { data, currentUser, memberName, companyName } = useStore();

  const myProjects = useMemo(() => {
    const id = currentUser && currentUser.id;
    return data.projects.filter((p) => isOnProject(p, id));
  }, [data.projects, currentUser]);

  const stale = useMemo(() => staleFollowUps(data), [data]);
  const alerts = useMemo(() => alertsFor(data), [data]);
  const myOpen = data.tasks.filter((t) => t.status !== "done" && (t.assigneeIds || []).includes(currentUser && currentUser.id));
  const overdue = myOpen.filter((t) => t.dueDate && t.dueDate < Date.now());

  return (
    <div>
      <div style={{ display: "flex", gap: 36, flexWrap: "wrap", padding: "16px 18px", border: "1px solid var(--rule)", borderRadius: 12, background: "var(--panel)", marginBottom: 26 }}>
        <Stat label="MY OPEN TASKS" value={myOpen.length} onClick={() => onOpenTab("tasks")} />
        <Stat label="MY OVERDUE" value={overdue.length} accent={overdue.length ? "var(--red)" : undefined} onClick={() => onOpenTab("tasks")} />
        <Stat label="MY PROJECTS" value={myProjects.length} onClick={() => onOpenTab("projects")} />
        <Stat label="NEEDS FOLLOW-UP" value={stale.length} accent={stale.length ? "var(--red)" : undefined} onClick={() => onOpenTab("emails")} />
        <Stat label="PAPERWORK ALERTS" value={alerts.length} accent={alerts.length ? "var(--warn)" : undefined} onClick={() => onOpenTab("contracts")} />
      </div>

      <div className="md-split" style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(280px, 1fr)", gap: 26, alignItems: "start" }}>
        <div style={{ minWidth: 0 }}>
          <Section title="TASKS BY PERSON" right={
            <button className="md-btn md-btn-ghost" style={{ fontSize: 12 }} onClick={() => onOpenTab("tasks")}>All tasks <ArrowRight size={12} /></button>
          }>
            <TeamTaskColumns onOpenTab={onOpenTab} />
          </Section>

          <Section title="MY PROJECTS" right={
            <button className="md-btn md-btn-ghost" style={{ fontSize: 12 }} onClick={() => onOpenTab("projects")}>All projects <ArrowRight size={12} /></button>
          }>
            {myProjects.length === 0 ? (
              <EmptyState title="Nothing assigned to you" subtitle="Projects where you are an owner or a team member show up here." />
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 14 }}>
                {myProjects.map((p) => {
                  const type = recordTypeInfo(p.recordType);
                  const image = imageSrc(p);
                  return (
                    <div key={p.id} className="md-card" role="button" tabIndex={0}
                      onClick={() => onOpenProject(p)} onKeyDown={(e) => { if (e.key === "Enter") onOpenProject(p); }}
                      style={{ cursor: "pointer", overflow: "hidden", borderLeft: `3px solid ${type.color}` }}>
                      {image && <div style={{ height: 80, background: `var(--panel-raised) url(${image}) center/cover no-repeat` }} />}
                      <div style={{ padding: 13 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{p.title}</div>
                        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
                          <Badge label={type.short} color={type.color} />
                          {p.paymentStatus && p.paymentStatus !== "na" && (
                            <Badge label={lookupLabel(PAYMENT_STATUSES, p.paymentStatus)} color={lookupColor(PAYMENT_STATUSES, p.paymentStatus)} />
                          )}
                        </div>
                        {p.nextStep && (
                          <div style={{ fontSize: 12, color: "var(--dim)", lineHeight: 1.4 }}>
                            <span className="md-mono" style={{ fontSize: 9, letterSpacing: ".1em" }}>NEXT · </span>{p.nextStep}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>
        </div>

        <div style={{ minWidth: 0 }}>
          <Section title="MEETINGS">
            <MeetingsPanel onOpenTab={onOpenTab} onRecord={onRecord} />
          </Section>

          {stale.length > 0 && (
            <Section title="GONE QUIET" right={
              <button className="md-btn md-btn-ghost" style={{ fontSize: 12 }} onClick={() => onOpenTab("emails")}>Review <ArrowRight size={12} /></button>
            }>
              {stale.slice(0, 6).map((item) => (
                <div key={`${item.kind}-${item.id}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--rule)" }}>
                  <Mail size={13} color="var(--red)" />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</div>
                    <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)" }}>{relativeDays(item.lastContactAt)}</div>
                  </div>
                  <Badge label={`${daysSince(item.lastContactAt)}d`} color="var(--red)" />
                </div>
              ))}
            </Section>
          )}

          {alerts.length > 0 && (
            <Section title="NEEDS ATTENTION">
              {alerts.slice(0, 8).map((a) => (
                <div key={a.id} role="button" tabIndex={0}
                  onClick={() => onOpenTab(a.tab)} onKeyDown={(e) => { if (e.key === "Enter") onOpenTab(a.tab); }}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--rule)", cursor: "pointer" }}>
                  <AlertTriangle size={13} color={a.severity === "high" ? "var(--red)" : "var(--warn)"} />
                  <div style={{ flex: 1, fontSize: 13, color: "var(--bone)" }}>{a.text}</div>
                </div>
              ))}
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}
