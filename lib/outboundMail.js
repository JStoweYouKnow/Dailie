const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MAX_RECIPIENTS = 10;
export const MAX_SUBJECT = 200;
export const MAX_BODY = 20000;

export function isValidEmail(value) {
  const address = String(value || "").trim().toLowerCase();
  if (!address || address.length > 254) return false;
  if (address.includes("\n") || address.includes("\r") || address.includes(",") || address.includes("<")) {
    return false;
  }
  return EMAIL_RE.test(address);
}

/**
 * Recipients from the client. Caps the list, rejects junk, and never trusts a
 * From header — the route always sends as MAIL_FROM.
 */
export function normalizeRecipients(to) {
  const raw = (Array.isArray(to) ? to : [to]).map((item) => String(item || "").trim().toLowerCase()).filter(Boolean);
  const unique = [...new Set(raw)];
  if (!unique.length) return { error: "No recipient." };
  if (unique.length > MAX_RECIPIENTS) {
    return { error: `At most ${MAX_RECIPIENTS} recipients.` };
  }
  for (const address of unique) {
    if (!isValidEmail(address)) return { error: "One of the recipient addresses is not valid." };
  }
  return { recipients: unique };
}

export function normalizeSubject(subject) {
  const value = String(subject || "").trim();
  if (!value) return { error: "No subject." };
  if (value.length > MAX_SUBJECT) return { error: `Subject is limited to ${MAX_SUBJECT} characters.` };
  return { subject: value };
}

export function normalizeBody(body) {
  const value = String(body || "").trim();
  if (!value) return { error: "No message body." };
  if (value.length > MAX_BODY) return { error: `Message is limited to ${MAX_BODY} characters.` };
  return { body: value };
}
