import { uid, parseEmailList, emailDomain } from "./format";

/**
 * Turns text copied out of Gmail into email records. Gmail has no export button that a
 * browser app can call without OAuth, so the import path is: open the thread (or the
 * whole list view), select all, paste. Three shapes are handled:
 *   - a raw .eml / forwarded message with From:/To:/Subject:/Date: headers
 *   - a copied Gmail conversation (repeated "Name <addr> ... to me" blocks)
 *   - a copied Gmail list view (one line per thread)
 */

function stripHtml(raw) {
  let text = String(raw || "");
  // Must look like real markup — a bare "<name@host>" in a From: header is not HTML.
  if (/<\/?(?:div|p|br|span|a|table|tr|td|tbody|thead|body|html|b|i|u|strong|em|ul|ol|li|h[1-6]|img|font|blockquote)\b[^>]*>/i.test(text)) {
    text = text
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"');
  }
  return text.replace(/ /g, " ").replace(/\r\n/g, "\n");
}

function parseLooseDate(raw) {
  const s = String(raw || "").replace(/\s*\(.*?\)\s*$/, "").trim();
  if (!s) return null;
  const ts = Date.parse(s);
  if (!Number.isNaN(ts)) return ts;

  // Gmail shows "Aug 4" or "10:32 AM" depending on age.
  const monthDay = s.match(/^([A-Z][a-z]{2})\s+(\d{1,2})$/);
  if (monthDay) {
    const guess = Date.parse(`${monthDay[1]} ${monthDay[2]}, ${new Date().getFullYear()}`);
    if (!Number.isNaN(guess)) return guess > Date.now() ? guess - 365 * 86400000 : guess;
  }
  const clock = s.match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (clock) {
    const d = new Date();
    let hour = parseInt(clock[1], 10) % 12;
    if (/pm/i.test(clock[3])) hour += 12;
    d.setHours(hour, parseInt(clock[2], 10), 0, 0);
    return d.getTime();
  }
  return null;
}

function headerBlock(text) {
  const grab = (name) => {
    const m = text.match(new RegExp(`^${name}:\\s*(.+)$`, "im"));
    return m ? m[1].trim() : "";
  };
  return {
    from: grab("From"),
    to: grab("To"),
    cc: grab("Cc"),
    subject: grab("Subject"),
    date: grab("Date") || grab("Sent"),
  };
}

function bodyAfterHeaders(text) {
  const idx = text.search(/^\s*$/m);
  return idx === -1 ? "" : text.slice(idx).trim();
}

/** Header-style message — the most reliable shape. */
function parseHeaderMessage(text, accounts) {
  const h = headerBlock(text);
  if (!h.from && !h.to) return null;

  const from = parseEmailList(h.from)[0];
  const to = parseEmailList([h.to, h.cc].filter(Boolean).join(","));
  if (!from && !to.length) return null;

  const fromAddress = from ? from.email : "";
  const direction = accounts.has(fromAddress) ? "out" : "in";

  return [{
    id: uid(),
    direction,
    account: direction === "out" ? fromAddress : (to.find((t) => accounts.has(t.email)) || {}).email || "",
    from: fromAddress,
    fromName: from ? from.name : "",
    to: to.map((t) => t.email),
    subject: h.subject || "(no subject)",
    body: bodyAfterHeaders(text).slice(0, 4000),
    snippet: bodyAfterHeaders(text).slice(0, 180),
    sentAt: parseLooseDate(h.date) || Date.now(),
    status: direction === "out" ? "Sent" : "Received",
    openCount: 0,
    lastOpened: null,
    threadId: (h.subject || "").replace(/^(re|fwd):\s*/i, "").trim().toLowerCase(),
    personId: null,
    companyId: null,
    projectId: null,
    imported: true,
  }];
}

/**
 * Copied Gmail conversation: each message starts with a sender line that carries an
 * address in angle brackets, followed by a "to <someone>" line.
 */
