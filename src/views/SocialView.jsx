import { useMemo, useState } from "react";
import { Plus, Share2, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { useStore } from "../lib/store";
import {
  SOCIAL_KINDS, SOCIAL_PLATFORMS, SOCIAL_STATUSES,
  lookupColor, lookupLabel, makeSocialItem,
} from "../lib/model";
import { formatClock, formatShort, DAY, datetimeInputValue, tsFromDatetimeInput } from "../lib/format";
import {
  allAttachments, trashAttachment, restoreAttachment, purgeAttachment,
  SOCIAL_FILE_ACCEPT,
} from "../lib/files";
import { useDraftUploads } from "../lib/draftUploads";
import { safeHref } from "../lib/safeUrl";
import {
  ViewHeader, FilterChips, EmptyState, Badge, Stat,
  InlineText, InlineSelect, InlineDateTime, ModalShell, Field, ConfirmButton,
  AttachmentList,
} from "../ui/kit";

function dateKey(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addAttachment(row, file) {
  return { attachments: [...allAttachments(row), file] };
}

function removeAttachment(row, item) {
  return { attachments: trashAttachment(row, item) };
}

function undoRemove(row, item) {
  return { attachments: restoreAttachment(row, item) };
}

function purge(row, item) {
  return purgeAttachment(row, item).then((attachments) => ({ attachments }));
}

function NewSocialModal({ onClose, defaultKind, defaultScheduledAt }) {
  const { data, add, currentUser } = useStore();
  const drafts = useDraftUploads();
  const [form, setForm] = useState({
    kind: defaultKind && defaultKind !== "all" ? defaultKind : "post",
    title: "",
    copy: "",
    platform: "instagram",
    status: "scheduled",
    url: "",
    venue: "",
    projectId: "",
    notes: "",
  });
  const [when, setWhen] = useState(datetimeInputValue(defaultScheduledAt) || "");
  const [files, setFiles] = useState([]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = () => {
    if (!form.title.trim()) return;
    add("social", makeSocialItem({
      ...form,
      title: form.title.trim(),
      copy: form.copy.trim(),
      notes: form.notes.trim(),
      venue: form.venue.trim(),
      url: form.url.trim(),
      projectId: form.projectId || null,
      scheduledAt: tsFromDatetimeInput(when),
      ownerId: (currentUser && currentUser.id) || null,
      attachments: files,
    }));
    drafts.markSaved();
    onClose();
  };

  return (
    <ModalShell wide title={form.kind === "event" ? "New social event" : "New social post"}
      subtitle="A post to publish, or a public date — premiere, live, drop — on the same calendar."
      onClose={onClose}>
      <div className="md-split" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="TYPE">
          <select className="md-select" value={form.kind} onChange={set("kind")}>
            {SOCIAL_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
          </select>
        </Field>
        <Field label="PLATFORM">
          <select className="md-select" value={form.platform} onChange={set("platform")}>
            {SOCIAL_PLATFORMS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
          </select>
        </Field>
      </div>
      <Field label="TITLE">
        <input className="md-input" autoFocus value={form.title} onChange={set("title")}
          placeholder={form.kind === "event" ? "e.g. Wilderness Tide — live Q&A" : "e.g. Obsidian Echo teaser still"} />
      </Field>
      <Field label={form.kind === "event" ? "BLURB" : "CAPTION"}>
        <textarea className="md-textarea" rows={4} value={form.copy} onChange={set("copy")}
          placeholder={form.kind === "event" ? "What this date is, who is on it." : "The copy that goes out."} />
      </Field>
      <div className="md-split" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="WHEN"><input type="datetime-local" className="md-input" value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
        <Field label="STATUS">
          <select className="md-select" value={form.status} onChange={set("status")}>
            {SOCIAL_STATUSES.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
          </select>
        </Field>
      </div>
      <div className="md-split" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="PROJECT">
          <select className="md-select" value={form.projectId} onChange={set("projectId")}>
            <option value="">No project</option>
            {data.projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </Field>
        {form.kind === "event"
          ? <Field label="VENUE"><input className="md-input" value={form.venue} onChange={set("venue")} placeholder="YouTube Live, screening room…" /></Field>
          : <Field label="LINK"><input className="md-input" value={form.url} onChange={set("url")} placeholder="https://" /></Field>}
      </div>
      {form.kind === "event" && (
        <Field label="LINK"><input className="md-input" value={form.url} onChange={set("url")} placeholder="https://" /></Field>
      )}
      <Field label="NOTES">
        <textarea className="md-textarea" rows={2} value={form.notes} onChange={set("notes")} placeholder="Assets still needed, approval, embargo…" />
      </Field>
      <Field label="ASSETS" hint="Stills, cutdowns, captions. PNG, JPG, MP4, PDF, ZIP.">
        <AttachmentList
          items={files}
          accept={SOCIAL_FILE_ACCEPT}
          label="Add files"
          onAdd={(file) => { if (drafts.keep(file)) setFiles((list) => [...list, file]); }}
          onRemove={(item) => { drafts.drop(item); setFiles((list) => list.filter((f) => f.id !== item.id)); }}
        />
      </Field>
      <button className="md-btn md-btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={submit}>
        Save on calendar
      </button>
    </ModalShell>
  );
}

function SocialRow({ item, projectTitle }) {
  const { update, remove } = useStore();
  const href = safeHref(item.url);
  const soon = item.scheduledAt && item.scheduledAt > Date.now() && item.scheduledAt < Date.now() + 3 * DAY
    && item.status !== "posted" && item.status !== "cancelled";

  return (
    <div style={{ padding: 14, border: "1px solid var(--rule)", borderRadius: 12, background: "var(--panel)", marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <InlineText value={item.title} style={{ fontSize: 15, fontWeight: 700 }} placeholder="Add a title"
            onCommit={(v) => update("social", item.id, { title: v })} />
          {projectTitle && (
            <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)", marginTop: 3 }}>{projectTitle}</div>
          )}
        </div>
        <InlineSelect value={item.kind} options={SOCIAL_KINDS} color={lookupColor(SOCIAL_KINDS, item.kind)}
          onCommit={(v) => update("social", item.id, { kind: v })} />
        <InlineSelect value={item.platform} options={SOCIAL_PLATFORMS} color={lookupColor(SOCIAL_PLATFORMS, item.platform)}
          onCommit={(v) => update("social", item.id, { platform: v })} />
        <InlineSelect value={item.status} options={SOCIAL_STATUSES} color={lookupColor(SOCIAL_STATUSES, item.status)}
          onCommit={(v) => update("social", item.id, { status: v })} />
        <ConfirmButton label="" confirmLabel="Remove?" onConfirm={() => remove("social", item.id)} />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
        <InlineDateTime value={item.scheduledAt} onCommit={(v) => update("social", item.id, { scheduledAt: v })} />
        {soon && <Badge label="SOON" color="var(--warn)" />}
        {item.kind === "event" && (
          <InlineText value={item.venue} placeholder="Add venue" style={{ fontSize: 12, color: "var(--dim)" }}
            onCommit={(v) => update("social", item.id, { venue: v })} />
        )}
        <InlineText value={item.url} placeholder="Add link" mono style={{ color: "var(--accent)", fontSize: 12, flex: 1, minWidth: 140 }}
          onCommit={(v) => update("social", item.id, { url: v.trim() })} />
        {href && (
          <a href={href} target="_blank" rel="noreferrer" className="md-btn md-btn-ghost" style={{ padding: 6, textDecoration: "none" }}>
            <ExternalLink size={12} />
          </a>
        )}
      </div>

      <Field label={item.kind === "event" ? "BLURB" : "CAPTION"}>
        <InlineText value={item.copy} multiline placeholder={item.kind === "event" ? "Add a blurb" : "Add caption"}
          onCommit={(v) => update("social", item.id, { copy: v })} />
      </Field>
      <Field label="NOTES">
        <InlineText value={item.notes} multiline placeholder="Approvals, embargo, stills still needed…"
          onCommit={(v) => update("social", item.id, { notes: v })} />
      </Field>
      <Field label="ASSETS">
        <AttachmentList
          record={item}
          accept={SOCIAL_FILE_ACCEPT}
          label="Add file"
          onAdd={(file) => update("social", item.id, (row) => addAttachment(row, file))}
          onRemove={(file) => update("social", item.id, (row) => removeAttachment(row, file))}
          onRestore={(file) => update("social", item.id, (row) => undoRemove(row, file))}
          onPurge={async (file) => {
            const next = await purge(item, file);
            update("social", item.id, next);
          }}
        />
      </Field>
    </div>
  );
}

export default function SocialView({ searchQuery }) {
  const { data } = useStore();
  const [cursor, setCursor] = useState(new Date());
  const [kindFilter, setKindFilter] = useState("all");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [selectedKey, setSelectedKey] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const all = data.social || [];
  const projects = data.projects || [];

  const visible = useMemo(() => {
    let list = [...all].filter((s) => s.status !== "cancelled");
    if (kindFilter !== "all") list = list.filter((s) => s.kind === kindFilter);
    if (platformFilter !== "all") list = list.filter((s) => s.platform === platformFilter);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((s) =>
        (s.title || "").toLowerCase().includes(q) ||
        (s.copy || "").toLowerCase().includes(q) ||
        (s.venue || "").toLowerCase().includes(q) ||
        (s.notes || "").toLowerCase().includes(q));
    }
    return list;
  }, [all, kindFilter, platformFilter, searchQuery]);

  const byDay = useMemo(() => {
    const map = {};
    visible.forEach((item) => {
      if (!item.scheduledAt) return;
      const key = dateKey(item.scheduledAt);
      if (!key) return;
      if (!map[key]) map[key] = [];
      map[key].push(item);
    });
    Object.values(map).forEach((list) => list.sort((a, b) => a.scheduledAt - b.scheduledAt));
    return map;
  }, [visible]);

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

  const list = useMemo(() => {
    let rows = [...visible];
    if (selectedKey) rows = rows.filter((s) => dateKey(s.scheduledAt) === selectedKey);
    return rows.sort((a, b) => (a.scheduledAt || Infinity) - (b.scheduledAt || Infinity));
  }, [visible, selectedKey]);

  const projectName = (id) => ((projects.find((p) => p.id === id) || {}).title) || "";
  const upcoming = all.filter((s) => s.scheduledAt && s.scheduledAt >= Date.now() && s.status !== "posted" && s.status !== "cancelled");
  const drafts = all.filter((s) => s.status === "idea" || s.status === "draft");
  const events = all.filter((s) => s.kind === "event" && s.status !== "cancelled");
  const undated = all.filter((s) => !s.scheduledAt && s.status !== "posted" && s.status !== "cancelled");

  const defaultWhen = selectedKey ? new Date(`${selectedKey}T09:00:00`).getTime() : Date.now();

  return (
    <div>
      <ViewHeader count={all.length} label="SOCIAL CALENDAR">
        <button className="md-btn md-btn-primary" onClick={() => setShowNew(true)}><Plus size={14} /> Add</button>
      </ViewHeader>

      <div style={{ display: "flex", gap: 28, marginBottom: 18, flexWrap: "wrap" }}>
        <Stat label="UPCOMING" value={upcoming.length} accent="var(--accent)" />
        <Stat label="IN DRAFT" value={drafts.length} />
        <Stat label="EVENTS" value={events.length} />
        <Stat label="NO DATE YET" value={undated.length} />
      </div>

      <div style={{ marginBottom: 12 }}>
        <FilterChips options={SOCIAL_KINDS.map((k) => ({ ...k, count: all.filter((s) => s.kind === k.key).length }))}
          value={kindFilter} onChange={setKindFilter} allLabel="Posts & events" />
      </div>
      <div style={{ marginBottom: 16 }}>
        <FilterChips options={SOCIAL_PLATFORMS.map((k) => ({ ...k, count: all.filter((s) => s.platform === k.key).length }))}
          value={platformFilter} onChange={setPlatformFilter} allLabel="Every platform" />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <button className="md-btn md-btn-ghost" onClick={() => move(-1)} style={{ padding: 7 }}><ChevronLeft size={16} /></button>
        <div className="md-display" style={{ fontSize: 18, minWidth: "min(190px, 45vw)", textAlign: "center" }}>
          {cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </div>
        <button className="md-btn md-btn-ghost" onClick={() => move(1)} style={{ padding: 7 }}><ChevronRight size={16} /></button>
        <button className="md-btn md-btn-ghost" style={{ border: "1px solid var(--rule)", fontSize: 12 }} onClick={() => { setCursor(new Date()); setSelectedKey(todayKey); }}>Today</button>
        {selectedKey && (
          <button className="md-btn md-btn-ghost" style={{ fontSize: 12 }} onClick={() => setSelectedKey(null)}>Show all dates</button>
        )}
      </div>

      <div className="md-month-scroll">
        <div className="md-month-grid" style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1, background: "var(--rule)", border: "1px solid var(--rule)", borderRadius: 12, overflow: "hidden" }}>
          {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((d) => (
            <div key={d} className="md-mono" style={{ background: "var(--panel-raised)", padding: "9px 6px", fontSize: 10, color: "var(--dim)", textAlign: "center", letterSpacing: ".1em", fontWeight: 700 }}>{d}</div>
          ))}
          {cells.map((date, i) => {
            if (!date) return <div key={`empty-${i}`} style={{ background: "var(--panel)", minHeight: 96 }} />;
            const key = dateKey(date.getTime());
            const items = byDay[key] || [];
            const isToday = key === todayKey;
            const isSelected = key === selectedKey;
            return (
              <div key={key} role="button" tabIndex={0}
                onClick={() => setSelectedKey((prev) => (prev === key ? null : key))}
                onKeyDown={(e) => { if (e.key === "Enter") setSelectedKey((prev) => (prev === key ? null : key)); }}
                style={{
                  background: isSelected ? "var(--panel-raised)" : "var(--panel)",
                  minHeight: 96, padding: 7, cursor: "pointer",
                  borderTop: isToday ? "2px solid var(--accent)" : "none",
                  outline: isSelected ? "1px solid var(--accent)" : "none",
                  outlineOffset: -1,
                }}>
                <div className="md-mono" style={{ fontSize: 11, color: isToday ? "var(--accent)" : "var(--dim)", fontWeight: isToday ? 800 : 500, marginBottom: 5 }}>
                  {date.getDate()}
                </div>
                {items.slice(0, 3).map((item) => (
                  <div key={item.id} title={item.title}
                    style={{
                      fontSize: 10, padding: "3px 5px", marginBottom: 3, borderRadius: 4,
                      background: `${lookupColor(SOCIAL_PLATFORMS, item.platform)}22`,
                      borderLeft: `2px solid ${lookupColor(item.kind === "event" ? SOCIAL_KINDS : SOCIAL_PLATFORMS, item.kind === "event" ? item.kind : item.platform)}`,
                      color: "var(--bone)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                    {formatClock(item.scheduledAt)} {item.title}
                  </div>
                ))}
                {items.length > 3 && (
                  <div className="md-mono" style={{ fontSize: 9, color: "var(--dim)" }}>+{items.length - 3} more</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ marginTop: 22 }}>
        <div className="md-mono" style={{ fontSize: 10, color: "var(--dim-2)", letterSpacing: ".1em", marginBottom: 12 }}>
          {selectedKey ? `ON ${formatShort(new Date(`${selectedKey}T12:00:00`).getTime())}` : "ALL DATES"}
        </div>
        {list.length === 0 && undated.length === 0 && all.length === 0 ? (
          <EmptyState
            title="Nothing on the social calendar"
            subtitle="Put posts and public dates here — premieres, lives, drops — so the week ahead is one grid, not a thread of DMs."
            action={<button className="md-btn md-btn-primary" onClick={() => setShowNew(true)}><Share2 size={14} /> Add a post or event</button>}
          />
        ) : list.length === 0 && selectedKey ? (
          <EmptyState
            title="Nothing on this day"
            subtitle="Add a post or event for the day you selected."
            action={<button className="md-btn md-btn-primary" onClick={() => setShowNew(true)}><Plus size={14} /> Add on this day</button>}
          />
        ) : (
          list.map((item) => <SocialRow key={item.id} item={item} projectTitle={projectName(item.projectId)} />)
        )}
        {!selectedKey && undated.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <div className="md-mono" style={{ fontSize: 10, color: "var(--dim-2)", letterSpacing: ".1em", marginBottom: 12 }}>NO DATE YET</div>
            {undated.map((item) => <SocialRow key={item.id} item={item} projectTitle={projectName(item.projectId)} />)}
          </div>
        )}
      </div>

      {showNew && (
        <NewSocialModal
          onClose={() => setShowNew(false)}
          defaultKind={kindFilter}
          defaultScheduledAt={defaultWhen}
        />
      )}
    </div>
  );
}
