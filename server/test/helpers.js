import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { open } from "sqlite";
import sqlite3 from "sqlite3";
import { createApp } from "../src/app.js";
import { migrate } from "../src/migrate.js";
import { hashPassword } from "../src/lib/auth.js";

export async function createTestApp() {
  const dbFile = path.join(process.cwd(), "server", "data", `test-${crypto.randomUUID()}.sqlite`);
  await migrate(dbFile);
  const db = await open({ filename: dbFile, driver: sqlite3.Database });
  await db.exec("pragma foreign_keys = on");

  const app = createApp({ db, sessionSecret: "test-secret" });

  const cleanup = async () => {
    await db.close();
    for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${dbFile}${suffix}`, { force: true });
  };

  return { app, db, cleanup };
}

export async function createUser(db, { email, password, platformRole = "user", fullName = "Test User" }) {
  const id = crypto.randomUUID();
  await db.run(
    "insert into users (id, email, password_hash, full_name, platform_role) values (?, ?, ?, ?, ?)",
    id,
    email,
    await hashPassword(password),
    fullName,
    platformRole
  );
  return id;
}
