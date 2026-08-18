import { useMemo, useState } from "react";
import { Plus, Table as TableIcon, CalendarRange, ShieldCheck, ShieldAlert, X, UserPlus, ExternalLink } from "lucide-react";
import { useStore } from "../lib/store";
import {
  TALENT_STATUSES, RATE_UNITS, DISCIPLINES, recordTypeInfo, lookupColor, lookupLabel,
  makeTalent, makeAssignment, bookings, isBusyOn, nextFreeDay, utilisation, ndaFor, loadOn,
} from "../lib/model";
import { formatShort, formatFull, formatMoney, parseMoney, dateInputValue, tsFromDateInput, uid, DAY } from "../lib/format";
import {
  ViewHeader, FilterChips, DataTable, EmptyState, Badge, Avatar, InlineText, InlineSelect, InlineDate,
  ModalShell, Field, Section, ConfirmButton,
} from "../ui/kit";

const WINDOWS = [
  { key: "4", label: "4 weeks", days: 28 },
  { key: "12", label: "12 weeks", days: 84 },
  { key: "26", label: "6 months", days: 182 },
];

function rateLabel(t) {
  if (!t.rateAmount) return "";
  return `${formatMoney(parseMoney(t.rateAmount), t.currency || "USD")} ${lookupLabel(RATE_UNITS, t.rateUnit || "day")}`;
}

function NdaCell({ talent }) {
  const { data, add, update, currentUser } = useStore();
  const nda = ndaFor(data, talent);

  if (nda) {
    return (
      <Badge
        label={nda.status === "signed" ? "SIGNED" : lookupLabel([{ key: "sent", label: "SENT" }, { key: "open", label: "UNSIGNED" }, { key: "draft", label: "DRAFT" }, { key: "expired", label: "EXPIRED" }], nda.status).toUpperCase()}
        color={nda.status === "signed" ? "var(--sage)" : "var(--red)"}
        icon={nda.status === "signed" ? <ShieldCheck size={10} /> : <ShieldAlert size={10} />}
      />
    );
  }

  // Creating it here writes a real record into the NDA tracker rather than a loose flag.
  const create = (status) => {
    const contract = add("contracts", {
      kind: "nda",
      title: `${talent.name} — Crew NDA`,
      companyId: null,
      talentId: talent.id,
      projectId: null,
      status,
      signedAt: status === "signed" ? Date.now() : null,
      expiresAt: null,
      ownerId: (currentUser && currentUser.id) || null,
      notes: "",
    });
    update("talent", talent.id, { ndaContractId: contract.id });
  };

  return (
    <div style={{ display: "flex", gap: 4 }}>
      <button className="md-btn md-btn-ghost" style={{ fontSize: 10, padding: "3px 7px", border: "1px solid var(--rule)" }}
        onClick={() => create("signed")} title="Record a signed NDA in the tracker">Mark signed</button>
      <button className="md-btn md-btn-ghost" style={{ fontSize: 10, padding: "3px 7px", border: "1px solid var(--rule)" }}
        onClick={() => create("sent")} title="Record an NDA sent for signature">Sent</button>
    </div>
  );
}

