import { uid, emailDomain, isFreeMailDomain, companyNameFromDomain, parseEmailList, tsFromDateInput, DAY } from "./format";

export const SCHEMA_VERSION = 6;
export const STORAGE_KEY = "dailie-data-v6";
export const LEGACY_KEYS = ["dailie-data-v5", "dailie-data-v4", "dailie-data-v3"];

/**
 * One harmonious set for every categorical colour in the app — stages, record types,
 * statuses, avatars, speakers. Previously these were picked ad hoc per list, which is
 * what made a dense table read as noise. All of them sit in Feelie's sage family
 * except CLAY, which is reserved for things that genuinely need attention.
 */
export const HUE = {
  stone: "#6e7f75",
  sage: "#6f917d",
  teal: "#4f7a72",
  moss: "#7f9468",
  sand: "#b3a07f",
  clay: "#c08d7a",
  plum: "#8d7f96",
  slate: "#7d8fa3",
  faint: "#55635b",
};

export const CATEGORICAL = [HUE.sage, HUE.clay, HUE.teal, HUE.plum, HUE.sand, HUE.slate, HUE.moss, HUE.stone];

/** Production stages — the lifecycle a project moves through once it is real work. */
export const STAGES = [
  { key: "development", label: "Development", color: HUE.stone },
  { key: "packaging", label: "Packaging", color: HUE.sage },
  { key: "preproduction", label: "Pre-Production", color: HUE.teal },
  { key: "production", label: "Production", color: HUE.clay },
  { key: "postproduction", label: "Post-Production", color: HUE.plum },
  { key: "delivered", label: "Delivered", color: HUE.moss },
  { key: "onhold", label: "On Hold", color: HUE.faint },
];

export function stageInfo(key) {
  return STAGES.find((s) => s.key === key) || STAGES[0];
}

/**
 * Service Production, Original IP and Outside IP are tracked on one board but each
 * carries its own pipeline and its own fields, so the type lives on the record and
 * every view filters by it.
 */
export const RECORD_TYPES = [
  { key: "service", label: "Service Production", short: "Service Prod.", color: HUE.teal, description: "Work produced for a client or studio under a service agreement." },
  { key: "original", label: "Original IP", short: "Original IP", color: HUE.clay, description: "IP we own and develop ourselves." },
  { key: "outside", label: "Outside IP", short: "Outside IP", color: HUE.plum, description: "Third-party IP we option, license or co-develop." },
];

export function recordTypeInfo(key) {
  return RECORD_TYPES.find((t) => t.key === key) || RECORD_TYPES[0];
}

/** Default deal pipelines. Columns are editable per type and stored in data.pipelines. */
export const DEFAULT_PIPELINES = {
  service: [
    { key: "inbound", label: "Inbound", color: HUE.stone },
    { key: "pitch", label: "In Pitch", color: HUE.sage },
    { key: "negotiation", label: "In Negotiations", color: HUE.sand },
    { key: "production", label: "Production", color: HUE.clay },
    { key: "delivered", label: "Delivered", color: HUE.moss },
    { key: "lost", label: "Lost / Passed", color: HUE.faint },
  ],
  original: [
    { key: "concept", label: "Concept", color: HUE.stone },
    { key: "development", label: "Development", color: HUE.sage },
    { key: "pitch", label: "In Pitch", color: HUE.teal },
    { key: "negotiation", label: "In Negotiations", color: HUE.sand },
    { key: "production", label: "Production", color: HUE.clay },
    { key: "released", label: "Released", color: HUE.moss },
  ],
  outside: [
    { key: "scouting", label: "Scouting", color: HUE.stone },
    { key: "optioned", label: "Optioned", color: HUE.sage },
    { key: "negotiation", label: "In Negotiations", color: HUE.sand },
    { key: "production", label: "Production", color: HUE.clay },
    { key: "released", label: "Released", color: HUE.moss },
  ],
};

export const COMPANY_TYPES = [
  { key: "client", label: "Client", color: HUE.teal },
  { key: "vendor", label: "Vendor", color: HUE.sand },
  { key: "platform", label: "Platform", color: HUE.plum },
  { key: "ai-tool", label: "AI Tool", color: HUE.slate },
  { key: "studio", label: "Studio", color: HUE.clay },
  { key: "agency", label: "Agency", color: HUE.sage },
  { key: "partner", label: "Partner", color: HUE.moss },
  { key: "prospect", label: "Prospect", color: HUE.stone },
];

export function companyTypeInfo(key) {
  return COMPANY_TYPES.find((t) => t.key === key) || { key: key || "prospect", label: key || "Prospect", color: HUE.stone };
}

export const RELATIONSHIP_STAGES = [
  { key: "new", label: "New" },
  { key: "exploring", label: "Exploring" },
  { key: "in-talks", label: "In Talks" },
  { key: "active", label: "Active" },
  { key: "contracted", label: "Contracted" },
  { key: "dormant", label: "Dormant" },
  { key: "churned", label: "Churned" },
];

export const TASK_STATUSES = [
  { key: "todo", label: "To Do", color: HUE.stone },
  { key: "doing", label: "In Progress", color: HUE.sand },
  { key: "blocked", label: "Blocked", color: HUE.clay },
  { key: "done", label: "Done", color: HUE.moss },
];

export const PRIORITIES = ["HIGH", "MEDIUM", "LOW"];

/**
 * The roster: staff, freelancers and artists you are courting. Distinct from
 * `team` (the accounts tasks get assigned to) — someone can sit on the roster for
 * months before you sign them, and only then become assignable.
 */
export const TALENT_STATUSES = [
  { key: "prospect", label: "Prospect", color: HUE.stone },
  { key: "in-talks", label: "In Talks", color: HUE.sage },
  { key: "offer-out", label: "Offer Out", color: HUE.sand },
  { key: "signed", label: "Signed", color: HUE.moss },
  { key: "passed", label: "Passed", color: HUE.faint },
  { key: "alumni", label: "Past Collaborator", color: HUE.plum },
];

