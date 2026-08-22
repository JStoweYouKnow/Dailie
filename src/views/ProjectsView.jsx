import { useMemo, useState } from "react";
import { LayoutGrid, Table as TableIcon, Image as ImageIcon, Plus, Star } from "lucide-react";
import { useStore } from "../lib/store";
import {
  RECORD_TYPES, recordTypeInfo, STAGES, stageInfo, PRIORITIES,
  PAYMENT_STATUSES, lookupLabel, lookupColor,
  projectOwnerIds, withProjectOwners, isOnProject,
} from "../lib/model";
import { formatShort, uid } from "../lib/format";
import { imageSrc } from "../lib/files";
import {
  ViewHeader, FilterChips, EmptyState, DataTable, KanbanBoard, Badge, Avatar, AvatarStack,
  InlineText, InlineSelect, MemberPicker, ExportMenu,
} from "../ui/kit";

/** Owner + every assigned team member — the set the MY PROJECTS filter matches against. */
export function isMine(project, userId) {
  return isOnProject(project, userId);
}

function ProjectCard({ project, onOpen, memberName, companyName }) {
  const type = recordTypeInfo(project.recordType);
  const image = imageSrc(project);
  const ownerNames = projectOwnerIds(project).map(memberName).filter(Boolean);
  const teamNames = (project.teamIds || []).map(memberName).filter((n) => n && !ownerNames.includes(n));
  return (
    <div className="md-card" onClick={onOpen} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }}
      style={{ marginBottom: 12, cursor: "pointer", borderLeft: `3px solid ${type.color}`, overflow: "hidden" }}>
      {image && (
        <div style={{ height: 92, background: `var(--panel-raised) url(${image}) center/cover no-repeat` }} />
      )}
      <div style={{ padding: 13 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6, marginBottom: 6, minWidth: 0 }}>
          <div title={project.title} style={{ fontSize: 14, fontWeight: 700, color: "var(--bone)", lineHeight: 1.35, minWidth: 0, wordBreak: "break-word", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{project.title}</div>
          {project.priority === "HIGH" && <Badge label="HIGH" color="var(--red)" />}
        </div>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 9 }}>
          <Badge label={type.short} color={type.color} />
          {project.paymentStatus && project.paymentStatus !== "na" && (
            <Badge label={lookupLabel(PAYMENT_STATUSES, project.paymentStatus)} color={lookupColor(PAYMENT_STATUSES, project.paymentStatus)} />
          )}
        </div>
        {project.companyId && (
          <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)", marginBottom: 5 }}>{companyName(project.companyId).toUpperCase()}</div>
        )}
        {project.budget && <div className="md-mono" style={{ fontSize: 11, color: "var(--accent)", marginBottom: 7 }}>{project.budget}</div>}
        {project.nextStep && (
          <div style={{ fontSize: 12, color: "var(--bone)", opacity: 0.85, marginBottom: 10, lineHeight: 1.4 }}>
            <span className="md-mono" style={{ fontSize: 9, color: "var(--dim)", letterSpacing: ".1em" }}>NEXT · </span>{project.nextStep}
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <AvatarStack names={[...ownerNames, ...teamNames]} size={22} max={4} />
          <span className="md-mono" style={{ fontSize: 10, color: "var(--dim)" }}>{formatShort(project.updatedAt)}</span>
        </div>
      </div>
    </div>
  );
}

function GalleryGrid({ projects, onOpen, memberName, companyName }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(248px, 1fr))", gap: 16 }}>
      {projects.map((p) => (
        <ProjectCard key={p.id} project={p} onOpen={() => onOpen(p)} memberName={memberName} companyName={companyName} />
      ))}
    </div>
  );
}


/**
 * One editable pipeline per record type. Service Production, Original IP and Outside IP
 * each keep their own columns, so "All Types" stacks the boards rather than hiding two
 * thirds of the slate behind a filter.
 */
