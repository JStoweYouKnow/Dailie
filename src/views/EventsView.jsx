import { useMemo, useState } from "react";
import { Plus, Mic2, ExternalLink } from "lucide-react";
import { useStore } from "../lib/store";
import { EVENT_KINDS, EVENT_STATUSES, lookupColor, lookupLabel } from "../lib/model";
import { tsFromDateInput, DAY, dateInputValue } from "../lib/format";
import { safeHref } from "../lib/safeUrl";
import {
  ViewHeader, FilterChips, DataTable, EmptyState, Badge, Stat,
  InlineText, InlineSelect, InlineDate, ModalShell, Field, ConfirmButton, MemberPicker,
} from "../ui/kit";
import { CompanySelect } from "../ui/CompanySelect";

function EventDetail({ event, onClose }) {
  const { data, update, remove, memberName } = useStore();
  const live = (data.events || []).find((e) => e.id === event.id) || event;
  const patch = (changes) => update("events", live.id, changes);
  const kind = EVENT_KINDS.find((k) => k.key === live.kind) || EVENT_KINDS[0];
  const project = data.projects.find((p) => p.id === live.projectId);

  return (
    <ModalShell
      wide
      title={live.name || "Untitled event"}
      subtitle={[lookupLabel(EVENT_KINDS, live.kind), live.venue, live.location].filter(Boolean).join(" · ")}
      onClose={onClose}
    >
      <Field label="EVENT NAME">
        <InlineText value={live.name} style={{ fontSize: 18, fontWeight: 700 }} placeholder="Name this event"
          onCommit={(v) => v.trim() && patch({ name: v.trim() })} />
      </Field>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 8 }}>
        <Field label="OUR ROLE">
          <InlineSelect value={live.kind} options={EVENT_KINDS} color={kind.color} onCommit={(v) => patch({ kind: v })} />
        </Field>
        <Field label="STATUS">
          <InlineSelect value={live.status} options={EVENT_STATUSES} color={lookupColor(EVENT_STATUSES, live.status)}
            onCommit={(v) => patch({ status: v })} />
        </Field>
        <Field label="DATE">
          <input type="date" className="md-input" value={dateInputValue(live.date)}
            onChange={(e) => patch({ date: tsFromDateInput(e.target.value) })} />
        </Field>
        <Field label="COST">
          <InlineText value={live.cost} mono placeholder="e.g. $4,500" onCommit={(v) => patch({ cost: v })} />
        </Field>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 8 }}>
        <Field label="VENUE">
          <InlineText value={live.venue} placeholder="e.g. Austin Convention Center" onCommit={(v) => patch({ venue: v })} />
        </Field>
        <Field label="LOCATION">
          <InlineText value={live.location} placeholder="City, country" onCommit={(v) => patch({ location: v })} />
        </Field>
        <Field label="LINK">
          <div>
            <InlineText value={live.url} mono placeholder="https://" onCommit={(v) => patch({ url: v.trim() })} />
            {safeHref(live.url) && (
              <a href={safeHref(live.url)} target="_blank" rel="noreferrer" className="md-mono"
                style={{ fontSize: 11, color: "var(--accent)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4, marginTop: 6 }}>
                Open link <ExternalLink size={11} />
              </a>
            )}
          </div>
        </Field>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 8 }}>
        <Field label="PROJECT">
          <InlineSelect value={live.projectId} options={data.projects.map((p) => ({ key: p.id, label: p.title }))} placeholder="No project"
            onCommit={(v) => patch({ projectId: v })} />
        </Field>
        <Field label="COMPANY">
          <CompanySelect value={live.companyId} placeholder="No company"
            onCommit={(v) => patch({ companyId: v })} />
        </Field>
      </div>

      <Field label="WHO'S SPEAKING">
        <MemberPicker team={data.team} selectedIds={live.speakerIds || []} label="Add speaker"
          onChange={(ids) => patch({ speakerIds: ids })} />
        {(live.speakerIds || []).length > 0 && (
          <div style={{ marginTop: 8, fontSize: 12, color: "var(--dim)" }}>
            {(live.speakerIds || []).map(memberName).filter(Boolean).join(", ")}
            {project ? ` · ${project.title}` : ""}
          </div>
        )}
      </Field>

      <Field label="NOTES">
        <InlineText value={live.notes} multiline placeholder="What this date is, who to confirm, travel, the talk title…"
          onCommit={(v) => patch({ notes: v })} />
      </Field>

      <div style={{ borderTop: "1px solid var(--rule)", paddingTop: 14 }}>
        <ConfirmButton label="Remove event" confirmLabel="Yes, remove" onConfirm={() => { remove("events", live.id); onClose(); }} />
      </div>
    </ModalShell>
  );
}

