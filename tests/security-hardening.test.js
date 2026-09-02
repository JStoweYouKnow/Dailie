import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isHouseEmail,
  lockMailboxSettings,
  lockSharedSettings,
  memberBindPlan,
  redactSettingsForViewer,
  canWriteCollection,
  canReadCollection,
  workspaceAccess,
  pendingClerkId,
  mailboxSyncTargets,
} from "../src/lib/houseAccess.js";
import { safeHref } from "../src/lib/safeUrl.js";
import { fileSrc, imageSrc, asAttachment } from "../src/lib/files.js";
import { blobPathFromUrl, redactRecordBlobUrls, storedInlineUrl } from "../src/lib/blobUrls.js";
import { isSharedCollection } from "../src/lib/sharedBoard.js";
import { isAllowedContentType, isAllowedInlineDataUrl, resolveUploadType } from "../lib/allowedUploads.js";
import { calendarRedirectTarget, isAllowedCalendarHost } from "../lib/calendarProxy.js";
import { rateLimit } from "../lib/rateLimit.js";
import { MAX_RECIPIENTS, normalizeRecipients, normalizeSubject } from "../lib/outboundMail.js";

test("isHouseEmail allows studio domains and subdomains only", () => {
  assert.equal(isHouseEmail("elena@matriarch-studios.com"), true);
  assert.equal(isHouseEmail("ops@thewizardofops.app"), true);
  assert.equal(isHouseEmail("help@mail.matriarch-studios.com"), true);
  assert.equal(isHouseEmail("guest@gmail.com"), false);
  assert.equal(isHouseEmail("not-matriarch-studios.com@evil.test"), false);
  assert.equal(isHouseEmail(""), false);
});

test("lockSharedSettings keeps contractor writes from changing mailboxes and iCal feeds", () => {
  const prior = {
    emailAccounts: [{ id: "acct-1", address: "elena@matriarch-studios.com" }],
    calendarFeeds: [{ id: "feed-1", label: "Ops", url: "https://calendar.google.com/calendar/ical/secret/private-abc/basic.ics" }],
  };
  const locked = lockSharedSettings(
    {
      followUpDays: 21,
      emailAccounts: [{ id: "x", address: "victim@other.com" }],
      calendarFeeds: [{ id: "x", label: "Stolen", url: "https://evil.example/feed" }],
    },
    { isHouse: false, prior }
  );
  assert.equal(locked.followUpDays, 21);
  assert.deepEqual(locked.emailAccounts, prior.emailAccounts);
  assert.deepEqual(locked.calendarFeeds, prior.calendarFeeds);
});

test("redactSettingsForViewer strips iCal URLs for non-house readers", () => {
  const settings = {
    calendarFeeds: [{ id: "feed-1", label: "Ops", url: "https://calendar.google.com/calendar/ical/secret/private-abc/basic.ics" }],
  };
  assert.equal(redactSettingsForViewer(settings, { isHouse: true }).calendarFeeds[0].url, settings.calendarFeeds[0].url);
  assert.equal(redactSettingsForViewer(settings, { isHouse: false }).calendarFeeds[0].url, "");
  assert.equal(redactSettingsForViewer(settings, { isHouse: false }).calendarFeeds[0].label, "Ops");
});

test("memberBindPlan will not rebind a claimed email to a new Clerk id", () => {
  const prior = { _id: "row1", clerkId: "user_old", email: "elena@matriarch-studios.com", name: "Elena" };
  assert.equal(
    memberBindPlan({
      clerkId: "user_new",
      identityEmail: "elena@matriarch-studios.com",
      emailVerified: true,
      byClerk: null,
      byEmail: prior,
      isHouse: true,
    }).action,
    "refuse"
  );
  assert.deepEqual(
    memberBindPlan({
      clerkId: "user_old",
      identityEmail: "elena@matriarch-studios.com",
      emailVerified: true,
      byClerk: prior,
      byEmail: null,
      isHouse: true,
    }),
    { action: "update", target: prior, claimEmail: true }
  );
  assert.equal(
    memberBindPlan({
      clerkId: "user_new",
      identityEmail: "guest@gmail.com",
      emailVerified: false,
      byClerk: null,
      byEmail: { clerkId: "user_other", email: "guest@gmail.com" },
      isHouse: false,
    }).action,
    "refuse"
  );
  assert.equal(
    memberBindPlan({
      clerkId: "user_new",
      identityEmail: "ops@thewizardofops.app",
      emailVerified: true,
      byClerk: null,
      byEmail: { clerkId: pendingClerkId("ops@thewizardofops.app"), email: "ops@thewizardofops.app" },
      isHouse: true,
    }).action,
    "update"
  );
});