export const RATE_UNITS = [
  { key: "day", label: "per day" },
  { key: "week", label: "per week" },
  { key: "hour", label: "per hour" },
  { key: "project", label: "per project" },
  { key: "episode", label: "per episode" },
];

export const DISCIPLINES = [
  "Director", "Producer", "Writer", "Director of Photography", "Editor",
  "Production Designer", "Composer", "VFX Artist", "Colourist", "Sound Designer",
  "Animator", "Illustrator", "Gaffer", "1st AD", "Casting Director",
];

/** Events we host or speak at. */
export const EVENT_KINDS = [
  { key: "hosting", label: "We're Hosting", color: HUE.clay },
  { key: "keynote", label: "Keynote", color: HUE.sage },
  { key: "panel", label: "Panel", color: HUE.teal },
  { key: "demo", label: "Demo", color: HUE.slate },
  { key: "pitch", label: "Pitch", color: HUE.sand },
  { key: "attending", label: "Attending", color: HUE.stone },
];

export const EVENT_STATUSES = [
  { key: "invited", label: "Invited", color: HUE.stone },
  { key: "submitted", label: "Submitted", color: HUE.sand },
  { key: "confirmed", label: "Confirmed", color: HUE.sage },
  { key: "done", label: "Done", color: HUE.moss },
  { key: "declined", label: "Declined", color: HUE.faint },
];

/** Press: outlets we talk to, and the coverage that comes out of it. */
export const PRESS_KINDS = [
  { key: "outlet", label: "Outlet / Journalist", color: HUE.teal },
  { key: "article", label: "Article", color: HUE.sage },
  { key: "interview", label: "Interview", color: HUE.slate },
  { key: "release", label: "Press Release", color: HUE.sand },
  { key: "kit", label: "Press Kit", color: HUE.plum },
];

export const PRESS_STATUSES = [
  { key: "pitching", label: "Pitching", color: HUE.stone },
  { key: "in-talks", label: "In Talks", color: HUE.sand },
  { key: "scheduled", label: "Scheduled", color: HUE.teal },
  { key: "published", label: "Published", color: HUE.moss },
  { key: "passed", label: "Passed", color: HUE.faint },
];

/** Legal: the people we call when something needs a lawyer. */
export const LEGAL_KINDS = [
  { key: "attorney", label: "Attorney", color: HUE.teal },
  { key: "firm", label: "Firm", color: HUE.sage },
  { key: "counsel", label: "In-House Counsel", color: HUE.slate },
  { key: "agent", label: "Agent / Business Affairs", color: HUE.sand },
];

export const LEGAL_SPECIALTIES = [
  "Production Legal", "IP & Copyright", "Contracts", "Employment",
  "Corporate", "Litigation", "Immigration / Visas", "Music Clearance",
];

export const CONTRACT_KINDS = [
  { key: "nda", label: "NDA" },
  { key: "deal", label: "Deal Contract" },
  { key: "vendor", label: "Vendor Contract" },
  { key: "other", label: "Other Agreement" },
];

export const CONTRACT_STATUSES = [
  { key: "draft", label: "Draft", color: HUE.stone },
  { key: "sent", label: "Sent for Signature", color: HUE.sand },
  { key: "open", label: "Open / Unsigned", color: HUE.clay },
  { key: "signed", label: "Signed", color: HUE.moss },
  { key: "expired", label: "Expired", color: HUE.faint },
];

export const PAYMENT_STATUSES = [
  { key: "unpaid", label: "Not Paid", color: HUE.clay },
  { key: "partial", label: "Partially Paid", color: HUE.sand },
  { key: "paid", label: "Paid", color: HUE.moss },
  { key: "na", label: "N/A", color: HUE.faint },
];

export const INVOICE_STATUSES = [
  { key: "draft", label: "Draft", color: HUE.stone },
  { key: "sent", label: "Sent", color: HUE.sage },
  { key: "partial", label: "Partially Paid", color: HUE.sand },
  { key: "paid", label: "Paid", color: HUE.moss },
  { key: "overdue", label: "Overdue", color: HUE.clay },
];

export function lookupLabel(list, key, fallback = "—") {
  const hit = list.find((x) => x.key === key);
  return hit ? hit.label : (key || fallback);
}

export function lookupColor(list, key, fallback = HUE.stone) {
  const hit = list.find((x) => x.key === key);
  return hit ? hit.color || fallback : fallback;
}

/* ------------------------------------------------------------------ *
 * Seed data
 * ------------------------------------------------------------------ */

const now = Date.now();

const TEAM = [
  { id: "u-1", name: "Elena Rostova", email: "elena@matriarch-studios.com", role: "Executive Producer" },
  { id: "u-2", name: "Marcus Vance", email: "marcus@matriarch-studios.com", role: "Head of Production" },
  { id: "u-3", name: "Sarah Chen", email: "sarah@matriarch-studios.com", role: "Head of Development" },
];