function NewEventModal({ onClose, onCreated }) {
  const { data, add, currentUser } = useStore();
  const [form, setForm] = useState({ name: "", kind: "panel", status: "invited", venue: "", location: "", url: "", projectId: "", companyId: "" });
  const [date, setDate] = useState("");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = () => {
    if (!form.name.trim()) return;
    const event = add("events", {
      name: form.name.trim(),
      kind: form.kind,
      status: form.status,
      venue: form.venue.trim(),
      location: form.location.trim(),
      url: form.url.trim(),
      date: tsFromDateInput(date),
      speakerIds: currentUser ? [currentUser.id] : [],
      projectId: form.projectId || null,
      companyId: form.companyId || null,
      notes: "",
      cost: "",
    });
    if (onCreated) onCreated(event);
    onClose();
  };

  return (
    <ModalShell title="New Event" subtitle="Something we're hosting, or speaking at" onClose={onClose}>
      <Field label="EVENT NAME"><input className="md-input" autoFocus value={form.name} onChange={set("name")} placeholder="e.g. SXSW — The Future of Virtual Production" /></Field>
      <div className="md-split" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="OUR ROLE">
          <select className="md-select" value={form.kind} onChange={set("kind")}>
            {EVENT_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
          </select>
        </Field>
        <Field label="STATUS">
          <select className="md-select" value={form.status} onChange={set("status")}>
            {EVENT_STATUSES.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
          </select>
        </Field>
      </div>
      <div className="md-split" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="DATE"><input type="date" className="md-input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="VENUE"><input className="md-input" value={form.venue} onChange={set("venue")} placeholder="e.g. Austin Convention Center" /></Field>
      </div>
      <div className="md-split" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="LOCATION"><input className="md-input" value={form.location} onChange={set("location")} placeholder="Austin, TX" /></Field>
        <Field label="LINK"><input className="md-input" value={form.url} onChange={set("url")} placeholder="https://" /></Field>
      </div>
      <Field label="PROJECT">
        <select className="md-select" value={form.projectId} onChange={set("projectId")}>
          <option value="">No project</option>
          {data.projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
      </Field>
      <Field label="COMPANY">
        <CompanySelect native value={form.companyId} placeholder="No company"
          onCommit={(id) => setForm((f) => ({ ...f, companyId: id || "" }))} />
      </Field>
      <button className="md-btn md-btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={submit}>Add Event</button>
    </ModalShell>
  );
}

export default function EventsView({ searchQuery }) {
  const { data, update, remove } = useStore();
  const [kindFilter, setKindFilter] = useState("all");
  const [showNew, setShowNew] = useState(false);
  const [open, setOpen] = useState(null);

  const rows = useMemo(() => {
    let list = [...(data.events || [])];
    if (kindFilter !== "all") list = list.filter((e) => e.kind === kindFilter);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((e) =>
        (e.name || "").toLowerCase().includes(q) ||
        (e.venue || "").toLowerCase().includes(q) ||
        (e.location || "").toLowerCase().includes(q) ||
        (e.notes || "").toLowerCase().includes(q));
    }
    // Soonest first, undated last.
    return list.sort((a, b) => (a.date || Infinity) - (b.date || Infinity));
  }, [data.events, kindFilter, searchQuery]);

  const upcoming = (data.events || []).filter((e) => e.date && e.date >= Date.now());
  const speaking = (data.events || []).filter((e) => ["keynote", "panel", "demo", "pitch"].includes(e.kind));
  const hosting = (data.events || []).filter((e) => e.kind === "hosting");
  const needsAnswer = (data.events || []).filter((e) => e.status === "invited" || e.status === "submitted");

  const columns = [
    { key: "name", label: "EVENT", cellStyle: { minWidth: 230 }, render: (e) => (
      <div>
        <div style={{ fontWeight: 700, color: "var(--bone)" }}>{e.name}</div>
        {safeHref(e.url) && (
          <a href={safeHref(e.url)} target="_blank" rel="noreferrer" className="md-mono"
            onClick={(ev) => ev.stopPropagation()}
            style={{ fontSize: 10, color: "var(--accent)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
            link <ExternalLink size={9} />
          </a>
        )}
      </div>
    ) },
    { key: "kind", label: "OUR ROLE", stopClick: true, render: (e) => (
      <InlineSelect value={e.kind} options={EVENT_KINDS} color={lookupColor(EVENT_KINDS, e.kind)}
        onCommit={(v) => update("events", e.id, { kind: v })} />
    ) },
    { key: "status", label: "STATUS", stopClick: true, render: (e) => (
      <InlineSelect value={e.status} options={EVENT_STATUSES} color={lookupColor(EVENT_STATUSES, e.status)}
        onCommit={(v) => update("events", e.id, { status: v })} />
    ) },
    { key: "date", label: "WHEN", stopClick: true, render: (e) => {
      const soon = e.date && e.date > Date.now() && e.date < Date.now() + 14 * DAY;
      return (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <InlineDate value={e.date} onCommit={(v) => update("events", e.id, { date: v })} />
          {soon && <Badge label="SOON" color="var(--warn)" />}
        </div>
      );
    } },
    { key: "who", label: "SPEAKING", stopClick: true, width: 160, render: (e) => (
      <MemberPicker team={data.team} selectedIds={e.speakerIds || []} label="Add speaker"
        onChange={(ids) => update("events", e.id, { speakerIds: ids })} />
    ) },
    { key: "venue", label: "VENUE", stopClick: true, render: (e) => (
      <InlineText value={e.venue} placeholder="Add venue" onCommit={(v) => update("events", e.id, { venue: v })} />
    ) },
    { key: "location", label: "WHERE", stopClick: true, render: (e) => (
      <InlineText value={e.location} placeholder="—" onCommit={(v) => update("events", e.id, { location: v })} />
    ) },
    { key: "project", label: "PROJECT", stopClick: true, render: (e) => (
      <InlineSelect value={e.projectId} options={data.projects.map((p) => ({ key: p.id, label: p.title }))} placeholder="—"
        onCommit={(v) => update("events", e.id, { projectId: v })} />
    ) },
    { key: "notes", label: "NOTES", cellStyle: { minWidth: 200 }, stopClick: true, render: (e) => (
      <InlineText value={e.notes} placeholder="Add note" onCommit={(v) => update("events", e.id, { notes: v })} />
    ) },
    { key: "del", label: "", stopClick: true, render: (e) => <ConfirmButton label="" confirmLabel="Sure?" onConfirm={() => { if (open && open.id === e.id) setOpen(null); remove("events", e.id); }} /> },
  ];

  return (
    <div>
      <ViewHeader count={rows.length} label="EVENTS">
        <button className="md-btn md-btn-primary" onClick={() => setShowNew(true)}><Plus size={14} /> New Event</button>
      </ViewHeader>

      <div style={{ display: "flex", gap: 34, flexWrap: "wrap", padding: "13px 18px", border: "1px solid var(--rule)", borderRadius: 12, background: "var(--panel)", marginBottom: 20 }}>
        <Stat label="UPCOMING" value={upcoming.length} />
        <Stat label="WE'RE SPEAKING" value={speaking.length} accent="var(--accent)" />
        <Stat label="WE'RE HOSTING" value={hosting.length} accent="var(--red)" />
        <Stat label="AWAITING AN ANSWER" value={needsAnswer.length} accent={needsAnswer.length ? "var(--warn)" : undefined} />
      </div>

      <div style={{ marginBottom: 18 }}>
        <FilterChips options={EVENT_KINDS.map((k) => ({ ...k, count: (data.events || []).filter((e) => e.kind === k.key).length }))}
          value={kindFilter} onChange={setKindFilter} allLabel="All Events" />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No events yet"
          subtitle="Track what the studio is hosting and where the team is speaking — keynotes, panels, demos and pitches — with who is on stage and when."
          action={<button className="md-btn md-btn-primary" onClick={() => setShowNew(true)}><Mic2 size={14} /> New Event</button>}
        />
      ) : (
        <DataTable columns={columns} rows={rows} onRowClick={setOpen} exportTitle="Events" />
      )}

      {showNew && <NewEventModal onClose={() => setShowNew(false)} onCreated={setOpen} />}
      {open && <EventDetail event={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