test("memberBindPlan refuses unknown non-house sign-ins and allows verified house create", () => {
  assert.deepEqual(
    memberBindPlan({
      clerkId: "user_guest",
      identityEmail: "guest@gmail.com",
      emailVerified: true,
      byClerk: null,
      byEmail: null,
      isHouse: false,
    }),
    { action: "refuse", reason: "This workspace is invite-only." }
  );
  assert.equal(
    memberBindPlan({
      clerkId: "user_house",
      identityEmail: "elena@matriarch-studios.com",
      emailVerified: undefined,
      byClerk: null,
      byEmail: null,
      isHouse: true,
    }).action,
    "refuse"
  );
});

test("workspaceAccess is invite-only except house and existing members", () => {
  assert.equal(workspaceAccess({
    clerkId: "user_x", isHouse: false, emailVerified: true, byClerk: null, byEmail: null,
  }).allow, false);
  assert.equal(workspaceAccess({
    clerkId: "user_x", isHouse: true, emailVerified: true, byClerk: null, byEmail: null,
  }).allow, true);
  assert.equal(workspaceAccess({
    clerkId: "user_x", isHouse: true, emailVerified: undefined, byClerk: null, byEmail: null,
  }).allow, false);
  assert.equal(workspaceAccess({
    clerkId: "user_x", isHouse: true, emailVerified: false, byClerk: null, byEmail: null,
  }).allow, false);
  assert.equal(workspaceAccess({
    clerkId: "user_x", isHouse: false, emailVerified: true, byClerk: { clerkId: "user_x" }, byEmail: null,
  }).allow, true);
  assert.equal(workspaceAccess({
    clerkId: "user_x", isHouse: false, emailVerified: true, byClerk: null,
    byEmail: { clerkId: pendingClerkId("a@b.co"), email: "a@b.co" },
  }).allow, true);
});

test("canWriteCollection keeps finance and legal house-only", () => {
  assert.equal(canWriteCollection("projects", { isHouse: false }), true);
  assert.equal(canWriteCollection("tasks", { isHouse: false }), true);
  assert.equal(canWriteCollection("contracts", { isHouse: false }), false);
  assert.equal(canWriteCollection("invoices", { isHouse: false }), false);
  assert.equal(canWriteCollection("payments", { isHouse: false }), false);
  assert.equal(canWriteCollection("emails", { isHouse: false }), false);
  assert.equal(canWriteCollection("legal", { isHouse: false }), false);
  assert.equal(canWriteCollection("contracts", { isHouse: true }), true);
  assert.equal(canReadCollection("emails", { isHouse: false }), false);
  assert.equal(canReadCollection("projects", { isHouse: false }), true);
  assert.equal(canReadCollection("legal", { isHouse: true }), true);
});

test("lockMailboxSettings keeps contractor writes from changing synced inboxes", () => {
  const prior = [{ id: "acct-1", address: "elena@matriarch-studios.com" }];
  const locked = lockMailboxSettings(
    { followUpDays: 21, emailAccounts: [{ id: "x", address: "victim@other.com" }] },
    { isHouse: false, priorAccounts: prior }
  );
  assert.equal(locked.followUpDays, 21);
  assert.deepEqual(locked.emailAccounts, prior);

  const house = lockMailboxSettings(
    { emailAccounts: [{ id: "x", address: "ops@thewizardofops.app" }] },
    { isHouse: true, priorAccounts: prior }
  );
  assert.equal(house.emailAccounts[0].address, "ops@thewizardofops.app");
});