export const SEED_DATA = {
  version: SCHEMA_VERSION,
  team: TEAM,
  settings: {
    currentUserId: "u-1",
    followUpDays: 14,
    autoArmRecording: true,
    emailAccounts: [{ id: "acct-1", address: "elena@matriarch-studios.com", label: "Elena — Matriarch" }],
    calendarFeeds: [],
  },
  pipelines: DEFAULT_PIPELINES,
  companies: [
    { id: "co-1", name: "A24", domain: "a24films.com", type: "studio", relationship: "in-talks", ownerId: "u-1", website: "https://a24films.com", notes: "Distribution partner on The Obsidian Echo.", tags: ["distribution"], createdAt: now - 40 * DAY },
    { id: "co-2", name: "National Geographic", domain: "natgeo.com", type: "client", relationship: "contracted", ownerId: "u-2", website: "https://nationalgeographic.com", notes: "Commissioning Wilderness Tide.", tags: ["doc"], createdAt: now - 60 * DAY },
    { id: "co-3", name: "Netflix", domain: "netflix.com", type: "platform", relationship: "exploring", ownerId: "u-3", website: "https://netflix.com", notes: "Neon Horizon pitch in progress.", tags: [], createdAt: now - 20 * DAY },
    { id: "co-4", name: "Runway", domain: "runwayml.com", type: "ai-tool", relationship: "active", ownerId: "u-3", website: "https://runwayml.com", notes: "Enterprise seats for previz. Renewal in Q4.", tags: ["previz"], createdAt: now - 90 * DAY },
    { id: "co-5", name: "Harbour Post", domain: "harbourpost.com", type: "vendor", relationship: "contracted", ownerId: "u-2", website: "", notes: "Colour and finishing house.", tags: ["post"], createdAt: now - 120 * DAY },
  ],
  people: [
    { id: "c-1", name: "Elena Rostova", role: "Executive Producer", companyId: null, organization: "Matriarch Studios", email: "elena@matriarch-studios.com", phone: "+1 (310) 555-0192", projectIds: ["proj-1"], status: "Active", ownerId: "u-1" },
    { id: "c-2", name: "Marcus Vance", role: "Director of Photography", companyId: null, organization: "Oceanic Films", email: "marcus@oceanicfilms.com", phone: "+1 (415) 555-0144", projectIds: ["proj-2"], status: "Active", ownerId: "u-2" },
    { id: "c-3", name: "Sarah Chen", role: "Head of Scripted Development", companyId: null, organization: "Matriarch Studios", email: "sarah@matriarch-studios.com", phone: "+1 (310) 555-0188", projectIds: ["proj-3"], status: "Active", ownerId: "u-3" },
    { id: "c-4", name: "David Sterling", role: "VP Distribution", companyId: "co-1", organization: "A24", email: "d.sterling@a24films.com", phone: "+1 (212) 555-0130", projectIds: ["proj-1"], status: "Prospect", ownerId: "u-1" },
  ],
  projects: [
    {
      id: "proj-1", title: "The Obsidian Echo", recordType: "original",
      description: "Sci-fi psychological thriller centered around deep sea sonic research.",
      stage: "packaging", pipelineStage: "pitch", ownerId: "u-1", teamIds: ["u-3"],
      imageUrl: "", companyId: "co-1", budget: "$14.5M", priority: "HIGH", studio: "A24 / Matriarch",
      nextStep: "Finalize lead attachment deal memo with agent", paymentStatus: "unpaid",
      startDate: now + 40 * DAY, createdAt: now - 14 * DAY, updatedAt: now - 2 * 3600000,
      history: [
        { id: "h1", date: now - 14 * DAY, note: "Added to the board — Development" },
        { id: "h2", date: now - 8 * DAY, note: "Script revision 3 completed by writer room" },
        { id: "h3", date: now - 2 * 3600000, note: "Moved to Packaging — Sent offer to lead actor" },
      ],
    },
    {
      id: "proj-2", title: "Wilderness Tide", recordType: "service",
      description: "Feature documentary exploring wildlife migration along Pacific coastlines.",
      stage: "production", pipelineStage: "production", ownerId: "u-2", teamIds: ["u-1"],
      imageUrl: "", companyId: "co-2", budget: "$4.2M", priority: "MEDIUM", studio: "National Geographic",
      nextStep: "Commence principal photography unit B in Alaska", paymentStatus: "partial",
      startDate: now - 5 * DAY, createdAt: now - 30 * DAY, updatedAt: now - 1 * DAY,
      history: [
        { id: "h4", date: now - 30 * DAY, note: "Added to the board — Pre-Production" },
        { id: "h5", date: now - 10 * DAY, note: "Permits approved for national park drone shoots" },
        { id: "h6", date: now - 1 * DAY, note: "Moved to Production — Day 1 camera roll underway" },
      ],
    },
    {
      id: "proj-3", title: "Neon Horizon", recordType: "original",
      description: "Limited 6-episode cyberpunk noir drama for streaming.",
      stage: "development", pipelineStage: "development", ownerId: "u-3", teamIds: [],
      imageUrl: "", companyId: "co-3", budget: "$28.0M", priority: "HIGH", studio: "Netflix / Matriarch",
      nextStep: "Schedule pitch meeting with studio executive", paymentStatus: "na",
      createdAt: now - 5 * DAY, updatedAt: now - 5 * DAY,
      history: [{ id: "h7", date: now - 5 * DAY, note: "Added to the board — Development" }],
    },
  ],
  tasks: [
    { id: "t-1", title: "Send updated budget breakdown for Obsidian Echo", status: "todo", assigneeIds: ["u-1"], dueDate: now + DAY, priority: "HIGH", projectId: "proj-1", meetingId: "meet-1", source: "meeting", createdAt: now - DAY, createdBy: "u-1", comments: [] },
    { id: "t-2", title: "Confirm Sundance submission deadline dates", status: "done", assigneeIds: ["u-2"], dueDate: now + 3 * DAY, priority: "MEDIUM", projectId: "proj-2", meetingId: "meet-1", source: "meeting", createdAt: now - DAY, completedAt: now - 3600000, createdBy: "u-1", comments: [] },
  ],
  notes: [
    { id: "n-1", title: "Obsidian Echo — casting shortlist", body: "Three names cleared by the agency. Keep the offer window open until the end of the month.", authorId: "u-1", projectId: "proj-1", createdAt: now - 2 * DAY, updatedAt: now - 2 * DAY, collaboratorIds: ["u-3"], comments: [] },
  ],
  meetings: [
    {
      id: "meet-1", title: "Q3 Slate Review with Distribution Partners", date: now - DAY,
      attendees: "Elena R., Marcus V., Studio Rep (Warner/A24)",
      notes: "Discussed festival release strategy for Wilderness Tide and presales for Obsidian Echo. Positive feedback on initial script pass.",
      projectId: "proj-1", followUps: [],
    },
  ],
  calls: [],
  emails: [
    { id: "e-1", direction: "out", account: "elena@matriarch-studios.com", from: "elena@matriarch-studios.com", to: ["d.sterling@a24films.com"], subject: "The Obsidian Echo — Deal Memo & Script Rev 3", body: "", projectId: "proj-1", personId: "c-4", companyId: "co-1", sentAt: now - 5 * 3600000, status: "Opened (3x)", openCount: 3, lastOpened: now - 30 * 60000 },
    { id: "e-2", direction: "out", account: "elena@matriarch-studios.com", from: "elena@matriarch-studios.com", to: ["licensing@natgeo.com"], subject: "Wilderness Tide — Unit B Photography Clearance", body: "", projectId: "proj-2", personId: null, companyId: "co-2", sentAt: now - 24 * 3600000, status: "Clicked Link", openCount: 2, lastOpened: now - 4 * 3600000 },
  ],
  contracts: [
    { id: "ct-1", kind: "nda", title: "A24 — Mutual NDA", companyId: "co-1", projectId: "proj-1", status: "signed", signedAt: now - 30 * DAY, expiresAt: now + 335 * DAY, ownerId: "u-1", fileName: "", filePath: "", fileUrl: "", notes: "Mutual, 2-year term.", createdAt: now - 30 * DAY },
    { id: "ct-3", kind: "nda", title: "Ines Okafor — Crew NDA", companyId: null, talentId: "tal-1", projectId: "proj-2", status: "signed", signedAt: now - 60 * DAY, expiresAt: now + 305 * DAY, ownerId: "u-2", fileName: "", filePath: "", fileUrl: "", notes: "", createdAt: now - 60 * DAY },
    { id: "ct-2", kind: "vendor", title: "Harbour Post — Finishing Agreement", companyId: "co-5", projectId: "proj-2", status: "open", ownerId: "u-2", value: "$180,000", fileName: "", filePath: "", fileUrl: "", notes: "Awaiting counter-signature.", createdAt: now - 6 * DAY },
  ],
  invoices: [
    { id: "inv-1", number: "MAT-2041", direction: "incoming", companyId: "co-2", projectId: "proj-2", amount: 850000, currency: "USD", issuedAt: now - 20 * DAY, dueAt: now - 5 * DAY, status: "overdue", notes: "Milestone 2 — start of principal photography.", createdAt: now - 20 * DAY },
    { id: "inv-2", number: "HP-8891", direction: "outgoing", companyId: "co-5", projectId: "proj-2", amount: 60000, currency: "USD", issuedAt: now - 8 * DAY, dueAt: now + 7 * DAY, status: "sent", notes: "Colour pass 1.", createdAt: now - 8 * DAY },
  ],
  payments: [
    { id: "pay-1", companyId: "co-5", projectId: "proj-2", invoiceId: "inv-2", amount: 60000, currency: "USD", dueAt: now + 7 * DAY, status: "unpaid", method: "Wire", notes: "Colour pass 1 — release on delivery of graded reels.", createdAt: now - 8 * DAY },
  ],
  talent: [
    {
      id: "tal-1", name: "Ines Okafor", discipline: "Director of Photography", status: "signed",
      email: "ines@okaforcine.com", phone: "+1 (323) 555-0117", agent: "WME — Dana Liu", location: "Los Angeles",
      reel: "https://vimeo.com/inesokafor", rateAmount: "1450", rateUnit: "day", currency: "USD",
      ndaContractId: "ct-3", teamMemberId: null, ownerId: "u-2", tags: ["doc", "handheld"],
      notes: "Shot two features with Marcus. Prefers 6-week blocks.",
      assignments: [
        { id: "as-1", projectId: "proj-2", role: "DP — Unit B", startDate: now - 3 * DAY, endDate: now + 24 * DAY, allocation: 100, notes: "Alaska block" },
      ],
      createdAt: now - 70 * DAY,
    },
    {
      id: "tal-2", name: "Ravi Chandrasekar", discipline: "VFX Artist", status: "in-talks",
      email: "ravi@pixelforge.studio", phone: "", agent: "", location: "Remote — Bangalore",
      reel: "https://pixelforge.studio/reel", rateAmount: "820", rateUnit: "day", currency: "USD",
      ndaContractId: null, teamMemberId: null, ownerId: "u-3", tags: ["previz", "comp"],
      notes: "Wants a 3-week trial before committing to Neon Horizon.",
      assignments: [],
      createdAt: now - 12 * DAY,
    },
    {
      id: "tal-3", name: "Marta Lindqvist", discipline: "Editor", status: "prospect",
      email: "marta@cutroom.se", phone: "", agent: "Salt Agency", location: "Stockholm",
      reel: "", rateAmount: "6200", rateUnit: "week", currency: "USD",
      ndaContractId: null, teamMemberId: null, ownerId: "u-1", tags: ["scripted"],
      notes: "Recommended by Elena. Free from October.",
      assignments: [
        { id: "as-2", projectId: "proj-1", role: "Editor — assembly", startDate: now + 45 * DAY, endDate: now + 90 * DAY, allocation: 50, notes: "Tentative" },
      ],
      createdAt: now - 4 * DAY,
    },
  ],
  logs: [],
};

