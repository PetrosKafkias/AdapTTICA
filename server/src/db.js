import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = path.join(__dirname, "..", "data", "adapttica.sqlite");

let dbPromise;

// Serverless hosts (Vercel) have a read-only filesystem apart from a
// per-instance /tmp, so a SQLite file cannot be the durable store there.
// Setting TURSO_DATABASE_URL switches to the hosted libSQL database instead;
// local development and the test suite keep using the file unchanged.
export function usingLibsql() {
  return Boolean(process.env.TURSO_DATABASE_URL);
}

export function dbPath() {
  return process.env.DATABASE_FILE
    ? path.resolve(process.env.DATABASE_FILE)
    : DEFAULT_DB_PATH;
}

export function usingLocalFileUrl() {
  return (process.env.TURSO_DATABASE_URL || "").startsWith("file:");
}

export async function openDb() {
  if (usingLibsql()) {
    // A local file URL means the throwaway preview database inside a
    // serverless instance. libSQL would serve it through a native binding
    // that the host does not install, so use the runtime's own SQLite;
    // a real libsql:// URL is pure JS over HTTP and needs no binding.
    if (usingLocalFileUrl()) {
      const { createNodeSqliteDb } = await import("./lib/nodeSqliteAdapter.js");
      return createNodeSqliteDb(process.env.TURSO_DATABASE_URL.replace(/^file:/, ""));
    }
    const { createLibsqlDb } = await import("./lib/libsqlAdapter.js");
    return createLibsqlDb({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  // Keep the native sqlite3 dependency out of the Vercel/Turso boot path.
  // Vercel does not run sqlite3's native install script, so importing it at
  // module scope crashed the Function before the serverless handler could
  // return a useful configuration error. Local development/tests still load
  // the exact same driver, but only when the file-backed database is used.
  const [{ open }, sqlite3Module] = await Promise.all([import("sqlite"), import("sqlite3")]);
  const sqlite3 = sqlite3Module.default;
  const db = await open({ filename: dbPath(), driver: sqlite3.Database });
  await db.exec("pragma foreign_keys = on");
  await db.exec("pragma journal_mode = wal");
  return db;
}

export async function getDb() {
  if (!dbPromise) dbPromise = openDb();
  return dbPromise;
}

export async function resetDbForTests() {
  dbPromise = undefined;
}
