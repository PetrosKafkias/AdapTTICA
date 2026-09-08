import { createClient } from "@libsql/client";

// Turso/libSQL speaks a different client API from the `sqlite` wrapper the
// rest of the server is written against. Rather than rewrite ~300 call sites,
// this adapter presents the exact `get`/`all`/`run`/`exec`/`close` surface the
// codebase uses (verified: nothing reads `lastID` or `changes`), so the SQL and
// the routes stay identical between local SQLite and deployed Turso.

// The `sqlite` wrapper accepts both `run(sql, a, b)` and `run(sql, [a, b])`.
function normaliseArgs(params) {
  const flat = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
  return flat.map((value) => {
    // sqlite3 silently binds `undefined` as NULL; libSQL throws instead.
    if (value === undefined) return null;
    if (typeof value === "boolean") return value ? 1 : 0;
    return value;
  });
}

// libSQL Row objects expose columns by name (confirmed: no numeric aliases),
// but they are not plain objects, so copy before they reach `res.json`.
const toPlainRow = (row) => ({ ...row });

const TRANSACTION_KEYWORDS = new Set(["begin", "commit", "rollback"]);

export function createLibsqlDb({ url, authToken }) {
  const client = createClient({ url, authToken });
  // migrate.js drives transactions through `exec("begin"/"commit"/"rollback")`;
  // libSQL exposes them as an explicit transaction object instead, so hold the
  // open one here and route statements through it while it lasts.
  let transaction = null;
  const target = () => transaction || client;

  const execute = (sql, params) => target().execute({ sql, args: normaliseArgs(params) });

  return {
    async get(sql, ...params) {
      const result = await execute(sql, params);
      return result.rows.length ? toPlainRow(result.rows[0]) : undefined;
    },
    async all(sql, ...params) {
      const result = await execute(sql, params);
      return result.rows.map(toPlainRow);
    },
    async run(sql, ...params) {
      const result = await execute(sql, params);
      return {
        changes: Number(result.rowsAffected || 0),
        lastID: result.lastInsertRowid == null ? undefined : Number(result.lastInsertRowid),
      };
    },
    async exec(sql) {
      const keyword = sql.trim().toLowerCase().replace(/;\s*$/, "");
      if (TRANSACTION_KEYWORDS.has(keyword)) {
        if (keyword === "begin") {
          transaction = await client.transaction("write");
        } else if (transaction) {
          const open = transaction;
          transaction = null;
          await (keyword === "commit" ? open.commit() : open.rollback());
        }
        return;
      }
      // Turso manages journalling and enforces foreign keys itself; the local
      // pragmas are meaningless there and `journal_mode` is rejected outright.
      if (keyword.startsWith("pragma ")) return;
      await target().executeMultiple(sql);
    },
    async close() {
      if (transaction) {
        const open = transaction;
        transaction = null;
        await open.rollback();
      }
      client.close();
    },
  };
}