/* ------------------------------------------------------------------ *
 * Migration — every older shape is lifted into the v6 model on load.
 * ------------------------------------------------------------------ */

function ensureArray(v) {
  return Array.isArray(v) ? v : [];
}

function teamMemberIdByName(team, name) {
  if (!name) return null;
  const clean = String(name).trim().toLowerCase();
  const hit = team.find((m) => m.name.toLowerCase() === clean || (m.email && m.email.toLowerCase() === clean));
  return hit ? hit.id : null;
}

/**
 * Old boards stored owners as free text. Rather than lose them, every distinct owner
 * name becomes a team member so it can be assigned, filtered and counted like the rest.
 */
function buildTeam(raw) {
  const team = ensureArray(raw.team).map((m) => ({ ...m, id: m.id || uid() }));
  const seen = new Set(team.map((m) => m.name.toLowerCase()));
  const addName = (name, email) => {
    const clean = String(name || "").trim();
    if (!clean || clean.length > 60 || seen.has(clean.toLowerCase())) return;
    if (/^(unassigned|ai assistant|producer|imported file|unnamed)$/i.test(clean)) return;
    seen.add(clean.toLowerCase());
    team.push({ id: uid(), name: clean, email: email || "", role: "" });
  };
  ensureArray(raw.projects).forEach((p) => addName(p.owner));
  ensureArray(raw.meetings).forEach((m) => ensureArray(m.followUps).forEach((f) => addName(f.owner)));
  if (!team.length) return TEAM.map((m) => ({ ...m }));
  return team;
}

