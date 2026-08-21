import { useMemo, useState } from "react";
import { Plus, Mic2, MapPin, ExternalLink } from "lucide-react";
import { useStore } from "../lib/store";
import { EVENT_KINDS, EVENT_STATUSES, lookupColor } from "../lib/model";
import { tsFromDateInput, DAY } from "../lib/format";
import {
  ViewHeader, FilterChips, DataTable, EmptyState, Badge, Stat, Avatar, AvatarStack,
  InlineText, InlineSelect, InlineDate, ModalShell, Field, ConfirmButton, MemberPicker,
} from "../ui/kit";

function NewEventModal({ onClose }) {
  const { data, add, currentUser } = useStore();
  const [form, setForm] = useState({ name: "", kind: "panel", status: "invited", venue: "", location: "", url: "" });
  const [date, setDate] = useState("");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = () => {
    if (!form.name.trim()) return;
    add("events", {
      ...form,
      name: form.name.trim(),
      date: tsFromDateInput(date),
      speakerIds: currentUser ? [currentUser.id] : [],
      projectId: null,
      companyId: null,
      notes: "",
      cost: "",
    });
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
      <button className="md-btn md-btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={submit}>Add Event</button>
    </ModalShell>
  );
}

export default function EventsView({ searchQuery }) {
  const { data, update, remove, memberName } = useStore();
  const [kindFilter, setKindFilter] = useState("all");
  const [showNew, setShowNew] = useState(false);

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
    { key: "name", label: "EVENT", cellStyle: { minWidth: 230 }, stopClick: true, render: (e) => (
      <div>
        <InlineText value={e.name} style={{ fontWeight: 700 }} onCommit={(v) => update("events", e.id, { name: v })} />
        {e.url && (
          <a href={e.url} target="_blank" rel="noreferrer" className="md-mono"
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
    { key: "del", label: "", stopClick: true, render: (e) => <ConfirmButton label="" confirmLabel="Sure?" onConfirm={() => remove("events", e.id)} /> },
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
        <DataTable columns={columns} rows={rows} exportTitle="Events" />
      )}

      {showNew && <NewEventModal onClose={() => setShowNew(false)} />}
    </div>
  );
}