function parseConversation(text, accounts, subjectHint) {
  const lines = text.split("\n");
  const messages = [];
  let current = null;

  const senderLine = /^\s*([^<>\n]{1,80}?)\s*<([^<>@\s]+@[^<>\s]+)>\s*(.*)$/;

  lines.forEach((line) => {
    const m = line.match(senderLine);
    if (m) {
      if (current) messages.push(current);
      const trailing = m[3] || "";
      current = {
        name: m[1].trim(),
        address: m[2].trim().toLowerCase(),
        date: parseLooseDate(trailing.replace(/^[^A-Za-z0-9]+/, "")),
        to: [],
        body: [],
      };
      return;
    }
    if (!current) return;
    const toLine = line.match(/^\s*to\s+(.+)$/i);
    if (toLine && current.to.length === 0) {
      current.to = parseEmailList(toLine[1]).map((t) => t.email);
      if (!current.to.length) current.to = [toLine[1].trim()];
      return;
    }
    current.body.push(line);
  });
  if (current) messages.push(current);
  if (!messages.length) return null;

  const subject = subjectHint || "(imported conversation)";
  return messages.map((msg) => {
    const direction = accounts.has(msg.address) ? "out" : "in";
    const body = msg.body.join("\n").trim();
    return {
      id: uid(),
      direction,
      account: direction === "out" ? msg.address : "",
      from: msg.address,
      fromName: msg.name,
      to: msg.to.filter((t) => t.includes("@")),
      subject,
      body: body.slice(0, 4000),
      snippet: body.slice(0, 180),
      sentAt: msg.date || Date.now(),
      status: direction === "out" ? "Sent" : "Received",
      openCount: 0,
      lastOpened: null,
      threadId: subject.replace(/^(re|fwd):\s*/i, "").trim().toLowerCase(),
      personId: null,
      companyId: null,
      projectId: null,
      imported: true,
    };
  });
}

/** Gmail list view: "Sender  Subject - snippet  Aug 4" per line. */
function parseListView(text, accounts) {
  const results = [];
  text.split("\n").forEach((raw) => {
    const line = raw.trim();
    if (line.length < 12) return;
    const withAddress = line.match(/([^\s<>]+@[^\s<>,;]+)/);
    if (!withAddress) return;
    const address = withAddress[1].toLowerCase().replace(/[.,;]$/, "");
    const dateMatch = line.match(/([A-Z][a-z]{2}\s+\d{1,2}|\d{1,2}:\d{2}\s*[AP]M)\s*$/i);
    const subject = line
      .replace(withAddress[1], "")
      .replace(dateMatch ? dateMatch[0] : "", "")
      .replace(/\s+-\s+.*$/, "")
      .trim() || "(no subject)";
    const direction = accounts.has(address) ? "out" : "in";
    results.push({
      id: uid(),
      direction,
      account: direction === "out" ? address : "",
      from: direction === "out" ? address : address,
      fromName: "",
      to: direction === "out" ? [] : [],
      subject,
      body: "",
      snippet: line.slice(0, 180),
      sentAt: parseLooseDate(dateMatch ? dateMatch[1] : "") || Date.now(),
      status: direction === "out" ? "Sent" : "Received",
      openCount: 0,
      lastOpened: null,
      threadId: subject.toLowerCase(),
      personId: null,
      companyId: null,
      projectId: null,
      imported: true,
    });
  });
  return results.length ? results : null;
}

export function parseEmailPaste(raw, accountAddresses = []) {
  const text = stripHtml(raw).trim();
  if (!text) return [];
  const accounts = new Set(accountAddresses.map((a) => String(a).toLowerCase()));

  const header = parseHeaderMessage(text, accounts);
  if (header) return header;

  const subjectLine = text.match(/^(.{3,120})$/m);
  const conversation = parseConversation(text, accounts, subjectLine ? subjectLine[1].trim() : "");
  if (conversation && conversation.length) return conversation;

  return parseListView(text, accounts) || [];
}

export function looksLikeEmailPaste(text) {
  const t = String(text || "");
  if (/^From:/im.test(t) && /^(To|Subject|Date):/im.test(t)) return true;
  if (/<[^<>@\s]+@[^<>\s]+>/.test(t) && /^\s*to\s+/im.test(t)) return true;
  return (t.match(/[^\s<>]+@[^\s<>,;]+/g) || []).length >= 2;
}

/** Dedupe on sender + subject + minute, so re-pasting a thread does not double it. */
export function dedupeEmails(existing, incoming) {
  const key = (e) => `${(e.from || "").toLowerCase()}|${(e.subject || "").toLowerCase()}|${Math.floor((e.sentAt || 0) / 60000)}`;
  const seen = new Set(existing.map(key));
  return incoming.filter((e) => {
    const k = key(e);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export { emailDomain };