function migrateCompanies(raw, team) {
  const companies = ensureArray(raw.companies).map((c) => ({
    tags: [], notes: "", website: "", relationship: "new", type: "prospect", ...c,
    id: c.id || uid(),
    createdAt: c.createdAt || Date.now(),
  }));
  const byDomain = new Map(companies.filter((c) => c.domain).map((c) => [c.domain.toLowerCase(), c]));
  const byName = new Map(companies.map((c) => [c.name.toLowerCase(), c]));

  const ensureCompany = (name, domain, type) => {
    const key = (domain || "").toLowerCase();
    if (key && byDomain.has(key)) return byDomain.get(key);
    const nameKey = String(name || "").toLowerCase();
    if (nameKey && byName.has(nameKey)) return byName.get(nameKey);
    const company = {
      id: uid(),
      name: name || companyNameFromDomain(domain),
      domain: domain || "",
      type: type || "prospect",
      relationship: "new",
      ownerId: team[0] ? team[0].id : null,
      website: domain ? `https://${domain}` : "",
      notes: "",
      tags: [],
      createdAt: Date.now(),
    };
    companies.push(company);
    if (key) byDomain.set(key, company);
    if (company.name) byName.set(company.name.toLowerCase(), company);
    return company;
  };

  // Contacts and tracked emails from older boards are the only company signal there was.
  ensureArray(raw.contacts).forEach((c) => {
    const domain = emailDomain(c.email);
    if (c.organization) ensureCompany(c.organization, isFreeMailDomain(domain) ? "" : domain, "prospect");
  });
  ensureArray(raw.trackedEmails).forEach((e) => {
    const domain = emailDomain(e.recipient);
    if (domain && !isFreeMailDomain(domain)) ensureCompany(companyNameFromDomain(domain), domain, "prospect");
  });

  return { companies, ensureCompany };
}

function migratePeople(raw, companies, team) {
  const source = ensureArray(raw.people).length ? raw.people : ensureArray(raw.contacts);
  return source.map((c) => {
    const domain = emailDomain(c.email);
    const company =
      companies.find((co) => co.id === c.companyId) ||
      companies.find((co) => co.domain && domain && co.domain.toLowerCase() === domain) ||
      companies.find((co) => c.organization && co.name.toLowerCase() === String(c.organization).toLowerCase());
    return {
      status: "Active",
      phone: "",
      role: "",
      notes: "",
      ...c,
      id: c.id || uid(),
      companyId: company ? company.id : null,
      organization: c.organization || (company ? company.name : ""),
      projectIds: ensureArray(c.projectIds),
      ownerId: c.ownerId || teamMemberIdByName(team, c.owner) || (team[0] ? team[0].id : null),
    };
  });
}

function migrateProjects(raw, team, companies) {
  return ensureArray(raw.projects).map((p) => {
    const ownerId = p.ownerId || teamMemberIdByName(team, p.owner);
    const company =
      companies.find((c) => c.id === p.companyId) ||
      (p.studio ? companies.find((c) => p.studio.toLowerCase().includes(c.name.toLowerCase())) : null);
    const recordType = p.recordType || "service";
    const pipeline = DEFAULT_PIPELINES[recordType] || DEFAULT_PIPELINES.service;
    return {
      description: "", budget: "", priority: "MEDIUM", studio: "", nextStep: "", imageUrl: "",
      paymentStatus: "na", tags: [],
      ...p,
      id: p.id || uid(),
      recordType,
      ownerId: ownerId || (team[0] ? team[0].id : null),
      teamIds: ensureArray(p.teamIds),
      companyId: company ? company.id : null,
      pipelineStage: p.pipelineStage || pipeline[0].key,
      stage: p.stage || "development",
      createdAt: p.createdAt || Date.now(),
      updatedAt: p.updatedAt || Date.now(),
      history: ensureArray(p.history),
    };
  });
}

/**
 * Follow-ups used to live inside meetings and inside call summaries, so the same action
 * item could not be seen from a person's page or assigned to anyone. They become tasks.
 */
function migrateTasks(raw, team, projects) {
  const tasks = ensureArray(raw.tasks).map((t) => ({
    status: "todo", priority: "MEDIUM", comments: [], source: "manual", ...t,
    id: t.id || uid(),
    assigneeIds: ensureArray(t.assigneeIds),
    createdAt: t.createdAt || Date.now(),
  }));
  if (ensureArray(raw.tasks).length) return tasks;

  ensureArray(raw.meetings).forEach((m) => {
    const project = projects.find((p) => p.id === m.projectId);
    ensureArray(m.followUps).forEach((f) => {
      if (!f.text) return;
      const assignee = teamMemberIdByName(team, f.owner);
      tasks.push({
        id: f.id || uid(),
        title: f.text,
        notes: "",
        status: f.done ? "done" : "todo",
        assigneeIds: assignee ? [assignee] : [],
        assigneeLabel: assignee ? "" : (f.owner || ""),
        dueDate: f.dueDate ? tsFromDateInput(f.dueDate) : null,
        priority: "MEDIUM",
        projectId: project ? project.id : null,
        meetingId: m.id,
        source: "meeting",
        createdAt: m.date || Date.now(),
        completedAt: f.done ? m.date || Date.now() : null,
        comments: [],
      });
    });
  });
  return tasks;
}

