import "./env.js";
import { createApp } from "./app.js";
import { getDb } from "./db.js";
import { migrate } from "./migrate.js";

const PORT = Number(process.env.API_PORT || 8787);
const SESSION_SECRET = process.env.SESSION_SECRET;

if (!SESSION_SECRET) {
  console.error("SESSION_SECRET is not set. Copy .env.example to .env.local and set a value before starting the server.");
  process.exit(1);
}

const run = async () => {
  await migrate();
  const db = await getDb();
  const app = createApp({
    db,
    sessionSecret: SESSION_SECRET,
    serveStatic: process.env.NODE_ENV === "production",
  });

  app.listen(PORT, () => {
    console.log(`AdapTTICA API listening on http://localhost:${PORT}`);
  });
};

run();
