// Vercel serverless entry for the whole API. vercel.json rewrites /api/v1/*
// here, and Vercel preserves the original path, so the routers mounted at
// /api/v1 inside createApp() match unchanged.
//
// Nothing is imported at module scope on purpose. Several dependencies in
// this graph carry native bindings, and a native module that cannot load in
// this runtime takes the whole Function down with FUNCTION_INVOCATION_FAILED
// before any handler exists -- an error with no message and no stack in the
// response. Deferring every import into the handler means such a failure
// arrives as an ordinary JSON error that says what is actually wrong.

// Two supported shapes, both driven by TURSO_DATABASE_URL:
//
//   libsql://…   a hosted Turso database. Durable and shared between
//                instances; migrations are applied out of band.
//   file:/tmp/…  a throwaway database inside this instance. Nothing is
//                shared and nothing survives a cold start, so the schema and
//                the demo content are built on boot. Preview mode: anything
//                a visitor writes is lost when the instance is recycled.
const EPHEMERAL_DB = "file:/tmp/adapttica-preview.sqlite";

let appPromise;

async function buildApp() {
  const { default: fs } = await import("node:fs");
  await import("../server/src/env.js");

  // Only /tmp is writable on Vercel, so uploads live for the lifetime of one
  // instance and are not shared between them.
  if (!process.env.UPLOAD_DIR) process.env.UPLOAD_DIR = "/tmp/uploads";
  fs.mkdirSync(process.env.UPLOAD_DIR, { recursive: true });

  if (!process.env.TURSO_DATABASE_URL) process.env.TURSO_DATABASE_URL = EPHEMERAL_DB;
  const isEphemeral = process.env.TURSO_DATABASE_URL.startsWith("file:");

  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) throw new Error("SESSION_SECRET is not set in the deployment environment.");

  const { getDb } = await import("../server/src/db.js");
  if (isEphemeral) {
    const { migrate } = await import("../server/src/migrate.js");
    await migrate();
    const db = await getDb();
    // Seed only an empty database: a warm instance must not have its content
    // reset underneath a visitor mid-session.
    const existing = await db.get("select count(*) as c from users");
    if (!Number(existing?.c || 0)) {
      const { seed } = await import("../server/src/seed.js");
      await seed();
    }
  }

  const { createApp } = await import("../server/src/app.js");
  const db = await getDb();
  // Vercel serves the built frontend from dist/ as static assets.
  return createApp({ db, sessionSecret, serveStatic: false });
}

export default async function handler(req, res) {
  try {
    if (!appPromise) appPromise = buildApp();
    const app = await appPromise;
    app(req, res);
  } catch (error) {
    // A failed boot must not be cached as a resolved promise.
    appPromise = undefined;
    console.error(error);
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        ok: false,
        error: { code: error.code || "server_misconfigured", message: error.message },
      })
    );
  }
}
