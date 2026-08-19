import { mutation } from "./_generated/server";

/**
 * Empties every table on the deployment it runs against.
 *
 * Intended for clearing a development deployment after testing. It is deliberately
 * not exposed to the app — the only way to call it is `npx convex run`, which needs
 * deploy credentials.
 */
export const clearAll = mutation({
  args: {},
  handler: async (ctx) => {
    const counts = {};
    for (const table of ["records", "members", "workspace"]) {
      const rows = await ctx.db.query(table).collect();
      for (const row of rows) await ctx.db.delete(row._id);
      counts[table] = rows.length;
    }
    return counts;
  },
});