/** Horizontal capacity chart: one row per person, bars for each booking. */
function AvailabilityTimeline({ roster, onOpen }) {
  const { data } = useStore();
  const [windowKey, setWindowKey] = useState("12");
  const win = WINDOWS.find((w) => w.key === windowKey) || WINDOWS[1];

  const start = useMemo(() => new Date().setHours(0, 0, 0, 0), []);
  const end = start + win.days * DAY;
  const dayWidth = win.days <= 28 ? 22 : win.days <= 84 ? 9 : 4.5;
  const width = win.days * dayWidth;

  // A tick per week keeps the axis readable at every zoom level.
  const ticks = [];
  for (let i = 0; i < win.days; i += 7) {
    ticks.push({ offset: i, ts: start + i * DAY });
  }

  const projectColor = (projectId) => {
    const project = data.projects.find((p) => p.id === projectId);
    return project ? recordTypeInfo(project.recordType).color : "#6e6b65";
  };
  const projectTitle = (projectId) => {
    const project = data.projects.find((p) => p.id === projectId);
    return project ? project.title : "Unassigned hold";
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
        <FilterChips options={WINDOWS.map((w) => ({ key: w.key, label: w.label }))} value={windowKey} onChange={setWindowKey} />
        <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {[...new Set(roster.flatMap((t) => bookings(t).map((b) => b.projectId)))].filter(Boolean).slice(0, 5).map((pid) => (
            <span key={pid} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--dim)" }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: projectColor(pid) }} />{projectTitle(pid)}
            </span>
          ))}
        </div>
      </div>

      <div className="md-scroll" style={{ overflowX: "auto", border: "1px solid var(--rule)", borderRadius: 12, background: "var(--panel)" }}>
        <div style={{ minWidth: 220 + width }}>
          {/* axis */}
          <div style={{ display: "flex", borderBottom: "1px solid var(--rule)", background: "var(--panel-raised)", position: "sticky", top: 0, zIndex: 1 }}>
            <div className="md-mono" style={{ width: 220, flexShrink: 0, padding: "9px 14px", fontSize: 10, color: "var(--dim)", letterSpacing: ".08em", fontWeight: 700 }}>
              WHO
            </div>
            <div style={{ position: "relative", width, height: 34 }}>
              {ticks.map((t) => (
                <div key={t.offset} className="md-mono" style={{
                  position: "absolute", left: t.offset * dayWidth, top: 0, height: "100%",
                  borderLeft: "1px solid var(--rule)", paddingLeft: 5, fontSize: 9, color: "var(--dim)",
                  display: "flex", alignItems: "center", whiteSpace: "nowrap",
                }}>
                  {new Date(t.ts).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </div>
              ))}
            </div>
          </div>

          {roster.map((t) => {
            const used = Math.round(utilisation(t, start, end) * 100);
            const free = nextFreeDay(t);
            return (
              <div key={t.id} style={{ display: "flex", borderBottom: "1px solid var(--rule)", minHeight: 46 }}>
                <div role="button" tabIndex={0} onClick={() => onOpen(t)} onKeyDown={(e) => { if (e.key === "Enter") onOpen(t); }}
                  style={{ width: 220, flexShrink: 0, padding: "8px 14px", display: "flex", alignItems: "center", gap: 9, cursor: "pointer" }}>
                  <Avatar name={t.name} size={26} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--bone)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</div>
                    <div className="md-mono" style={{ fontSize: 9, color: used >= 90 ? "var(--red)" : used > 0 ? "var(--warn)" : "var(--sage)" }}>
                      {used === 0 ? "FULLY AVAILABLE" : `${used}% BOOKED`}
                    </div>
                  </div>
                </div>

                <div style={{ position: "relative", width, background: "repeating-linear-gradient(90deg, transparent 0, transparent " + (7 * dayWidth - 1) + "px, var(--rule) " + (7 * dayWidth - 1) + "px, var(--rule) " + (7 * dayWidth) + "px)" }}>
                  {bookings(t).map((b) => {
                    const from = Math.max(b.startDate, start);
                    const to = Math.min(b.endDate, end);
                    if (to < start || from > end) return null;
                    const left = ((from - start) / DAY) * dayWidth;
                    const barWidth = Math.max(dayWidth, ((to - from) / DAY + 1) * dayWidth);
                    const color = projectColor(b.projectId);
                    const partial = (Number(b.allocation) || 100) < 100;
                    return (
                      <div key={b.id}
                        title={`${projectTitle(b.projectId)} · ${b.role || "assigned"}\n${formatFull(b.startDate)} → ${formatFull(b.endDate)}\n${b.allocation || 100}% allocated`}
                        style={{
                          position: "absolute", left, width: barWidth, top: 10, height: 26,
                          background: partial ? `${color}44` : `${color}cc`,
                          border: `1px solid ${color}`, borderRadius: 5,
                          display: "flex", alignItems: "center", padding: "0 6px",
                          fontSize: 10, color: "var(--ink)", fontWeight: 700,
                          overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
                        }}>
                        {barWidth > 60 ? projectTitle(b.projectId) : ""}
                      </div>
                    );
                  })}
                  {bookings(t).length === 0 && (
                    <div className="md-mono" style={{ position: "absolute", left: 8, top: 16, fontSize: 10, color: "var(--dim-2)" }}>
                      no bookings{free ? "" : ""}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {roster.length === 0 && (
            <div style={{ padding: 30, textAlign: "center", fontSize: 13, color: "var(--dim)" }}>No one matches this filter.</div>
          )}
        </div>
      </div>
      <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 10 }}>
        Solid bars are full-time bookings; faded bars are partial allocations, so someone at 50% still has room.
      </div>
    </div>
  );
}

function TalentDetail({ talent, onClose }) {
  const { data, update, remove, patch, add, currentUser, memberName } = useStore();
  const nda = ndaFor(data, talent);
  const list = bookings(talent);
  const free = nextFreeDay(talent);

  const setField = (changes) => update("talent", talent.id, changes);

  const setAssignment = (id, changes) => update("talent", talent.id, (t) => ({
    assignments: (t.assignments || []).map((a) => (a.id === id ? { ...a, ...changes } : a)),
  }));
  const addAssignment = () => update("talent", talent.id, (t) => ({
    assignments: [...(t.assignments || []), makeAssignment({ startDate: Date.now(), endDate: Date.now() + 14 * DAY })],
  }));
  const removeAssignment = (id) => update("talent", talent.id, (t) => ({
    assignments: (t.assignments || []).filter((a) => a.id !== id),
  }));

  /** Signing someone is what makes them assignable on tasks and the Home board. */
  const makeAssignable = () => {
    const member = { id: uid(), name: talent.name, email: talent.email || "", role: talent.discipline || "" };
    patch((current) => ({
      team: [...current.team, member],
      talent: current.talent.map((t) => (t.id === talent.id ? { ...t, teamMemberId: member.id } : t)),
    }));
  };

  return (
    <ModalShell wide title={talent.name || "New roster entry"} subtitle={[talent.discipline, lookupLabel(TALENT_STATUSES, talent.status)].filter(Boolean).join(" · ")} onClose={onClose}>
      <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 20 }}>
        <Avatar name={talent.name} size={54} />
        <div style={{ flex: 1 }}>
          <InlineText value={talent.name} style={{ fontSize: 18, fontWeight: 700 }} onCommit={(v) => v.trim() && setField({ name: v.trim() })} />
          <InlineText value={talent.discipline} placeholder="Add a discipline" style={{ color: "var(--dim)" }} onCommit={(v) => setField({ discipline: v })} />
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)", marginBottom: 4 }}>AVAILABILITY</div>
          {isBusyOn(talent, Date.now())
            ? <Badge label={free ? `FREE ${formatShort(free).toUpperCase()}` : "FULLY BOOKED"} color="var(--warn)" />
            : <Badge label="AVAILABLE NOW" color="var(--sage)" />}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14, marginBottom: 20 }}>
        <Field label="STATUS">
          <InlineSelect value={talent.status} options={TALENT_STATUSES} color={lookupColor(TALENT_STATUSES, talent.status)}
            onCommit={(v) => setField({ status: v })} />
        </Field>
        <Field label="RATE">
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <div style={{ flex: 1 }}>
              <InlineText value={talent.rateAmount} mono placeholder="e.g. 1450" style={{ color: "var(--accent)", fontWeight: 700 }}
                onCommit={(v) => setField({ rateAmount: v })} />
            </div>
            <InlineSelect value={talent.rateUnit || "day"} options={RATE_UNITS} onCommit={(v) => setField({ rateUnit: v })} />
          </div>
        </Field>
        <Field label="NDA"><NdaCell talent={talent} /></Field>
        <Field label="EMAIL"><InlineText value={talent.email} mono style={{ color: "var(--accent)" }} onCommit={(v) => setField({ email: v })} /></Field>
        <Field label="PHONE"><InlineText value={talent.phone} mono onCommit={(v) => setField({ phone: v })} /></Field>
        <Field label="AGENT / REP"><InlineText value={talent.agent} placeholder="Add rep" onCommit={(v) => setField({ agent: v })} /></Field>
        <Field label="BASED IN"><InlineText value={talent.location} placeholder="Add location" onCommit={(v) => setField({ location: v })} /></Field>
        <Field label="REEL / PORTFOLIO">
          <InlineText value={talent.reel} mono placeholder="Add link" style={{ color: "var(--accent)", fontSize: 12 }} onCommit={(v) => setField({ reel: v })} />
        </Field>
        <Field label="CHAMPIONED BY">
          <InlineSelect value={talent.ownerId} options={data.team.map((m) => ({ key: m.id, label: m.name }))} placeholder="Unassigned"
            onCommit={(v) => setField({ ownerId: v })} />
        </Field>
      </div>

      {talent.status === "signed" && !talent.teamMemberId && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", border: "1px solid var(--accent)", borderRadius: 10, background: "var(--panel-raised)", marginBottom: 20, flexWrap: "wrap" }}>
          <UserPlus size={15} color="var(--accent)" />
          <div style={{ flex: "1 1 220px", fontSize: 12, color: "var(--dim)" }}>
            {talent.name} is signed but cannot be assigned tasks yet.
          </div>
          <button className="md-btn md-btn-primary" onClick={makeAssignable}>Make assignable</button>
        </div>
      )}
      {talent.teamMemberId && (
        <div style={{ fontSize: 12, color: "var(--sage)", marginBottom: 20 }}>
          Assignable on tasks as {memberName(talent.teamMemberId) || talent.name}.
        </div>
      )}

      <Section title={`PROJECT ASSIGNMENTS · ${list.length}`}>
        {(talent.assignments || []).length === 0 && (
          <div style={{ fontSize: 12, color: "var(--dim)", marginBottom: 10 }}>Not booked on anything — fully available.</div>
        )}
        {(talent.assignments || []).map((a) => (
          <div key={a.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "9px 0", borderBottom: "1px solid var(--rule)" }}>
            <div style={{ flex: "2 1 160px", minWidth: 0 }}>
              <InlineSelect value={a.projectId} options={data.projects.map((p) => ({ key: p.id, label: p.title }))} placeholder="Pick a project"
                onCommit={(v) => setAssignment(a.id, { projectId: v })} />
            </div>
            <div style={{ flex: "1 1 120px" }}>
              <InlineText value={a.role} placeholder="Role on it" onCommit={(v) => setAssignment(a.id, { role: v })} />
            </div>
            <InlineDate value={a.startDate} onCommit={(v) => setAssignment(a.id, { startDate: v })} />
            <span style={{ fontSize: 11, color: "var(--dim)" }}>→</span>
            <InlineDate value={a.endDate} onCommit={(v) => setAssignment(a.id, { endDate: v })} />
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <input type="number" min="10" max="100" step="10" className="md-input"
                style={{ width: 66, padding: "4px 6px", fontSize: 12 }}
                value={a.allocation || 100}
                onChange={(e) => setAssignment(a.id, { allocation: Math.min(100, Math.max(10, Number(e.target.value) || 100)) })} />
              <span className="md-mono" style={{ fontSize: 10, color: "var(--dim)" }}>%</span>
            </span>
            <button className="md-btn md-btn-ghost" style={{ padding: 5 }} onClick={() => removeAssignment(a.id)}><X size={13} /></button>
          </div>
        ))}
        <button className="md-btn md-btn-ghost" style={{ marginTop: 10, border: "1px solid var(--rule)" }} onClick={addAssignment}>
          <Plus size={13} /> Book on a project
        </button>
      </Section>

      <Field label="NOTES">
        <InlineText value={talent.notes} multiline placeholder="Who recommended them, what they want, how they work…" onCommit={(v) => setField({ notes: v })} />
      </Field>

      <div style={{ borderTop: "1px solid var(--rule)", paddingTop: 14 }}>
        <ConfirmButton label="Remove from roster" confirmLabel="Yes, remove" onConfirm={() => { remove("talent", talent.id); onClose(); }} />
      </div>
    </ModalShell>
  );
}

