import { DAY } from "./format.js";

const HUE = {
  teal: "#4f7a72",
  sand: "#b3a07f",
  clay: "#c08d7a",
  slate: "#7d8fa3",
};

/** Recurring dates the studio should watch — not things we are already speaking at. */
export const INDUSTRY_EVENT_KINDS = [
  { key: "festival", label: "Festival", color: HUE.clay },
  { key: "market", label: "Market", color: HUE.teal },
  { key: "tech", label: "Tech & Post", color: HUE.slate },
  { key: "awards", label: "Awards", color: HUE.sand },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * `month` / `day` are a typical start, used to sort the next edition.
 * Exact dates shift every year — Plan for copies the window, not a locked calendar.
 */
export const INDUSTRY_EVENTS = [
  {
    id: "sundance",
    name: "Sundance Film Festival",
    short: "Sundance",
    kind: "festival",
    month: 1,
    day: 22,
    typical: "late January",
    location: "Park City, UT",
    why: "Premiere and sales circuit. Submission deadlines land in the fall.",
    url: "https://festival.sundance.org",
  },
  {
    id: "hpa-retreat",
    name: "HPA Tech Retreat",
    short: "HPA Tech Retreat",
    kind: "tech",
    month: 2,
    day: 16,
    typical: "mid-February",
    location: "Indian Wells, CA",
    why: "Post, finishing and production-technology gathering. The HPA staple.",
    url: "https://www.hpaonline.com",
  },
  {
    id: "spirit-awards",
    name: "Film Independent Spirit Awards",
    short: "Spirit Awards",
    kind: "awards",
    month: 2,
    day: 22,
    typical: "late February",
    location: "Santa Monica, CA",
    why: "Independent feature awards, usually the weekend before the Oscars.",
    url: "https://www.filmindependent.org/spirit-awards",
  },
  {
    id: "berlinale",
    name: "Berlinale / European Film Market",
    short: "Berlinale / EFM",
    kind: "festival",
    month: 2,
    day: 13,
    typical: "mid-February",
    location: "Berlin",
    why: "Competition plus EFM — first major sales market of the year.",
    url: "https://www.berlinale.de",
  },
  {
    id: "oscars",
    name: "Academy Awards",
    short: "Oscars",
    kind: "awards",
    month: 3,
    day: 8,
    typical: "early March",
    location: "Los Angeles",
    why: "Awards night and the campaign calendar that leads up to it.",
    url: "https://www.oscars.org",
  },
  {
    id: "sxsw",
    name: "SXSW",
    short: "SXSW",
    kind: "festival",
    month: 3,
    day: 13,
    typical: "mid-March",
    location: "Austin, TX",
    why: "Film, TV, music and interactive — premieres and a loud industry week.",
    url: "https://www.sxsw.com",
  },
  {
    id: "series-mania",
    name: "Series Mania",
    short: "Series Mania",
    kind: "market",
    month: 3,
    day: 20,
    typical: "late March",
    location: "Lille",
    why: "European series market and festival — buyers, showrunners, commissions.",
    url: "https://seriesmania.com",
  },
  {
    id: "nab",
    name: "NAB Show",
    short: "NAB",
    kind: "tech",
    month: 4,
    day: 18,
    typical: "mid-April",
    location: "Las Vegas",
    why: "Broadcast, camera, LED volumes and the production-tech floor.",
    url: "https://www.nabshow.com",
  },
  {
    id: "cannes",
    name: "Festival de Cannes / Marché du Film",
    short: "Cannes",
    kind: "festival",
    month: 5,
    day: 13,
    typical: "mid-May",
    location: "Cannes",
    why: "The premiere circuit and the Marché — sales, packaging, press.",
    url: "https://www.festival-cannes.com",
  },
  {
    id: "fmx",
    name: "FMX",
    short: "FMX",
    kind: "tech",
    month: 5,
    day: 5,
    typical: "early May",
    location: "Stuttgart",
    why: "Animation, VFX and real-time production conference.",
    url: "https://fmx.de",
  },
  {
    id: "annecy",
    name: "Annecy International Animation Film Festival",
    short: "Annecy",
    kind: "festival",
    month: 6,
    day: 8,
    typical: "early June",
    location: "Annecy",
    why: "Animation and VFX premieres, MIFA market alongside.",
    url: "https://www.annecy.org",
  },
  {
    id: "cine-gear",
    name: "Cine Gear Expo",
    short: "Cine Gear",
    kind: "tech",
    month: 6,
    day: 4,
    typical: "early June",
    location: "Los Angeles",
    why: "Camera, lighting and grip show on the lot — production vendors in one place.",
    url: "https://www.cinegearexpo.com",
  },
  {
    id: "siggraph",
    name: "SIGGRAPH",
    short: "SIGGRAPH",
    kind: "tech",
    month: 7,
    day: 26,
    typical: "late July / early August",
    location: "Rotating host city",
    why: "CG, real-time and the emerging-tech papers that land in pipelines a year later.",
    url: "https://www.siggraph.org",
  },
  {
    id: "venice",
    name: "Venice Film Festival",
    short: "Venice",
    kind: "festival",
    month: 8,
    day: 27,
    typical: "late August / early September",
    location: "Venice",
    why: "Fall premiere circuit — often the first stop before TIFF.",
    url: "https://www.labiennale.org/en/cinema",
  },
  {
    id: "tiff",
    name: "Toronto International Film Festival",
    short: "TIFF",
    kind: "festival",
    month: 9,
    day: 4,
    typical: "early September",
    location: "Toronto",
    why: "North American launch pad and a busy sales / awards week.",
    url: "https://tiff.net",
  },
  {
    id: "ibc",
    name: "IBC",
    short: "IBC",
    kind: "tech",
    month: 9,
    day: 11,
    typical: "mid-September",
    location: "Amsterdam",
    why: "European media-tech show — broadcast, cloud, finishing.",
    url: "https://show.ibc.org",
  },
  {
    id: "emmys",
    name: "Primetime Emmy Awards",
    short: "Emmys",
    kind: "awards",
    month: 9,
    day: 14,
    typical: "mid-September",
    location: "Los Angeles",
    why: "Television awards night and the campaign that runs through summer.",
    url: "https://www.emmys.com",
  },
  {
    id: "nyff",
    name: "New York Film Festival",
    short: "NYFF",
    kind: "festival",
    month: 9,
    day: 26,
    typical: "late September / early October",
    location: "New York",
    why: "Fall festival circuit after Venice and TIFF — press and awards positioning.",
    url: "https://www.filmlinc.org/nyff",
  },
  {
    id: "mipcom",
    name: "MIPCOM",
    short: "MIPCOM",
    kind: "market",
    month: 10,
    day: 13,
    typical: "mid-October",
    location: "Cannes",
    why: "Global TV and streaming content market.",
    url: "https://www.mipcom.com",
  },
  {
    id: "afi-fest",
    name: "AFI Fest",
    short: "AFI Fest",
    kind: "festival",
    month: 10,
    day: 22,
    typical: "late October",
    location: "Los Angeles",
    why: "LA festival dates and Academy-qualifying runs.",
    url: "https://fest.afi.com",
  },
  {
    id: "afm",
    name: "American Film Market",
    short: "AFM",
    kind: "market",
    month: 11,
    day: 4,
    typical: "early November",
    location: "Santa Monica, CA",
    why: "Independent sales, financing and packaging — Santa Monica in November.",
    url: "https://www.americanfilmmarket.com",
  },
  {
    id: "hpa-awards",
    name: "HPA Awards",
    short: "HPA Awards",
    kind: "tech",
    month: 11,
    day: 20,
    typical: "late November",
    location: "Los Angeles",
    why: "Honours finishing, sound, color and restoration — the other HPA date.",
    url: "https://www.hpaonline.com",
  },
  {
    id: "idfa",
    name: "IDFA",
    short: "IDFA",
    kind: "festival",
    month: 11,
    day: 12,
    typical: "mid-November",
    location: "Amsterdam",
    why: "Documentary festival and Forum — the doc market of record.",
    url: "https://www.idfa.nl",
  },
];

/** Next typical start for this staple. Rolls to next year once this edition has passed. */
export function nextIndustryWindow(event, now = Date.now()) {
  const monthIndex = Math.max(0, Math.min(11, (event.month || 1) - 1));
  const day = Math.max(1, Math.min(28, event.day || 15));
  const ref = new Date(now);
  let year = ref.getFullYear();
  let ts = new Date(year, monthIndex, day).getTime();
  const grace = 10 * DAY;
  if (ts + grace < now) {
    year += 1;
    ts = new Date(year, monthIndex, day).getTime();
  }
  return {
    year,
    ts,
    label: `${MONTHS[monthIndex]} ${year}`,
    window: event.typical || MONTHS[monthIndex],
  };
}

export function isIndustryEventSoon(event, now = Date.now(), withinDays = 45) {
  const next = nextIndustryWindow(event, now);
  return next.ts >= now - 5 * DAY && next.ts <= now + withinDays * DAY;
}

export function plannedIndustryEvent(events, stapleId, now = Date.now()) {
  return (events || []).find((e) => (
    e.industryEventId === stapleId
    && e.status !== "declined"
    && e.status !== "done"
    && (!e.date || e.date > now - 14 * DAY)
  )) || null;
}

/** Board record created when someone plans a staple. Date is the typical window, not official. */
export function planIndustryEvent(staple, now = Date.now()) {
  const next = nextIndustryWindow(staple, now);
  const typical = staple.typical ? `Typical window: ${staple.typical}. Confirm this year's dates.` : "Confirm this year's dates.";
  return {
    name: `${staple.short || staple.name} ${next.year}`,
    kind: "attending",
    status: "invited",
    venue: "",
    location: staple.location || "",
    url: staple.url || "",
    date: next.ts,
    notes: [staple.why, typical].filter(Boolean).join("\n"),
    industryEventId: staple.id,
    cost: "",
    projectId: null,
    companyId: null,
    speakerIds: [],
  };
}

export function industryEventsMatching(query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return INDUSTRY_EVENTS.slice();
  return INDUSTRY_EVENTS.filter((e) => (
    e.name.toLowerCase().includes(q)
    || e.short.toLowerCase().includes(q)
    || e.location.toLowerCase().includes(q)
    || e.why.toLowerCase().includes(q)
    || lookupIndustryKind(e.kind).toLowerCase().includes(q)
  ));
}

export function industryEventsUpcoming(now = Date.now(), list = INDUSTRY_EVENTS) {
  return [...list].sort((a, b) => nextIndustryWindow(a, now).ts - nextIndustryWindow(b, now).ts);
}

function lookupIndustryKind(key) {
  const hit = INDUSTRY_EVENT_KINDS.find((k) => k.key === key);
  return hit ? hit.label : key;
}
