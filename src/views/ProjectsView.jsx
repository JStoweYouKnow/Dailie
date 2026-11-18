import { useEffect, useMemo, useRef, useState } from "react";
import { LayoutGrid, Table as TableIcon, Image as ImageIcon, Plus, Star, Archive, ArchiveRestore, Search, X } from "lucide-react";
import { useStore } from "../lib/store";
import {
  RECORD_TYPES, recordTypeInfo, STAGES, stageInfo, PRIORITIES,
  PAYMENT_STATUSES, lookupLabel, lookupColor,
  projectOwnerIds, withProjectOwners, isOnProject,
  isArchivedProject, ARCHIVE_REASON_LABELS, archiveChange, restoreChange, dealsReadyToArchive,
  DEAL_BOARD_FILTERS, dealBoardBucket, isLostOrPassedColumn, isLostOrPassedDeal,
} from "../lib/model";
import { formatShort, uid } from "../lib/format";
import {
  imageSrc, listAttachments, allAttachments, trashAttachment, restoreAttachment, purgeAttachment,
  SLATE_FILE_ACCEPT,
} from "../lib/files";
import { readDealsBoardPrefs, writeDealsBoardPrefs } from "../lib/uiPrefs";
import {
  ViewHeader, FilterChips, EmptyState, DataTable, KanbanBoard, Badge, Avatar, AvatarStack,
  InlineText, InlineSelect, MemberPicker, ExportMenu, AttachmentList,
} from "../ui/kit";