function NewTalentModal({ onClose, onCreated }) {
  const { add, currentUser } = useStore();
  const [form, setForm] = useState({ name: "", discipline: "", status: "prospect", email: "", rateAmount: "", rateUnit: "day" });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = () => {
    if (!form.name.trim()) return;
    const created = add("talent", makeTalent({
      name: form.name.trim(),
      discipline: form.discipline.trim(),
      status: form.status,
      email: form.email.trim().toLowerCase(),
      rateAmount: form.rateAmount.trim(),
      rateUnit: form.rateUnit,
      ownerId: (currentUser && currentUser.id) || null,
    }));
    if (onCreated) onCreated(created);
    onClose();
  };

  return (
    <ModalShell title="Add to Roster" subtitle="Someone you have hired, or want to" onClose={onClose}>
      <Field label="NAME"><input className="md-input" autoFocus value={form.name} onChange={set("name")} placeholder="e.g. Ines Okafor" /></Field>
      <Field label="DISCIPLINE">
        <input className="md-input" list="dailie-disciplines" value={form.discipline} onChange={set("discipline")} placeholder="e.g. Director of Photography" />
        <datalist id="dailie-disciplines">
          {DISCIPLINES.map((d) => <option key={d} value={d} />)}
        </datalist>
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="STATUS">
          <select className="md-select" value={form.status} onChange={set("status")}>
            {TALENT_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="EMAIL"><input className="md-input" value={form.email} onChange={set("email")} placeholder="name@studio.com" /></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="RATE"><input className="md-input" value={form.rateAmount} onChange={set("rateAmount")} placeholder="1450" /></Field>
        <Field label="PER">
          <select className="md-select" value={form.rateUnit} onChange={set("rateUnit")}>
            {RATE_UNITS.map((u) => <option key={u.key} value={u.key}>{u.label}</option>)}
          </select>
        </Field>
      </div>
      <button className="md-btn md-btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={submit}>Add to Roster</button>
    </ModalShell>
  );
}

export default function TeamView({ searchQuery }) {
  const { data, update } = useStore();
  const [statusFilter, setStatusFilter] = useState("all");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [mode, setMode] = useState("roster");
  const [open, setOpen] = useState(null);
  const [showNew, setShowNew] = useState(false);

  const roster = useMemo(() => {
    let list = [...(data.talent || [])];
    if (statusFilter !== "all") list = list.filter((t) => t.status === statusFilter);
    if (availableOnly) list = list.filter((t) => !isBusyOn(t, Date.now()));
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((t) =>
        t.name.toLowerCase().includes(q) ||
        (t.discipline || "").toLowerCase().includes(q) ||
        (t.notes || "").toLowerCase().includes(q) ||
        (t.tags || []).join(" ").toLowerCase().includes(q));
    }
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [data.talent, statusFilter, availableOnly, searchQuery]);

  const columns = [
    { key: "name", label: "NAME", render: (t) => (
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Avatar name={t.name} size={28} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: "var(--bone)" }}>{t.name}</div>
          {t.location && <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)" }}>{t.location}</div>}
        </div>
      </div>
    ) },
    { key: "discipline", label: "DISCIPLINE", stopClick: true, render: (t) => (
      <InlineText value={t.discipline} placeholder="Add" onCommit={(v) => update("talent", t.id, { discipline: v })} />
    ) },
    { key: "status", label: "SIGNED?", stopClick: true, render: (t) => (
      <InlineSelect value={t.status} options={TALENT_STATUSES} color={lookupColor(TALENT_STATUSES, t.status)}
        onCommit={(v) => update("talent", t.id, { status: v })} />
    ) },
    { key: "rate", label: "RATE", stopClick: true, render: (t) => (
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <InlineText value={t.rateAmount} mono placeholder="—" style={{ color: "var(--accent)", fontWeight: 700 }}
          onCommit={(v) => update("talent", t.id, { rateAmount: v })} />
        <InlineSelect value={t.rateUnit || "day"} options={RATE_UNITS} onCommit={(v) => update("talent", t.id, { rateUnit: v })} />
      </div>
    ) },
    { key: "nda", label: "NDA", stopClick: true, render: (t) => <NdaCell talent={t} /> },
    { key: "projects", label: "ASSIGNED TO", render: (t) => {
      const list = bookings(t);
      if (!list.length) return <span style={{ fontSize: 12, color: "var(--dim-2)" }}>—</span>;
      return (
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {list.slice(0, 2).map((b) => {
            const project = data.projects.find((p) => p.id === b.projectId);
            return <Badge key={b.id} label={project ? project.title : "Hold"} color={project ? recordTypeInfo(project.recordType).color : undefined} subtle={!project} />;
          })}
          {list.length > 2 && <span className="md-mono" style={{ fontSize: 10, color: "var(--dim)" }}>+{list.length - 2}</span>}
        </div>
      );
    } },
    { key: "availability", label: "CAPACITY", render: (t) => {
      const busy = isBusyOn(t, Date.now());
      const free = nextFreeDay(t);
      const used = Math.round(utilisation(t, Date.now(), Date.now() + 84 * DAY) * 100);
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <Badge label={busy ? (free ? `FREE ${formatShort(free).toUpperCase()}` : "FULLY BOOKED") : "AVAILABLE NOW"} color={busy ? "var(--warn)" : "var(--sage)"} />
          <span className="md-mono" style={{ fontSize: 9, color: "var(--dim)" }}>{used}% booked · next 12 wks</span>
        </div>
      );
    } },
  ];

  const signed = (data.talent || []).filter((t) => t.status === "signed").length;
  const availableNow = (data.talent || []).filter((t) => !isBusyOn(t, Date.now())).length;

  return (
    <div>
      <ViewHeader count={roster.length} label="ON THE ROSTER">
        <button className="md-chip" onClick={() => setAvailableOnly((a) => !a)}
          style={availableOnly ? { background: "var(--sage)", borderColor: "var(--sage)", color: "var(--ink)" } : undefined}>
          Available now
        </button>
        <div style={{ display: "flex", background: "var(--panel-raised)", border: "1px solid var(--rule)", borderRadius: 6, padding: 2 }}>
          <button className="md-btn md-btn-ghost" title="Roster table" onClick={() => setMode("roster")}
            style={{ padding: "5px 9px", background: mode === "roster" ? "var(--panel)" : "transparent" }}>
            <TableIcon size={14} color={mode === "roster" ? "var(--accent)" : "var(--dim)"} />
          </button>
          <button className="md-btn md-btn-ghost" title="Availability calendar" onClick={() => setMode("calendar")}
            style={{ padding: "5px 9px", background: mode === "calendar" ? "var(--panel)" : "transparent" }}>
            <CalendarRange size={14} color={mode === "calendar" ? "var(--accent)" : "var(--dim)"} />
          </button>
        </div>
        <button className="md-btn md-btn-primary" onClick={() => setShowNew(true)}><Plus size={14} /> Add Person</button>
      </ViewHeader>

      <div style={{ display: "flex", gap: 34, flexWrap: "wrap", padding: "13px 18px", border: "1px solid var(--rule)", borderRadius: 12, background: "var(--panel)", marginBottom: 20 }}>
        <div>
          <div className="md-mono" style={{ fontSize: 22, fontWeight: 700 }}>{(data.talent || []).length}</div>
          <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)", letterSpacing: ".12em" }}>ON ROSTER</div>
        </div>
        <div>
          <div className="md-mono" style={{ fontSize: 22, fontWeight: 700, color: "var(--sage)" }}>{signed}</div>
          <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)", letterSpacing: ".12em" }}>SIGNED</div>
        </div>
        <div>
          <div className="md-mono" style={{ fontSize: 22, fontWeight: 700, color: "var(--accent)" }}>{availableNow}</div>
          <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)", letterSpacing: ".12em" }}>FREE TODAY</div>
        </div>
        <div>
          <div className="md-mono" style={{ fontSize: 22, fontWeight: 700, color: "var(--red)" }}>
            {(data.talent || []).filter((t) => !ndaFor(data, t)).length}
          </div>
          <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)", letterSpacing: ".12em" }}>NO NDA ON FILE</div>
        </div>
      </div>

      <div style={{ marginBottom: 18 }}>
        <FilterChips
          options={TALENT_STATUSES.map((s) => ({ ...s, count: (data.talent || []).filter((t) => t.status === s.key).length }))}
          value={statusFilter} onChange={setStatusFilter} allLabel="Everyone"
        />
      </div>

      {roster.length === 0 ? (
        <EmptyState
          title="No one on the roster yet"
          subtitle="Track the artists and crew you want to onboard — their rates, whether you have signed them, whether the NDA is in, and when they are free."
          action={<button className="md-btn md-btn-primary" onClick={() => setShowNew(true)}><Plus size={14} /> Add Person</button>}
        />
      ) : mode === "calendar" ? (
        <AvailabilityTimeline roster={roster} onOpen={setOpen} />
      ) : (
        <DataTable columns={columns} rows={roster} onRowClick={setOpen} />
      )}

      {open && <TalentDetail talent={(data.talent || []).find((t) => t.id === open.id) || open} onClose={() => setOpen(null)} />}
      {showNew && <NewTalentModal onClose={() => setShowNew(false)} onCreated={setOpen} />}
    </div>
  );
}