function PipelineBoard({ typeKey, projects, showHeading, onOpenDetail }) {
  const { data, patch, update, updateProject, memberName, companyName } = useStore();
  const type = recordTypeInfo(typeKey);
  const pipeline = data.pipelines[typeKey] || [];
  const items = projects.filter((p) => p.recordType === typeKey);

  const setPipeline = (next) => patch((current) => ({ pipelines: { ...current.pipelines, [typeKey]: next } }));

  const addColumn = () => {
    const label = window.prompt(`Name the new ${type.label} stage`, "New Stage");
    if (!label || !label.trim()) return;
    setPipeline([...pipeline, { key: uid(), label: label.trim(), color: type.color }]);
  };

  const renameColumn = (key, label) => {
    if (!label.trim()) return;
    setPipeline(pipeline.map((c) => (c.key === key ? { ...c, label: label.trim() } : c)));
  };

  const removeColumn = (key) => {
    if (pipeline.length <= 1) return;
    const used = data.projects.filter((p) => p.recordType === typeKey && p.pipelineStage === key);
    if (used.length && !window.confirm(`${used.length} project(s) sit in this column. They will move to "${pipeline[0].label}". Continue?`)) return;
    used.forEach((p) => update("projects", p.id, { pipelineStage: pipeline[0].key }));
    setPipeline(pipeline.filter((c) => c.key !== key));
  };

  /** Drop a column onto another to take its position; the rest shuffle around it. */
  const reorderColumns = (fromKey, toKey) => {
    const from = pipeline.findIndex((c) => c.key === fromKey);
    const to = pipeline.findIndex((c) => c.key === toKey);
    if (from === -1 || to === -1 || from === to) return;
    const next = [...pipeline];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setPipeline(next);
  };

  const move = (projectId, stageKey) => {
    const project = data.projects.find((p) => p.id === projectId);
    const label = (pipeline.find((c) => c.key === stageKey) || {}).label || stageKey;
    if (!project || project.pipelineStage === stageKey) return;
    updateProject(projectId, { pipelineStage: stageKey }, `Moved to ${label}`);
  };

  return (
    <div style={{ marginBottom: showHeading ? 30 : 0 }}>
      {showHeading && (
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}>
          <span style={{ width: 9, height: 9, borderRadius: 2, background: type.color }} />
          <span className="md-mono" style={{ fontSize: 11, letterSpacing: ".14em", color: "var(--bone)", fontWeight: 700 }}>
            {type.label.toUpperCase()}
          </span>
          <span className="md-mono" style={{ fontSize: 11, color: "var(--dim)" }}>{items.length}</span>
        </div>
      )}
      <KanbanBoard
        columns={pipeline}
        items={items}
        columnOf={(p) => (pipeline.some((c) => c.key === p.pipelineStage) ? p.pipelineStage : pipeline[0].key)}
        onMove={move}
        onAddColumn={addColumn}
        onRenameColumn={renameColumn}
        onRemoveColumn={pipeline.length > 1 ? removeColumn : undefined}
        onReorderColumns={reorderColumns}
        emptyHint="Drag a project here"
        renderCard={(p) => <ProjectCard project={p} onOpen={() => onOpenDetail(p)} memberName={memberName} companyName={companyName} />}
      />
    </div>
  );
}

