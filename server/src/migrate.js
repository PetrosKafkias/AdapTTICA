import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dbPath, openDb, usingLibsql } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "..", "migrations", "sqlite");

export async function migrate(targetPath = dbPath()) {
  // Against Turso there is no file to create and openDb() returns the libSQL
  // adapter, which accepts the same statements this function already issues.
  let db;
  if (usingLibsql()) {
    db = await openDb();
  } else {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    const [{ open }, sqlite3Module] = await Promise.all([import("sqlite"), import("sqlite3")]);
    db = await open({ filename: targetPath, driver: sqlite3Module.default.Database });
    await db.exec("pragma foreign_keys = on");
  }
  await db.exec(
    "create table if not exists schema_migrations (name text primary key, applied_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))"
  );

  const applied = new Set((await db.all("select name from schema_migrations")).map((row) => row.name));
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  const run = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    await db.exec("begin");
    try {
      await db.exec(sql);
      await db.run("insert into schema_migrations (name) values (?)", file);
      await db.exec("commit");
      run.push(file);
    } catch (error) {
      await db.exec("rollback");
      throw new Error(`Migration ${file} failed: ${error.message}`, { cause: error });
    }
  }

  await db.close();
  return run;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await import("./env.js");
  migrate()
    .then((run) => {
      if (run.length === 0) {
        console.log("Database already up to date.");
      } else {
        console.log(`Applied migrations: ${run.join(", ")}`);
      }
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
