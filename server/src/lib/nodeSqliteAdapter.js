import { DatabaseSync } from "node:sqlite";

// Node's own SQLite, used only for the throwaway preview database inside a
// serverless instance's /tmp.
//
// Both other drivers need a platform-specific native package: `sqlite3`
// (whose install script Vercel does not run) and libSQL's `libsql` (whose
// binding is loaded through a computed require, so Vercel neither installs
// nor bundles it -- the deployment failed with "Cannot find module
// '@libsql/linux-x64-gnu'"). node:sqlite ships with the runtime, so there is
// nothing to resolve at all.
//
// Presents the same get/all/run/exec/close surface as the libSQL adapter, so
// the routes and migrations are identical across all three drivers.

// The `sqlite` wrapper accepts both `run(sql, a, b)` and `run(sql, [a, b])`.
function normaliseArgs(params) {
  const flat = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
  return flat.map((value) => {
    // sqlite3 binds `undefined` as NULL; node:sqlite rejects it.
    if (value === undefined) return null;
    if (typeof value === "boolean") return value ? 1 : 0;
    return value;
  });
}

export function createNodeSqliteDb(filename) {
  const db = new DatabaseSync(filename);
  db.exec("pragma foreign_keys = on");

  return {
    async get(sql, ...params) {
      return db.prepare(sql).get(...normaliseArgs(params)) ?? undefined;
    },
    async all(sql, ...params) {
      return db.prepare(sql).all(...normaliseArgs(params));
    },
    async run(sql, ...params) {
      const result = db.prepare(sql).run(...normaliseArgs(params));
      return {
        changes: Number(result.changes || 0),
        lastID: result.lastInsertRowid == null ? undefined : Number(result.lastInsertRowid),
      };
    },
    async exec(sql) {
      // journal_mode is meaningless for a file that lives and dies with the
      // instance, and WAL would only add sidecar files to /tmp.
      if (/^\s*pragma\s+journal_mode/i.test(sql)) return;
      // exec handles multi-statement SQL, so migration files and the
      // begin/commit that wraps them pass straight through.
      db.exec(sql);
    },
    async close() {
      db.close();
    },
  };
}
