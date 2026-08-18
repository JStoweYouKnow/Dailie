export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export const DAY = 86400000;

export function formatDay(ts) {
  const d = new Date(ts);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "TODAY";
  if (d.toDateString() === yest.toDateString()) return "YESTERDAY";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase();
}

export function formatClock(ts) {
  return new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function formatShort(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase();
}

export function formatFull(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

/** "3 days ago" / "in 2 days" — the unit every staleness badge in the app reads from. */
export function relativeDays(ts) {
  if (!ts) return "never";
  const diff = Date.now() - ts;
  const days = Math.round(Math.abs(diff) / DAY);
  if (days === 0) return "today";
  const label = days === 1 ? "1 day" : `${days} days`;
  return diff > 0 ? `${label} ago` : `in ${label}`;
}

export function daysSince(ts) {
  if (!ts) return Infinity;
  return Math.floor((Date.now() - ts) / DAY);
}

export function dateInputValue(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Midday keeps a date-only value on the intended calendar square in every timezone. */
export function tsFromDateInput(value) {
  if (!value) return null;
  const ts = new Date(`${value}T12:00:00`).getTime();
  return Number.isNaN(ts) ? null : ts;
}

export function formatDuration(sec) {
  const total = Math.max(0, Math.round(sec || 0));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function parseMoney(value) {
  const n = parseFloat(String(value == null ? "" : value).replace(/[^0-9.\-]/g, ""));
  return Number.isNaN(n) ? 0 : n;
}

export function formatMoney(value, currency = "USD") {
  const n = typeof value === "number" ? value : parseMoney(value);
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
  } catch (e) {
    return `$${n.toFixed(2)}`;
  }
}

export function emailDomain(address) {
  const at = String(address || "").split("@")[1];
  if (!at) return "";
  return at.trim().toLowerCase().replace(/[>,;\s]+$/, "");
}

const FREE_MAIL = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "hotmail.com", "outlook.com",
  "icloud.com", "me.com", "aol.com", "protonmail.com", "proton.me", "live.com", "msn.com",
]);

export function isFreeMailDomain(domain) {
  return FREE_MAIL.has(String(domain || "").toLowerCase());
}

/** "acme-studios.com" -> "Acme Studios" — good enough to seed a company record from an email. */
export function companyNameFromDomain(domain) {
  const base = String(domain || "").replace(/\.(com|net|org|io|co|tv|film|studio|ai|app|dev)(\.[a-z]{2})?$/i, "");
  return base
    .split(/[.\-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ") || domain || "Unknown";
}

export function parseEmailList(raw) {
  return String(raw || "")
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const angle = entry.match(/^(.*?)<([^>]+)>$/);
      if (angle) return { name: angle[1].replace(/["']/g, "").trim(), email: angle[2].trim().toLowerCase() };
      return { name: "", email: entry.toLowerCase() };
    })
    .filter((e) => e.email.includes("@"));
}

export function initials(name) {
  return String(name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("") || "?";
}

/** Deterministic per-name colour so the same person keeps the same avatar everywhere. */
const AVATAR_COLORS = ["#a7b3a4", "#e8553c", "#5e8c86", "#9b8aa4", "#c9a227", "#7c9473", "#8aa4c4", "#c47a8a"];
export function colorForName(name) {
  const s = String(name || "");
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}