function migrateEmails(raw, people, companies) {
  const existing = ensureArray(raw.emails);
  if (existing.length) {
    return existing.map((e) => ({ openCount: 0, direction: "out", ...e, id: e.id || uid(), to: ensureArray(e.to) }));
  }
  return ensureArray(raw.trackedEmails).map((e) => {
    const address = String(e.recipient || "").toLowerCase();
    const person = people.find((p) => (p.email || "").toLowerCase() === address);
    const domain = emailDomain(address);
    const company = companies.find((c) => c.domain && c.domain.toLowerCase() === domain);
    return {
      id: e.id || uid(),
      direction: "out",
      account: "",
      from: "",
      to: [address],
      subject: e.subject || "",
      body: "",
      snippet: "",
      projectTitle: e.project || "",
      personId: person ? person.id : null,
      companyId: company ? company.id : null,
      sentAt: e.sentAt || Date.now(),
      status: e.status || "Sent",
      openCount: e.openCount || 0,
      lastOpened: e.lastOpened || null,
    };
  });
}

export function normalizeData(raw) {
  const input = raw && typeof raw === "object" ? raw : {};
  const team = buildTeam(input);
  const { companies } = migrateCompanies(input, team);
  const people = migratePeople(input, companies, team);
  const projects = migrateProjects(input, team, companies);
  const tasks = migrateTasks(input, team, projects);
  const emails = migrateEmails(input, people, companies);

  const projectByTitle = new Map(projects.map((p) => [p.title.toLowerCase(), p.id]));
  emails.forEach((e) => {
    if (!e.projectId && e.projectTitle) e.projectId = projectByTitle.get(String(e.projectTitle).toLowerCase()) || null;
  });

  const settings = {
    currentUserId: team[0] ? team[0].id : null,
    followUpDays: 14,
    autoArmRecording: true,
    emailAccounts: [],
    calendarFeeds: [],
    ...(input.settings || {}),
  };
  if (!team.some((m) => m.id === settings.currentUserId)) settings.currentUserId = team[0] ? team[0].id : null;

  const pipelines = { ...DEFAULT_PIPELINES, ...(input.pipelines || {}) };
  RECORD_TYPES.forEach((t) => {
    if (!Array.isArray(pipelines[t.key]) || !pipelines[t.key].length) pipelines[t.key] = DEFAULT_PIPELINES[t.key];
  });

  return {
    version: SCHEMA_VERSION,
    team,
    settings,
    pipelines,
    companies,
    people,
    projects,
    tasks,
    notes: ensureArray(input.notes).map((n) => ({ comments: [], collaboratorIds: [], ...n, id: n.id || uid() })),
    meetings: ensureArray(input.meetings).map((m) => ({ followUps: [], ...m, id: m.id || uid() })),
    calls: ensureArray(input.calls).map((c) => ({
      nextSteps: [],
      ...c,
      id: c.id || uid(),
      // Participants used to be one free-text field; give every call the structured
      // list the transcript needs to attribute speakers.
      participants: normalizeParticipants(c.participants),
      segments: ensureArray(c.segments).map((seg) => ({
        start: Number(seg.start) || 0,
        end: Number(seg.end) || 0,
        text: String(seg.text || ""),
        speaker: String(seg.speaker || ""),
      })),
    })),
    emails,
    events: ensureArray(input.events).map((e) => ({
      kind: "panel", status: "invited", name: "", venue: "", location: "",
      projectId: null, companyId: null, notes: "", url: "", cost: "",
      ...e, id: e.id || uid(), speakerIds: ensureArray(e.speakerIds),
    })),
    press: ensureArray(input.press).map((r) => {
      const id = r.id || uid();
      const attachments = ensureArray(r.attachments).filter((a) => a && a.fileName);
      if (!attachments.length && r.fileName) {
        attachments.push({
          id: `${id}-file`,
          fileName: r.fileName,
          filePath: r.filePath || "",
          fileUrl: r.fileUrl || "",
          fileSize: r.fileSize || 0,
          fileType: r.fileType || "",
          uploadedAt: r.uploadedAt || r.createdAt || Date.now(),
        });
      }
      return {
        kind: "outlet", status: "pitching", title: "", outlet: "", journalist: "",
        email: "", url: "", projectId: null, ownerId: null, notes: "",
        publishedAt: null, scheduledFor: null, attachments: [],
        ...r, id, attachments,
      };
    }),
    legal: ensureArray(input.legal).map((l) => ({
      kind: "attorney", name: "", firm: "", specialty: "", email: "", phone: "",
      companyId: null, projectId: null, rate: "", notes: "", preferred: false,
      ...l, id: l.id || uid(),
    })),
    talent: ensureArray(input.talent).map((t) => ({
      ...makeTalent({}),
      ...t,
      id: t.id || uid(),
      assignments: ensureArray(t.assignments).map((a) => ({ ...makeAssignment({}), ...a, id: a.id || uid() })),
      tags: ensureArray(t.tags),
    })),
    contracts: ensureArray(input.contracts).map((c) => ({ status: "draft", kind: "other", talentId: null, ...c, id: c.id || uid() })),
    invoices: ensureArray(input.invoices).map((i) => ({ status: "draft", direction: "incoming", currency: "USD", ...i, id: i.id || uid() })),
    payments: ensureArray(input.payments).map((p) => ({ status: "unpaid", currency: "USD", ...p, id: p.id || uid() })),
    logs: ensureArray(input.logs).filter((l) => l.id !== "log-1"),
  };
}

/* ------------------------------------------------------------------ *
 * Derived reads
 * ------------------------------------------------------------------ */

export function personEmails(person) {
  return [person.email, ...ensureArray(person.altEmails)].filter(Boolean).map((e) => e.toLowerCase());
}