export default function ProjectsView({ searchQuery, onOpenDetail, onOpenNew }) {
  const { data, patch, update, updateProject, updateSettings, currentUser, memberName, companyName } = useStore();
  const [typeFilter, setTypeFilter] = useState("all");
  const [viewMode, setViewMode] = useState("pipeline");
  const [mineOnly, setMineOnly] = useState(false);

  const projects = useMemo(() => {
    let list = data.projects;
    if (typeFilter !== "all") list = list.filter((p) => p.recordType === typeFilter);
    if (mineOnly) list = list.filter((p) => isMine(p, currentUser && currentUser.id));
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((p) =>
        p.title.toLowerCase().includes(q) ||
        (p.description || "").toLowerCase().includes(q) ||
        (p.nextStep || "").toLowerCase().includes(q) ||
        memberName(p.ownerId).toLowerCase().includes(q) ||
        projectOwnerIds(p).some((id) => memberName(id).toLowerCase().includes(q)) ||
        (p.contactName || "").toLowerCase().includes(q) ||
        (p.contactEmail || "").toLowerCase().includes(q) ||
        (p.contactPhone || "").toLowerCase().includes(q));
    }
    return list;
  }, [data.projects, typeFilter, mineOnly, searchQuery, currentUser, memberName]);

  const moveToStage = (projectId, stageKey) => {
    const project = data.projects.find((p) => p.id === projectId);
    if (!project || project.stage === stageKey) return;
    updateProject(projectId, { stage: stageKey }, `Moved to ${stageInfo(stageKey).label}`);
  };

  const typeOptions = RECORD_TYPES.map((t) => ({
    key: t.key, label: t.short, color: t.color,
    count: data.projects.filter((p) => p.recordType === t.key).length,
  }));

  const modeButton = (mode, Icon, title) => (
    <button className="md-btn md-btn-ghost" onClick={() => setViewMode(mode)} title={title}
      style={{ padding: "5px 9px", borderRadius: 4, background: viewMode === mode ? "var(--panel)" : "transparent" }}>
      <Icon size={14} color={viewMode === mode ? "var(--accent)" : "var(--dim)"} />
    </button>
  );

  const allColumns = [
    { key: "title", label: "PROJECT", cellStyle: { minWidth: 210 }, render: (p) => (
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {imageSrc(p) ? (
          <div style={{ width: 34, height: 24, borderRadius: 4, background: `var(--panel-raised) url(${imageSrc(p)}) center/cover`, flexShrink: 0 }} />
        ) : (
          <div style={{ width: 34, height: 24, borderRadius: 4, background: "var(--panel-raised)", flexShrink: 0 }} />
        )}
        <span style={{ fontWeight: 600, color: "var(--bone)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.title}</span>
      </div>
    ) },
    { key: "type", label: "TYPE", render: (p) => <Badge label={recordTypeInfo(p.recordType).short} color={recordTypeInfo(p.recordType).color} /> },
    { key: "pipeline", label: "PIPELINE", stopClick: true, render: (p) => (
      <InlineSelect value={p.pipelineStage} options={data.pipelines[p.recordType] || []}
        color={lookupColor(data.pipelines[p.recordType] || [], p.pipelineStage)}
        onCommit={(v) => updateProject(p.id, { pipelineStage: v }, `Moved to ${lookupLabel(data.pipelines[p.recordType] || [], v)}`)} />
    ) },
    { key: "stage", label: "PRODUCTION STAGE", stopClick: true, render: (p) => (
      <InlineSelect value={p.stage} options={STAGES} color={stageInfo(p.stage).color} onCommit={(v) => moveToStage(p.id, v)} />
    ) },
    { key: "owner", label: "OWNERS", stopClick: true, cellStyle: { minWidth: 160 }, render: (p) => (
      <MemberPicker
        team={data.team}
        selectedIds={projectOwnerIds(p)}
        label="Assign owners"
        onChange={(ids) => {
          const next = withProjectOwners(ids);
          const names = next.ownerIds.map(memberName).filter(Boolean);
          const teamIds = (p.teamIds || []).filter((id) => !next.ownerIds.includes(id));
          updateProject(p.id, { ...next, teamIds }, names.length ? `Owners: ${names.join(", ")}` : "Owners cleared");
        }}
      />
    ) },
    { key: "team", label: "TEAM", stopClick: true, cellStyle: { minWidth: 160 }, render: (p) => (
      <MemberPicker
        team={data.team}
        selectedIds={p.teamIds || []}
        label="Assign team"
        onChange={(ids) => updateProject(p.id, { teamIds: ids.filter((id) => !projectOwnerIds(p).includes(id)) }, "Team updated")}
      />
    ) },
    { key: "contactName", label: "CONTACT", stopClick: true, render: (p) => (
      <InlineText value={p.contactName} placeholder="Who we call" onCommit={(v) => updateProject(p.id, { contactName: v.trim() })} />
    ) },
    { key: "contactEmail", label: "EMAIL", stopClick: true, render: (p) => (
      <InlineText value={p.contactEmail} mono placeholder="name@company.com" style={{ color: "var(--accent)", fontSize: 12 }}
        onCommit={(v) => updateProject(p.id, { contactEmail: v.trim().toLowerCase() })} />
    ) },
    { key: "contactPhone", label: "PHONE", stopClick: true, render: (p) => (
      <InlineText value={p.contactPhone} mono placeholder="Add phone" style={{ fontSize: 12, color: "var(--dim)" }}
        onCommit={(v) => updateProject(p.id, { contactPhone: v.trim() })} />
    ) },
    { key: "budget", label: "BUDGET / VALUE", stopClick: true, render: (p) => (
      <InlineText value={p.budget} mono placeholder="Add value" style={{ color: "var(--accent)", fontWeight: 700 }}
        onCommit={(v) => updateProject(p.id, { budget: v })} />
    ) },
    { key: "next", label: "NEXT STEP", cellStyle: { minWidth: 220, maxWidth: 320 }, stopClick: true, render: (p) => (
      <InlineText value={p.nextStep} placeholder="Add next step" onCommit={(v) => updateProject(p.id, { nextStep: v }, `Next step: ${v}`)} />
    ) },
    { key: "paid", label: "PAID", stopClick: true, render: (p) => (
      <InlineSelect value={p.paymentStatus || "na"} options={PAYMENT_STATUSES} color={lookupColor(PAYMENT_STATUSES, p.paymentStatus)}
        onCommit={(v) => updateProject(p.id, { paymentStatus: v })} />
    ) },
    { key: "priority", label: "PRIORITY", stopClick: true, render: (p) => (
      <InlineSelect value={p.priority} options={PRIORITIES.map((x) => ({ key: x, label: x }))}
        color={p.priority === "HIGH" ? "var(--red)" : undefined} onCommit={(v) => updateProject(p.id, { priority: v })} />
    ) },
    { key: "updated", label: "UPDATED", render: (p) => <span className="md-mono" style={{ fontSize: 11, color: "var(--dim)" }}>{formatShort(p.updatedAt)}</span> },
  ];

  // A saved order wins; columns added by a later release append rather than disappear.
  const savedOrder = data.settings.projectColumnOrder || [];
  const columns = savedOrder.length
    ? [
        ...savedOrder.map((key) => allColumns.find((c) => c.key === key)).filter(Boolean),
        ...allColumns.filter((c) => !savedOrder.includes(c.key)),
      ]
    : allColumns;

  const reorderTableColumns = (fromKey, toKey) => {
    const order = columns.map((c) => c.key);
    const from = order.indexOf(fromKey);
    const to = order.indexOf(toKey);
    if (from === -1 || to === -1 || from === to) return;
    order.splice(to, 0, order.splice(from, 1)[0]);
    updateSettings({ projectColumnOrder: order });
  };

  return (
    <div>
      <ViewHeader count={projects.length} label={`PROJECT${projects.length === 1 ? "" : "S"}${mineOnly ? " ASSIGNED TO ME" : ""}`}>
        <button className="md-chip" onClick={() => setMineOnly((m) => !m)}
          style={mineOnly ? { background: "var(--accent)", borderColor: "var(--accent)", color: "var(--ink)" } : undefined}>
          <Star size={11} style={{ marginRight: 5, verticalAlign: -1 }} /> My Projects
        </button>
        <div style={{ display: "flex", background: "var(--panel-raised)", border: "1px solid var(--rule)", borderRadius: 6, padding: 2 }}>
          {modeButton("pipeline", LayoutGrid, "Deal pipeline board")}
          {modeButton("gallery", ImageIcon, "Gallery view")}
          {modeButton("table", TableIcon, "Table view")}
        </div>
        <ExportMenu title="Projects" columns={columns} rows={projects} />
        <button className="md-btn md-btn-primary" onClick={onOpenNew}><Plus size={14} /> New Project</button>
      </ViewHeader>

      <div style={{ marginBottom: 18 }}>
        <FilterChips options={typeOptions} value={typeFilter} onChange={setTypeFilter} allLabel="All Types" />
      </div>

      {projects.length === 0 ? (
        <EmptyState
          title={mineOnly ? "Nothing assigned to you yet" : "No projects match this filter"}
          subtitle={mineOnly ? "Projects where you are the owner or a team member land here." : "Change the type filter, clear your search, or add a project."}
        />
      ) : viewMode === "table" ? (
        <DataTable columns={columns} rows={projects} onRowClick={onOpenDetail} onReorderColumns={reorderTableColumns} hideExport />
      ) : viewMode === "gallery" ? (
        <GalleryGrid projects={projects} onOpen={onOpenDetail} memberName={memberName} companyName={companyName} />
      ) : (
        (typeFilter === "all" ? RECORD_TYPES.map((t) => t.key) : [typeFilter])
          .filter((key) => typeFilter !== "all" || projects.some((p) => p.recordType === key))
          .map((key) => (
            <PipelineBoard key={key} typeKey={key} projects={projects} showHeading={typeFilter === "all"} onOpenDetail={onOpenDetail} />
          ))
      )}
    </div>
  );
}