/** Owner + every assigned team member — the set the MY DEALS filter matches against. */
export function isMine(project, userId) {
  return isOnProject(project, userId);
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

function ProjectCard({ project, onOpen, onRestore, onArchive, memberName, companyName }) {
  const { update } = useStore();
  const type = recordTypeInfo(project.recordType);
  const image = imageSrc(project);
  const ownerNames = projectOwnerIds(project).map(memberName).filter(Boolean);
  const teamNames = (project.teamIds || []).map(memberName).filter((n) => n && !ownerNames.includes(n));
  const files = listAttachments(project);
  return (
    <div className="md-card"
      style={{ marginBottom: 12, borderLeft: `3px solid ${type.color}`, overflow: "hidden" }}>
      <div onClick={onOpen} role="button" tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }}
        style={{ cursor: "pointer" }}>
        {image && (
          <img src={image} alt="" style={{ width: "100%", height: 92, objectFit: "cover", display: "block" }} />
        )}
        <div style={{ padding: "13px 13px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6, marginBottom: 6, minWidth: 0 }}>
            <div title={project.title} style={{ fontSize: 14, fontWeight: 700, color: "var(--bone)", lineHeight: 1.35, minWidth: 0, wordBreak: "break-word", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{project.title}</div>
            {project.priority === "HIGH" && <Badge label="HIGH" color="var(--red)" />}
          </div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 9 }}>
            <Badge label={type.short} color={type.color} />
            {isArchivedProject(project) && (
              <Badge label={ARCHIVE_REASON_LABELS[project.archiveReason] || "Archived"} color="var(--dim)" />
            )}
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
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
            <AvatarStack names={[...ownerNames, ...teamNames]} size={22} max={4} />
            <span className="md-mono" style={{ fontSize: 10, color: "var(--dim)" }}>{formatShort(project.updatedAt)}</span>
          </div>
        </div>
      </div>
      <div style={{ padding: "0 13px 13px" }}
        onMouseDown={(e) => e.stopPropagation()}>
        <AttachmentList
          record={project}
          compact
          accept={SLATE_FILE_ACCEPT}
          label="Add file"
          onAdd={(file) => update("projects", project.id, (row) => addAttachment(row, file))}
          onRemove={(item) => update("projects", project.id, (row) => removeAttachment(row, item))}
          onRestore={(item) => update("projects", project.id, (row) => undoRemove(row, item))}
          onPurge={async (item) => {
            const next = await purge(project, item);
            update("projects", project.id, next);
          }}
        />
        {!files.length && (
          <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 5 }}>Deck, one-sheet, treatment, budget.</div>
        )}
        {(onRestore || onArchive) && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            {onArchive && (
              <button className="md-btn md-btn-ghost" style={{ fontSize: 11 }}
                onClick={() => onArchive(project)}>
                <Archive size={12} /> Archive
              </button>
            )}
            {onRestore && (
              <button className="md-btn md-btn-ghost" style={{ fontSize: 11 }}
                onClick={() => onRestore(project)}>
                <ArchiveRestore size={12} /> Restore
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function GalleryGrid({ projects, onOpen, onRestore, onArchive, memberName, companyName }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(248px, 1fr))", gap: 16 }}>
      {projects.map((p) => (
        <ProjectCard
          key={p.id}
          project={p}
          onOpen={() => onOpen(p)}
          onRestore={onRestore}
          onArchive={onArchive}
          memberName={memberName}
          companyName={companyName}
        />
      ))}
    </div>
  );
}


/**
 * One editable pipeline per record type. Each type keeps its own columns, so
 * "All Types" stacks the boards rather than hiding work behind a filter.
 */
function PipelineBoard({ typeKey, projects, showHeading, onOpenDetail, onRestore, onArchive }) {
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
    const column = pipeline.find((c) => c.key === stageKey);
    const label = (column || {}).label || stageKey;
    if (!project || project.pipelineStage === stageKey) return;
    const preview = { ...project, pipelineStage: stageKey };
    const patchFields = { pipelineStage: stageKey };
    let note = `Moved to ${label}`;
    // Lost / Passed leaves the active board by archiving in the same write.
    if (isLostOrPassedDeal(preview, data.pipelines) || isLostOrPassedColumn(column)) {
      const change = archiveChange(preview, { pipelines: data.pipelines });
      Object.assign(patchFields, change.patch);
      note = change.note;
    }
    updateProject(projectId, patchFields, note);
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
        emptyHint="Drag a deal here"
        renderCard={(p) => (
          <ProjectCard
            project={p}
            onOpen={() => onOpenDetail(p)}
            onRestore={onRestore}
            onArchive={onArchive}
            memberName={memberName}
            companyName={companyName}
          />
        )}
      />
    </div>
  );
}

function hydrateDealsBoardPrefs(userKey, sharedColumnOrder) {
  const saved = readDealsBoardPrefs(userKey);
  // Older boards stored table column order on shared settings — copy once into this user's prefs.
  if (!saved.projectColumnOrder.length && Array.isArray(sharedColumnOrder) && sharedColumnOrder.length) {
    saved.projectColumnOrder = sharedColumnOrder.map(String).filter(Boolean);
  }
  return saved;
}

export default function ProjectsView({ searchQuery, onOpenDetail, onOpenNew }) {
  const { data, patch, update, updateProject, currentUser, memberName, companyName } = useStore();
  const userKey = (currentUser && currentUser.id) || "local";
  const sharedColumnOrder = data.settings && data.settings.projectColumnOrder;
  const bootPrefsRef = useRef(null);
  if (!bootPrefsRef.current) {
    bootPrefsRef.current = hydrateDealsBoardPrefs(userKey, sharedColumnOrder);
  }
  const bootPrefs = bootPrefsRef.current;

  const [typeFilter, setTypeFilter] = useState(bootPrefs.typeFilter);
  const [boardFilter, setBoardFilter] = useState(bootPrefs.boardFilter);
  const [priorityFilter, setPriorityFilter] = useState(bootPrefs.priorityFilter);
  const [viewMode, setViewMode] = useState(bootPrefs.viewMode);
  const [mineOnly, setMineOnly] = useState(bootPrefs.mineOnly);
  const [showArchive, setShowArchive] = useState(bootPrefs.showArchive);
  const [columnOrder, setColumnOrder] = useState(bootPrefs.projectColumnOrder);
  const [prefsUser, setPrefsUser] = useState(userKey);
  const [dealSearch, setDealSearch] = useState("");
  const query = (dealSearch || searchQuery || "").trim();

  // When the signed-in user changes, reload that person's saved layout.
  useEffect(() => {
    if (prefsUser === userKey) return;
    const saved = hydrateDealsBoardPrefs(userKey, sharedColumnOrder);
    setTypeFilter(saved.typeFilter);
    setBoardFilter(saved.boardFilter);
    setPriorityFilter(saved.priorityFilter);
    setViewMode(saved.viewMode);
    setMineOnly(saved.mineOnly);
    setShowArchive(saved.showArchive);
    setColumnOrder(saved.projectColumnOrder);
    setPrefsUser(userKey);
  }, [userKey, prefsUser, sharedColumnOrder]);

  useEffect(() => {
    if (prefsUser !== userKey) return;
    writeDealsBoardPrefs(userKey, {
      viewMode,
      boardFilter,
      typeFilter,
      priorityFilter,
      mineOnly,
      showArchive,
      projectColumnOrder: columnOrder,
    });
  }, [userKey, prefsUser, viewMode, boardFilter, typeFilter, priorityFilter, mineOnly, showArchive, columnOrder]);

  const boardOpts = { pipelines: data.pipelines };
  const liveProjects = useMemo(
    () => data.projects.filter((p) => !isArchivedProject(p)),
    [data.projects]
  );
  const readyToArchive = useMemo(
    () => dealsReadyToArchive(data.projects, boardOpts),
    [data.projects, data.pipelines]
  );
  const archivedCount = data.projects.filter(isArchivedProject).length;
  const boardCounts = useMemo(() => {
    const counts = { active: 0, lost: 0, stalled: 0, all: liveProjects.length };
    liveProjects.forEach((p) => {
      const bucket = dealBoardBucket(p, boardOpts);
      if (counts[bucket] != null) counts[bucket] += 1;
    });
    return counts;
  }, [liveProjects, data.pipelines]);

  const archiveOne = (project) => {
    const change = archiveChange(project, boardOpts);
    updateProject(project.id, change.patch, change.note);
  };

  const restoreOne = (project) => {
    const change = restoreChange();
    updateProject(project.id, change.patch, change.note);
  };

  const archiveReady = () => {
    const n = readyToArchive.length;
    if (!n) return;
    const label = n === 1 ? "1 deal that is stalled or lost / passed" : `${n} deals that are stalled or lost / passed`;
    if (!window.confirm(`Archive ${label}? They leave the board and stay in Archive, where you can restore them.`)) return;
    readyToArchive.forEach(archiveOne);
  };

  const movePipelineStage = (projectId, stageKey) => {
    const project = data.projects.find((p) => p.id === projectId);
    if (!project || project.pipelineStage === stageKey) return;
    const columns = data.pipelines[project.recordType] || [];
    const column = columns.find((c) => c.key === stageKey);
    const label = (column || {}).label || stageKey;
    const preview = { ...project, pipelineStage: stageKey };
    const patchFields = { pipelineStage: stageKey };
    let note = `Moved to ${label}`;
    if (isLostOrPassedDeal(preview, data.pipelines) || isLostOrPassedColumn(column)) {
      const change = archiveChange(preview, boardOpts);
      Object.assign(patchFields, change.patch);
      note = change.note;
    }
    updateProject(projectId, patchFields, note);
  };

  const projects = useMemo(() => {
    let list = data.projects.filter((p) => (showArchive ? isArchivedProject(p) : !isArchivedProject(p)));
    if (!showArchive && boardFilter !== "all") {
      list = list.filter((p) => dealBoardBucket(p, boardOpts) === boardFilter);
    }
    if (typeFilter !== "all") list = list.filter((p) => p.recordType === typeFilter);
    if (priorityFilter !== "all") list = list.filter((p) => (p.priority || "MEDIUM") === priorityFilter);
    if (mineOnly) list = list.filter((p) => isMine(p, currentUser && currentUser.id));
    if (query) {
      const q = query.toLowerCase();
      list = list.filter((p) =>
        p.title.toLowerCase().includes(q) ||
        (p.description || "").toLowerCase().includes(q) ||
        (p.nextStep || "").toLowerCase().includes(q) ||
        (p.budget || "").toLowerCase().includes(q) ||
        (p.studio || "").toLowerCase().includes(q) ||
        companyName(p.companyId).toLowerCase().includes(q) ||
        memberName(p.ownerId).toLowerCase().includes(q) ||
        projectOwnerIds(p).some((id) => memberName(id).toLowerCase().includes(q)) ||
        (p.contactName || "").toLowerCase().includes(q) ||
        (p.contactEmail || "").toLowerCase().includes(q) ||
        (p.contactPhone || "").toLowerCase().includes(q) ||
        listAttachments(p).some((a) => (a.fileName || "").toLowerCase().includes(q)));
    }
    return list;
  }, [data.projects, data.pipelines, typeFilter, boardFilter, priorityFilter, mineOnly, query, currentUser, memberName, companyName, showArchive]);

  const moveToStage = (projectId, stageKey) => {
    const project = data.projects.find((p) => p.id === projectId);
    if (!project || project.stage === stageKey) return;
    updateProject(projectId, { stage: stageKey }, `Moved to ${stageInfo(stageKey).label}`);
  };

  const scopedForCounts = showArchive
    ? data.projects.filter(isArchivedProject)
    : liveProjects.filter((p) => boardFilter === "all" || dealBoardBucket(p, boardOpts) === boardFilter);

  const typeOptions = RECORD_TYPES.map((t) => ({
    key: t.key, label: t.short, color: t.color,
    count: scopedForCounts.filter((p) => p.recordType === t.key).length,
  }));
  const boardFilterOptions = DEAL_BOARD_FILTERS.map((f) => ({
    ...f,
    count: boardCounts[f.key] || 0,
  }));
  const priorityOptions = PRIORITIES.map((key) => ({
    key,
    label: key,
    color: key === "HIGH" ? "var(--red)" : key === "LOW" ? "var(--dim)" : undefined,
    count: scopedForCounts.filter((p) => (p.priority || "MEDIUM") === key).length,
  }));
  const canArchiveCards = !showArchive && (boardFilter === "lost" || boardFilter === "stalled");

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
          <img src={imageSrc(p)} alt="" style={{ width: 34, height: 24, borderRadius: 4, objectFit: "cover", flexShrink: 0 }} />
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
        onCommit={(v) => movePipelineStage(p.id, v)} />
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
  const columns = columnOrder.length
    ? [
        ...columnOrder.map((key) => allColumns.find((c) => c.key === key)).filter(Boolean),
        ...allColumns.filter((c) => !columnOrder.includes(c.key)),
      ]
    : allColumns;
  const shownColumns = showArchive
    ? [...columns, {
      key: "archive",
      label: "ARCHIVE",
      stopClick: true,
      render: (p) => (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Badge label={ARCHIVE_REASON_LABELS[p.archiveReason] || "Archived"} color="var(--dim)" />
          <button className="md-btn md-btn-ghost" style={{ fontSize: 11, padding: "3px 8px" }} onClick={() => restoreOne(p)}>
            <ArchiveRestore size={12} /> Restore
          </button>
        </div>
      ),
    }]
    : columns;

  const reorderTableColumns = (fromKey, toKey) => {
    const order = columns.map((c) => c.key);
    const from = order.indexOf(fromKey);
    const to = order.indexOf(toKey);
    if (from === -1 || to === -1 || from === to) return;
    order.splice(to, 0, order.splice(from, 1)[0]);
    setColumnOrder(order);
  };

  return (
    <div>
      <ViewHeader
        count={projects.length}
        label={showArchive
          ? `ARCHIVED DEAL${projects.length === 1 ? "" : "S"}`
          : `DEAL${projects.length === 1 ? "" : "S"}${mineOnly ? " ASSIGNED TO ME" : ""}`}
      >
        <button className="md-chip" onClick={() => setMineOnly((m) => !m)}
          style={mineOnly ? { background: "var(--accent)", borderColor: "var(--accent)", color: "var(--ink)" } : undefined}>
          <Star size={11} style={{ marginRight: 5, verticalAlign: -1 }} /> My Deals
        </button>
        <button className="md-chip" onClick={() => setShowArchive((on) => !on)}
          style={showArchive ? { background: "var(--accent)", borderColor: "var(--accent)", color: "var(--ink)" } : undefined}>
          <Archive size={11} style={{ marginRight: 5, verticalAlign: -1 }} /> Archive{archivedCount ? ` · ${archivedCount}` : ""}
        </button>
        {!showArchive && readyToArchive.length > 0 && (
          <button className="md-btn" onClick={archiveReady}>
            <Archive size={13} /> Archive {readyToArchive.length} stalled & lost
          </button>
        )}
        <div style={{ display: "flex", background: "var(--panel-raised)", border: "1px solid var(--rule)", borderRadius: 6, padding: 2 }}>
          {modeButton("pipeline", LayoutGrid, "Deal pipeline board")}
          {modeButton("gallery", ImageIcon, "Gallery view")}
          {modeButton("table", TableIcon, "Table view")}
        </div>
        <ExportMenu title="Deals" columns={columns} rows={projects} />
        <button className="md-btn md-btn-primary" onClick={onOpenNew}><Plus size={14} /> New Deal</button>
      </ViewHeader>

      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginBottom: 14,
        padding: "10px 12px",
        border: "1px solid var(--rule)",
        borderRadius: 10,
        background: "var(--panel)",
      }}>
        <Search size={15} color="var(--dim)" style={{ flexShrink: 0 }} />
        <input
          className="md-input"
          style={{ flex: 1, border: "none", background: "transparent", padding: 0, boxShadow: "none" }}
          value={dealSearch}
          onChange={(e) => setDealSearch(e.target.value)}
          placeholder="Search deals by title, company, contact, budget, next step…"
          aria-label="Search deals"
        />
        {dealSearch ? (
          <button type="button" className="md-btn md-btn-ghost" style={{ padding: "4px 6px" }} onClick={() => setDealSearch("")} title="Clear search">
            <X size={14} />
          </button>
        ) : null}
      </div>

      {!showArchive && (
        <div style={{ marginBottom: 12 }}>
          <FilterChips options={boardFilterOptions} value={boardFilter} onChange={setBoardFilter} allLabel={null} />
        </div>
      )}
      <div style={{ marginBottom: 12 }}>
        <FilterChips options={typeOptions} value={typeFilter} onChange={setTypeFilter} allLabel="All Types" />
      </div>
      <div style={{ marginBottom: 18 }}>
        <FilterChips options={priorityOptions} value={priorityFilter} onChange={setPriorityFilter} allLabel="All priorities" />
      </div>

      {projects.length === 0 ? (
        <EmptyState
          title={showArchive
            ? "Nothing in the archive"
            : mineOnly
              ? "Nothing assigned to you yet"
              : boardFilter === "lost"
                ? "No lost or passed deals"
                : boardFilter === "stalled"
                  ? "No stalled deals"
                  : "No deals match this filter"}
          subtitle={showArchive
            ? "Lost, passed, and stalled deals land here. Restoring one puts it back on the board."
            : mineOnly
              ? "Deals where you are the owner or a team member land here."
              : boardFilter === "active"
                ? "Active hides lost and passed deals. Switch filters, clear search, or add a deal."
                : "Change the filters, clear your search, or add a deal."}
        />
      ) : viewMode === "table" ? (
        <DataTable columns={shownColumns} rows={projects} onRowClick={onOpenDetail} onReorderColumns={showArchive ? undefined : reorderTableColumns} hideExport />
      ) : viewMode === "gallery" ? (
        <GalleryGrid
          projects={projects}
          onOpen={onOpenDetail}
          onRestore={showArchive ? restoreOne : undefined}
          onArchive={canArchiveCards ? archiveOne : undefined}
          memberName={memberName}
          companyName={companyName}
        />
      ) : (
        (typeFilter === "all" ? RECORD_TYPES.map((t) => t.key) : [typeFilter])
          .filter((key) => typeFilter !== "all" || projects.some((p) => p.recordType === key))
          .map((key) => (
            <PipelineBoard
              key={key}
              typeKey={key}
              projects={projects}
              showHeading={typeFilter === "all"}
              onOpenDetail={onOpenDetail}
              onRestore={showArchive ? restoreOne : undefined}
              onArchive={canArchiveCards ? archiveOne : undefined}
            />
          ))
      )}
    </div>
  );
}