test("safeHref allows http(s) and mailto only", () => {
  assert.equal(safeHref("https://meet.google.com/abc-defg-hij"), "https://meet.google.com/abc-defg-hij");
  assert.equal(safeHref("http://localhost:3000/ok"), "http://localhost:3000/ok");
  assert.equal(safeHref("mailto:ops@thewizardofops.app"), "mailto:ops@thewizardofops.app");
  assert.equal(safeHref("javascript:alert(1)"), "");
  assert.equal(safeHref("data:text/html,<script>alert(1)</script>"), "");
  assert.equal(safeHref(""), "");
});

test("fileSrc prefers the authenticated proxy over a public blob URL", () => {
  const src = fileSrc({
    filePath: "documents/nda.pdf",
    fileUrl: "https://abc.public.blob.vercel-storage.com/documents/nda.pdf",
  });
  assert.equal(src, "/api/files?path=documents%2Fnda.pdf");
  assert.equal(
    fileSrc({ fileUrl: "https://abc.public.blob.vercel-storage.com/documents/nda.pdf" }),
    "/api/files?path=documents%2Fnda.pdf"
  );
  assert.equal(fileSrc({ fileUrl: "https://evil.example/x.pdf" }), "");
  assert.equal(fileSrc({ fileUrl: "javascript:alert(1)" }), "");
  assert.equal(fileSrc({ fileUrl: "data:text/html,<script>alert(1)</script>" }), "");
  assert.equal(fileSrc({ fileUrl: "data:image/svg+xml,<svg></svg>" }), "");
  assert.match(fileSrc({ fileUrl: "data:application/pdf;base64,AAAA" }), /^data:/);
});

test("imageSrc prefers the stored path and never uses a public blob URL", () => {
  assert.equal(
    imageSrc({ imagePath: "images/still.jpg", imageUrl: "https://evil.example/x" }),
    "/api/files?path=images%2Fstill.jpg"
  );
  assert.equal(
    imageSrc({ imageUrl: "https://abc.public.blob.vercel-storage.com/images/still.jpg" }),
    "/api/files?path=images%2Fstill.jpg"
  );
  assert.equal(imageSrc({ imageUrl: "javascript:alert(1)" }), "");
  assert.equal(imageSrc({ imageUrl: "https://cdn.example/still.jpg" }), "https://cdn.example/still.jpg");
  assert.equal(imageSrc({ imageUrl: 'https://cdn.example/a.jpg");opacity:0;/*' }), "");
  assert.equal(imageSrc({ imageUrl: "data:text/html,<script>alert(1)</script>" }), "");
  assert.match(imageSrc({ imageUrl: "data:image/png;base64,iVBORw0KGgo=" }), /^data:image\/png/);
});

test("asAttachment and redactRecordBlobUrls drop durable public blob URLs", () => {
  const attached = asAttachment({
    fileName: "nda.pdf",
    filePath: "documents/a.pdf",
    fileUrl: "https://abc.public.blob.vercel-storage.com/documents/a.pdf",
  });
  assert.equal(attached.filePath, "documents/a.pdf");
  assert.equal(attached.fileUrl, "");

  assert.equal(blobPathFromUrl("https://abc.public.blob.vercel-storage.com/documents/nda.pdf"), "documents/nda.pdf");

  const redacted = redactRecordBlobUrls({
    filePath: "",
    fileUrl: "https://abc.public.blob.vercel-storage.com/documents/nda.pdf",
    attachments: [{ fileName: "x.pdf", fileUrl: "https://abc.public.blob.vercel-storage.com/documents/x.pdf" }],
  });
  assert.equal(redacted.filePath, "documents/nda.pdf");
  assert.equal(redacted.fileUrl, "");
  assert.equal(redacted.attachments[0].filePath, "documents/x.pdf");
  assert.equal(redacted.attachments[0].fileUrl, "");
});

test("normalizeRecipients caps and validates outbound mail", () => {
  assert.equal(normalizeRecipients([]).error, "No recipient.");
  assert.equal(normalizeRecipients("not-an-email").error.includes("not valid"), true);
  assert.equal(normalizeRecipients("ops@thewizardofops.app").recipients[0], "ops@thewizardofops.app");
  assert.equal(normalizeRecipients(Array.from({ length: MAX_RECIPIENTS + 1 }, (_, i) => `a${i}@x.co`)).error.includes("At most"), true);
  assert.equal(normalizeSubject("").error, "No subject.");
  assert.equal(normalizeSubject("Follow-up").subject, "Follow-up");
});

