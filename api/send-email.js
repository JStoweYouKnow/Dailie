// Outbound mail goes through Resend (Vercel Marketplace: `vercel integration add
// resend/resend-email`). Without the key the client falls back to opening the user's
// own mail client with the approved draft prefilled — nothing is ever sent silently.
const RESEND_ENDPOINT = "https://api.resend.com/emails";

export async function POST(request) {
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

  const to = (Array.isArray(payload.to) ? payload.to : [payload.to]).filter(Boolean);
  const subject = String(payload.subject || "").trim();
  const body = String(payload.body || "").trim();
  const from = String(payload.from || process.env.MAIL_FROM || "").trim();

  if (!to.length) return Response.json({ error: "No recipient." }, { status: 400 });
  if (!subject) return Response.json({ error: "No subject." }, { status: 400 });
  if (!body) return Response.json({ error: "No message body." }, { status: 400 });
  if (!from) return Response.json({ error: "Set MAIL_FROM to a verified sender address." }, { status: 400 });

  let res;
  try {
    res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, text: body, reply_to: payload.replyTo || undefined }),
    });
  } catch (err) {
    return Response.json({ error: "Could not reach the email provider." }, { status: 502 });
  }

  const result = await res.json().catch(() => ({}));
  if (!res.ok) {
    return Response.json({ error: result.message || `The email provider returned ${res.status}.` }, { status: 502 });
  }

  return Response.json({ id: result.id || "", sentAt: Date.now(), to, subject });
}
