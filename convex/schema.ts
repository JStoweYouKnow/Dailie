import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * The board, shared across everyone in the organisation.
 *
 * Records are stored generically rather than as one table per collection. The client
 * already treats every collection the same way — add / update / remove by name — and a
 * generic shape keeps that contract, so adding a collection needs no migration here.
 * The whole board is small enough to read in one query, which is what makes it live
 * for every viewer at once.
 */
export default defineSchema({
  records: defineTable({
    collection: v.string(),
    docId: v.string(),
    data: v.any(),
    updatedAt: v.number(),
    updatedBy: v.optional(v.string()),
  })
    .index("by_collection", ["collection"])
    .index("by_doc", ["collection", "docId"]),

  /**
   * The organisation directory. A row appears the first time someone signs in, which
   * is what makes a new hire show up as an active team member without anyone adding
   * them by hand.
   */
  members: defineTable({
    clerkId: v.string(),
    name: v.string(),
    email: v.string(),
    role: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    status: v.string(),
    firstSeenAt: v.number(),
    lastSeenAt: v.number(),
  })
    .index("by_clerk", ["clerkId"])
    .index("by_email", ["email"]),

  /** Single-row settings: workspace preferences and the editable pipelines. */
  workspace: defineTable({
    key: v.string(),
    value: v.any(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),
});