/** Last time anyone on the team exchanged mail with this address set. */
export function lastContactFor(emails, addresses) {
  const set = new Set(addresses.map((a) => String(a).toLowerCase()));
  let latest = null;
  emails.forEach((e) => {
    const parties = [...ensureArray(e.to), e.from].filter(Boolean).map((a) => String(a).toLowerCase());
    if (parties.some((p) => set.has(p))) {
      if (!latest || (e.sentAt || 0) > latest) latest = e.sentAt || 0;
    }
  });
  return latest;
}

/**
 * Everyone we have mail with but have not written to in `followUpDays` — the list the
 * header badge counts and the Emails tab surfaces.
 */
export function staleFollowUps(data) {
  const days = Number(data.settings.followUpDays) || 14;
  const cutoff = Date.now() - days * DAY;
  const items = [];

  data.people.forEach((person) => {
    const addresses = personEmails(person);
    if (!addresses.length) return;
    const last = lastContactFor(data.emails, addresses);
    if (last && last < cutoff) {
      items.push({ kind: "person", id: person.id, name: person.name, subtitle: person.organization || "", lastContactAt: last, personId: person.id, companyId: person.companyId });
    }
  });

  data.companies.forEach((company) => {
    if (!company.domain) return;
    const relevant = data.emails.filter((e) => e.companyId === company.id);
    if (!relevant.length) return;
    const last = relevant.reduce((max, e) => Math.max(max, e.sentAt || 0), 0);
    const coveredByPerson = items.some((i) => i.companyId === company.id);
    if (last && last < cutoff && !coveredByPerson) {
      items.push({ kind: "company", id: company.id, name: company.name, subtitle: companyTypeInfo(company.type).label, lastContactAt: last, companyId: company.id });
    }
  });

  return items.sort((a, b) => (a.lastContactAt || 0) - (b.lastContactAt || 0));
}

/** Contracts and invoices that need eyes on them today. */
export function alertsFor(data) {
  const alerts = [];
  data.contracts.forEach((c) => {
    if (c.status === "sent" || c.status === "open") {
      alerts.push({ id: `ct-${c.id}`, kind: "contract", severity: "warn", text: `${c.title} is still unsigned`, tab: "contracts" });
    }
    if (c.expiresAt && c.expiresAt < Date.now() + 30 * DAY && c.status === "signed") {
      alerts.push({ id: `cte-${c.id}`, kind: "contract", severity: "warn", text: `${c.title} expires soon`, tab: "contracts" });
    }
  });
  data.invoices.forEach((i) => {
    const overdue = i.status !== "paid" && i.dueAt && i.dueAt < Date.now();
    if (overdue) {
      alerts.push({ id: `inv-${i.id}`, kind: "invoice", severity: "high", text: `Invoice ${i.number || i.id} is overdue`, tab: "finance" });
    }
  });
  data.payments.forEach((p) => {
    if (p.status !== "paid" && p.dueAt && p.dueAt < Date.now() + 3 * DAY) {
      alerts.push({ id: `pay-${p.id}`, kind: "payment", severity: "warn", text: `Vendor payment due ${p.dueAt < Date.now() ? "(overdue)" : "soon"}`, tab: "finance" });
    }
  });
  return alerts;
}

/**
 * Rebuilds the company + people directory from whatever mail has been imported.
 * Returns the records to add rather than mutating, so the caller can report a count.
 */
export function deriveDirectoryFromEmails(data) {
  const companies = [...data.companies];
  const people = [...data.people];
  const newCompanies = [];
  const newPeople = [];

  const domainIndex = new Map(companies.filter((c) => c.domain).map((c) => [c.domain.toLowerCase(), c]));
  const emailIndex = new Map(people.filter((p) => p.email).map((p) => [p.email.toLowerCase(), p]));
  const ownAccounts = new Set((data.settings.emailAccounts || []).map((a) => String(a.address).toLowerCase()));
  const ownDomains = new Set([...ownAccounts].map((a) => emailDomain(a)).filter(Boolean));

  data.emails.forEach((email) => {
    const parties = [];
    if (email.from) parties.push({ address: email.from, name: email.fromName || "" });
    ensureArray(email.to).forEach((addr) => parties.push({ address: addr, name: "" }));
    ensureArray(email.participants).forEach((p) => parties.push({ address: p.email || p, name: p.name || "" }));

    parties.forEach(({ address, name }) => {
      const clean = String(address || "").toLowerCase().trim();
      if (!clean.includes("@") || ownAccounts.has(clean)) return;
      const domain = emailDomain(clean);
      if (!domain || ownDomains.has(domain)) return;

      let company = domainIndex.get(domain);
      if (!company && !isFreeMailDomain(domain)) {
        company = {
          id: uid(),
          name: companyNameFromDomain(domain),
          domain,
          type: "prospect",
          relationship: "new",
          ownerId: data.settings.currentUserId,
          website: `https://${domain}`,
          notes: "Created automatically from email traffic.",
          tags: [],
          createdAt: Date.now(),
        };
        domainIndex.set(domain, company);
        companies.push(company);
        newCompanies.push(company);
      }

      if (!emailIndex.has(clean)) {
        const person = {
          id: uid(),
          name: name || clean.split("@")[0].replace(/[._]/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()),
          role: "",
          companyId: company ? company.id : null,
          organization: company ? company.name : "",
          email: clean,
          phone: "",
          projectIds: [],
          status: "Active",
          ownerId: data.settings.currentUserId,
          notes: "Created automatically from email traffic.",
        };
        emailIndex.set(clean, person);
        people.push(person);
        newPeople.push(person);
      }
    });
  });

  // Back-link every email to the person and company it belongs to.
  const emails = data.emails.map((email) => {
    if (email.personId && email.companyId) return email;
    const counterparties = [email.from, ...ensureArray(email.to)]
      .filter(Boolean)
      .map((a) => String(a).toLowerCase())
      .filter((a) => !ownAccounts.has(a));
    for (const address of counterparties) {
      const person = emailIndex.get(address);
      const company = domainIndex.get(emailDomain(address));
      if (person || company) {
        return { ...email, personId: email.personId || (person ? person.id : null), companyId: email.companyId || (company ? company.id : null) };
      }
    }
    return email;
  });

  return { companies, people, emails, newCompanies, newPeople };
}

