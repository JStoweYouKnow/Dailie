/** Only schemes a click should ever follow. */
const SAFE = /^(https?:|mailto:)/i;

export function safeHref(value) {
  const href = String(value || "").trim();
  return SAFE.test(href) ? href : "";
}
