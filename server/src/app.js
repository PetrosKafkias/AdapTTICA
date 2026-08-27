import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cookieSession from "cookie-session";
import { errorMiddleware, fail } from "./lib/errors.js";
import { rateLimit } from "./lib/rateLimit.js";
import { authRouter } from "./routes/auth.js";
import { meRouter } from "./routes/me.js";
import { notificationsRouter } from "./routes/notifications.js";
import { uploadsRouter } from "./routes/uploads.js";
import { casesRouter } from "./routes/cases.js";
import { decisionsRouter } from "./routes/decisions.js";
import { workshopOutputsRouter } from "./routes/workshopOutputs.js";
import { resourcesRouter } from "./routes/resources.js";
import { adminRouter } from "./routes/admin.js";
import { invitationsRouter } from "./routes/invitations.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp({ db, sessionSecret, serveStatic = false }) {
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "10mb" }));
  app.use(
    cookieSession({
      name: "adapttica.sid",
      keys: [sessionSecret],
      maxAge: 30 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    })
  );
  app.use((req, _res, next) => {
    req.db = db;
    next();
  });

  const api = express.Router();
  api.use("/auth", rateLimit({ windowMs: 60_000, max: 30 }), authRouter);
  api.use("/me", meRouter);
  api.use("/notifications", notificationsRouter);
  api.use("/files", uploadsRouter);
  api.use("/cases", casesRouter);
  api.use("/decisions", decisionsRouter);
  api.use("/workshop-outputs", workshopOutputsRouter);
  api.use("/resources", resourcesRouter);
  api.use("/admin", adminRouter);
  api.use("/invitations", invitationsRouter);
  api.use((req, res) => {
    fail(res, "not_found", `Endpoint not implemented: ${req.method} ${req.originalUrl}`);
  });
  app.use("/api/v1", api);

  if (serveStatic) {
    const distDir = path.join(__dirname, "..", "..", "dist");
    app.use(express.static(distDir));
    app.get("/*splat", (req, res, next) => {
      if (req.path.startsWith("/api/")) return next();
      res.sendFile(path.join(distDir, "index.html"));
    });
  }

  app.use(errorMiddleware);
  return app;
}