test("isSharedCollection rejects unknown board tables", () => {
  assert.equal(isSharedCollection("projects"), true);
  assert.equal(isSharedCollection("slate"), true);
  assert.equal(isSharedCollection("social"), true);
  assert.equal(isSharedCollection("mandates"), true);
  assert.equal(isSharedCollection("pitches"), true);
  assert.equal(isSharedCollection("members"), false);
  assert.equal(isSharedCollection("workspace"), false);
});

test("isAllowedContentType rejects HTML and unmarked binaries", () => {
  assert.equal(isAllowedContentType("application/pdf"), true);
  assert.equal(isAllowedContentType("application/vnd.ms-powerpoint"), true);
  assert.equal(isAllowedContentType("image/png; charset=binary"), true);
  assert.equal(isAllowedContentType("text/html"), false);
  assert.equal(isAllowedContentType("application/octet-stream"), false);
  assert.equal(isAllowedInlineDataUrl("data:application/pdf;base64,AAAA"), true);
  assert.equal(isAllowedInlineDataUrl("data:text/html,<h1>x</h1>"), false);
  assert.equal(storedInlineUrl("data:text/html,<script>"), "");
});

test("resolveUploadType sniffs bytes and ignores a lying Content-Type", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(resolveUploadType({ bytes: png, claimedType: "image/png", fileName: "still.png" }).contentType, "image/png");
  assert.match(resolveUploadType({ bytes: png, claimedType: "application/pdf", fileName: "still.pdf" }).error, /match/);
  const html = new TextEncoder().encode("<!DOCTYPE html><script>alert(1)</script>");
  assert.match(resolveUploadType({ bytes: html, claimedType: "application/pdf", fileName: "x.pdf" }).error, /not allowed/);
  const pdf = new TextEncoder().encode("%PDF-1.4\n%");
  assert.equal(resolveUploadType({ bytes: pdf, claimedType: "application/pdf", fileName: "nda.pdf" }).contentType, "application/pdf");
  const empty = new Uint8Array([0, 1, 2, 3]);
  assert.match(resolveUploadType({ bytes: empty, claimedType: "application/pdf", fileName: "x.pdf" }).error, /recognise/);
});

test("rateLimit trips after the window fills", async () => {
  const key = `test-${Date.now()}`;
  assert.equal((await rateLimit({ key, limit: 2, windowMs: 60_000 })).error, undefined);
  assert.equal((await rateLimit({ key, limit: 2, windowMs: 60_000 })).error, undefined);
  assert.equal((await rateLimit({ key, limit: 2, windowMs: 60_000 })).error.status, 429);
});

test("mailboxSyncTargets requires consent on cron and only the caller on demand", () => {
  const members = [
    { clerkId: "user_a", email: "a@matriarch-studios.com", status: "active", googleSyncConsent: true },
    { clerkId: "user_b", email: "b@matriarch-studios.com", status: "active", googleSyncConsent: false },
  ];
  const declared = ["a@matriarch-studios.com", "b@matriarch-studios.com"];
  assert.deepEqual(
    mailboxSyncTargets(members, { declaredEmails: declared }).map((m) => m.email),
    ["a@matriarch-studios.com"]
  );
  assert.deepEqual(
    mailboxSyncTargets(members, { declaredEmails: declared, callerEmail: "b@matriarch-studios.com" }).map((m) => m.email),
    ["b@matriarch-studios.com"]
  );
});

test("calendar redirects stay on the allowlist", () => {
  assert.equal(isAllowedCalendarHost("calendar.google.com"), true);
  assert.equal(isAllowedCalendarHost("www.google.com"), false);
  const ok = calendarRedirectTarget(
    new URL("https://calendar.google.com/calendar/ical/x/basic.ics"),
    "https://calendar.google.com/calendar/ical/y/basic.ics"
  );
  assert.equal(ok.url.hostname, "calendar.google.com");
  const hop = calendarRedirectTarget(
    new URL("https://calendar.google.com/calendar/ical/x/basic.ics"),
    "https://169.254.169.254/latest/meta-data/"
  );
  assert.match(hop.error, /allowed hosts/);
});
