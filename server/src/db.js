import path from "node:path";
import { fileURLToPath } from "node:url";
import { open } from "sqlite";
import sqlite3 from "sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = path.join(__dirname, "..", "data", "adapttica.sqlite");

let dbPromise;

export function dbPath() {
  return process.env.DATABASE_FILE
    ? path.resolve(process.env.DATABASE_FILE)
    : DEFAULT_DB_PATH;
}

export async function openDb() {
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
