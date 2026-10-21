import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  isHouseEmail,
  isHouseMember,
  workspaceAccess,
} from "../../src/lib/houseAccess.js";

type DbCtx = QueryCtx | MutationCtx;

export async function requireIdentity(ctx: DbCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not signed in.");
  return identity;
}

export async function memberByClerk(ctx: DbCtx, clerkId: string) {
  return await ctx.db
    .query("members")
    .withIndex("by_clerk", (q) => q.eq("clerkId", clerkId))
    .unique();
}

export async function memberByEmail(ctx: DbCtx, identity: { email?: string | null }) {
  const email = String(identity.email || "").trim().toLowerCase();
  if (!email) return null;
  return await ctx.db
    .query("members")
    .withIndex("by_email", (q) => q.eq("email", email))
    .unique();
}

export async function viewerAccessFor(ctx: DbCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return { allow: false, isHouse: false };

  const byClerk = await memberByClerk(ctx, identity.subject);
  const byEmail = byClerk ? null : await memberByEmail(ctx, identity);
  const access = workspaceAccess({
    clerkId: identity.subject,
    isHouse: isHouseEmail(identity.email),
    emailVerified: identity.emailVerified,
    byClerk,
    byEmail,
  });
  const member = byClerk || (access.allow ? byEmail : null);
  return {
    allow: access.allow === true,
    isHouse: isHouseMember(member, identity),
    reason: access.reason,
  };
}

/** Signed in and already in the workspace (or a verified house email). */
export async function requireMember(ctx: DbCtx) {
  const identity = await requireIdentity(ctx);
  const access = await viewerAccessFor(ctx);
  if (!access.allow) throw new Error(access.reason || "This workspace is invite-only.");
  const member = await memberByClerk(ctx, identity.subject);
  return { identity, member, isHouse: access.isHouse };
}

export function requireHouse(session: { isHouse: boolean }) {
  if (!session.isHouse) {
    throw new Error("Only a studio account can do that.");
  }
}
