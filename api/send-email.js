import { requireHouseApiAuth } from "../lib/requireApiAuth.js";
import { rateLimit } from "../lib/rateLimit.js";
import { isValidEmail, normalizeBody, normalizeRecipients, normalizeSubject } from "../lib/outboundMail.js";

// Outbound mail goes through Resend (Vercel Marketplace: `vercel integration add
// resend/resend-email`). Without the key the client falls back to opening the user's
// own mail client with the approved draft prefilled — nothing is ever sent silently.
const RESEND_ENDPOINT = "https://api.resend.com/emails";

export async function POST(request) {
  const gate = await requireHouseApiAuth(request);
  if (gate.error) return gate.error;
  const limited = rateLimit({ key: `send-email:${gate.auth.userId}`, limit: 20, windowMs: 60 * 60 * 1000 });
  if (limited.error) return limited.error;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "No email provider is connected. Run `vercel integration add resend/resend-email`, then set MAIL_FROM.", fallback: "mailto" },
      { status: 501 }
    );
  }

  let payload;
  try {
    payload = await request.json();
  } catch (err) {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const to = normalizeRecipients(payload && payload.to);
  if (to.error) return Response.json({ error: to.error }, { status: 400 });
  const subject = normalizeSubject(payload && payload.subject);
  if (subject.error) return Response.json({ error: subject.error }, { status: 400 });
  const body = normalizeBody(payload && payload.body);
  if (body.error) return Response.json({ error: body.error }, { status: 400 });

  const from = String(process.env.MAIL_FROM || "").trim();
  if (!from) return Response.json({ error: "Set MAIL_FROM to a verified sender address." }, { status: 400 });

  // Reply-To is the signed-in studio account. The client cannot pick a different From
  // or Reply-To — those are how this route would be used to spoof the studio.
  const replyTo = isValidEmail(gate.auth.email) ? gate.auth.email : undefined;

  let res;
  try {
    res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: to.recipients,
        subject: subject.subject,
        text: body.body,
        reply_to: replyTo,
      }),
    });
  } catch (err) {
    return Response.json({ error: "Could not reach the email provider." }, { status: 502 });
  }

  const result = await res.json().catch(() => ({}));
  if (!res.ok) {
    return Response.json({ error: result.message || `The email provider returned ${res.status}.` }, { status: 502 });
  }

  return Response.json({ id: result.id || "", sentAt: Date.now(), to: to.recipients, subject: subject.subject });
}