/* ------------------------------------------------------------------ *
 * Roster availability
 * ------------------------------------------------------------------ */

export function makeTalent(fields) {
  return {
    id: uid(),
    name: "",
    discipline: "",
    status: "prospect",
    email: "",
    phone: "",
    agent: "",
    location: "",
    reel: "",
    rateAmount: "",
    rateUnit: "day",
    currency: "USD",
    ndaContractId: null,
    assignments: [],
    tags: [],
    notes: "",
    ownerId: null,
    teamMemberId: null,
    createdAt: Date.now(),
    ...fields,
  };
}

export function makeAssignment(fields) {
  return {
    id: uid(),
    projectId: null,
    role: "",
    startDate: null,
    endDate: null,
    allocation: 100,
    notes: "",
    ...fields,
  };
}

/** Assignments with a usable date range, earliest first. */
export function bookings(talent) {
  return (talent.assignments || [])
    .filter((a) => a.startDate)
    .map((a) => ({ ...a, endDate: a.endDate || a.startDate }))
    .sort((a, b) => a.startDate - b.startDate);
}

/** Total allocation booked on a given day — over 100 means double-booked. */
export function loadOn(talent, ts) {
  const day = new Date(ts).setHours(12, 0, 0, 0);
  return bookings(talent)
    .filter((a) => day >= new Date(a.startDate).setHours(0, 0, 0, 0) && day <= new Date(a.endDate).setHours(23, 59, 59, 999))
    .reduce((sum, a) => sum + (Number(a.allocation) || 100), 0);
}

export function isBusyOn(talent, ts) {
  return loadOn(talent, ts) >= 100;
}

/** First day from `from` where they are not fully booked. */
export function nextFreeDay(talent, from = Date.now(), horizonDays = 180) {
  for (let i = 0; i < horizonDays; i++) {
    const day = from + i * DAY;
    if (!isBusyOn(talent, day)) return day;
  }
  return null;
}

/** Share of a window that is already booked, 0–1, for the capacity column. */
export function utilisation(talent, from, to) {
  const days = Math.max(1, Math.round((to - from) / DAY));
  let busy = 0;
  for (let i = 0; i < days; i++) {
    if (isBusyOn(talent, from + i * DAY)) busy += 1;
  }
  return busy / days;
}

export function ndaFor(data, talent) {
  if (!talent) return null;
  if (talent.ndaContractId) {
    const hit = data.contracts.find((c) => c.id === talent.ndaContractId);
    if (hit) return hit;
  }
  return data.contracts.find((c) => c.kind === "nda" && c.talentId === talent.id) || null;
}

/* ------------------------------------------------------------------ *
 * Calls
 * ------------------------------------------------------------------ */

export function makeParticipant(fields = {}) {
  return { id: uid(), name: "", email: "", personId: null, teamMemberId: null, ...fields };
}

/** Accepts the old comma-separated string as well as the structured list. */
export function normalizeParticipants(value) {
  if (Array.isArray(value)) {
    return value
      .map((p) => (typeof p === "string" ? makeParticipant({ name: p.trim() }) : makeParticipant(p)))
      .filter((p) => p.name || p.email);
  }
  if (typeof value === "string" && value.trim()) {
    return value
      .split(/[,;]/)
      .map((chunk) => chunk.trim())
      .filter(Boolean)
      .map((chunk) => {
        // "Elena Rostova (elena@x.com)" and "Elena <elena@x.com>" both appear in synced data.
        const paren = chunk.match(/^(.*?)[\(<]\s*([^\s)>]+@[^\s)>]+)\s*[\)>]$/);
        if (paren) return makeParticipant({ name: paren[1].trim(), email: paren[2].toLowerCase() });
        if (chunk.includes("@")) return makeParticipant({ name: chunk.split("@")[0], email: chunk.toLowerCase() });
        return makeParticipant({ name: chunk });
      });
  }
  return [];
}

export function participantNames(call) {
  return (call.participants || []).map((p) => p.name || p.email).filter(Boolean);
}

/** Stable colour per speaker so the transcript reads like a conversation. */
const SPEAKER_COLORS = CATEGORICAL;
export function speakerColor(name) {
  const s = String(name || "");
  if (!s) return HUE.faint;
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return SPEAKER_COLORS[hash % SPEAKER_COLORS.length];
}

/** Distinct speakers in the order they first talk. */
export function speakersIn(call) {
  const seen = [];
  (call.segments || []).forEach((seg) => {
    if (seg.speaker && !seen.includes(seg.speaker)) seen.push(seg.speaker);
  });
  return seen;
}

/** Share of talking time per speaker, for the "who spoke" bar. */
export function talkTime(call) {
  const totals = {};
  let total = 0;
  (call.segments || []).forEach((seg) => {
    const span = Math.max(0, (seg.end || 0) - (seg.start || 0));
    const who = seg.speaker || "Unattributed";
    totals[who] = (totals[who] || 0) + span;
    total += span;
  });
  if (!total) return [];
  return Object.entries(totals)
    .map(([speaker, seconds]) => ({ speaker, seconds, share: seconds / total }))
    .sort((a, b) => b.seconds - a.seconds);
}

export function makeTask(fields, currentUserId) {
  return {
    id: uid(),
    title: "",
    notes: "",
    status: "todo",
    assigneeIds: [],
    dueDate: null,
    priority: "MEDIUM",
    projectId: null,
    personId: null,
    companyId: null,
    meetingId: null,
    callId: null,
    source: "manual",
    createdAt: Date.now(),
    createdBy: currentUserId || null,
    completedAt: null,
    comments: [],
    ...fields,
  };
}

export { parseEmailList };
