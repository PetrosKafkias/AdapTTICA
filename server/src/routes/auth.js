import crypto from "node:crypto";
import express from "express";
import { z } from "zod";
import { asyncRoute, fail } from "../lib/errors.js";
import { hashPassword, verifyPassword, toPublicUser } from "../lib/auth.js";
import { audit } from "../lib/audit.js";

export const authRouter = express.Router();

const registerSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required."),
  email: z.string().trim().email("Invalid email"),
  password: z.string().min(8, "Password is too short"),
  phone: z.string().trim().optional(),
  location: z.string().trim().optional(),
  organisation: z.string().trim().optional(),
  language: z.enum(["el", "en"]).optional(),
  platformRole: z.enum(["user", "representative", "coordinator", "admin"]).optional(),
  stakeholderCategory: z.enum(["public", "private", "civil", "research"]).optional(),
});

function fieldErrors(zodError) {
  const fields = {};
  for (const issue of zodError.issues) {
    fields[issue.path[0]] = issue.message;
  }
  return fields;
}

async function loadUserRow(db, id) {
  return db.get(
    `select u.*, o.name as organisation_name from users u
     left join organisations o on o.id = u.organisation_id
     where u.id = ?`,
    id
  );
}

authRouter.post(
  "/register",
  asyncRoute(async (req, res) => {
    const parsed = registerSchema.safeParse(req.body || {});
    if (!parsed.success) return fail(res, "validation_error", "Please correct the highlighted fields.", fieldErrors(parsed.error));
    const body = parsed.data;

    const existing = await req.db.get("select id from users where email = ? collate nocase", body.email);
    if (existing) return fail(res, "conflict", "An account with this email already exists.", { email: "Email is already registered." });

    // Self-registration always uses the least-privileged participant role.
    // Reject handcrafted attempts to request elevated access rather than
    // silently accepting a misleading registration payload.
    if (body.platformRole && body.platformRole !== "user") {
      return fail(res, "forbidden", "Public registration creates participant accounts only. Ask an administrator for elevated access.");
    }
    const platformRole = "user";

    const id = crypto.randomUUID();
    const passwordHash = await hashPassword(body.password);
    const preferences = JSON.stringify({ phone: body.phone || "", location: body.location || "" });
    let organisationId = null;
    if (body.organisation) {
      const org = await req.db.get("select id from organisations where name = ?", body.organisation);
      organisationId = org?.id || crypto.randomUUID();
      if (!org) await req.db.run("insert into organisations (id, name) values (?, ?)", organisationId, body.organisation);
    }

    await req.db.run(
      `insert into users (id, email, password_hash, full_name, platform_role, organisation_id, locale, preferences, stakeholder_category)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      body.email.toLowerCase(),
      passwordHash,
      body.fullName,
      platformRole,
      organisationId,
      body.language || "el",
      preferences,
      body.stakeholderCategory || null
    );
    await audit(req.db, { actorId: id, action: "register", entityType: "user", entityId: id });

    req.session.userId = id;
    const row = await loadUserRow(req.db, id);
    res.status(201).json({ data: { user: toPublicUser(row) } });
  })
);

const loginSchema = z.object({
  email: z.string().trim().email("Invalid email"),
  password: z.string().min(1, "Password is required."),
});

authRouter.post(
  "/login",
  asyncRoute(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body || {});
    if (!parsed.success) return fail(res, "validation_error", "Please correct the highlighted fields.", fieldErrors(parsed.error));
    const { email, password } = parsed.data;

    const user = await req.db.get(
      `select u.*, o.name as organisation_name from users u
       left join organisations o on o.id = u.organisation_id
       where u.email = ? collate nocase`,
      email
    );
    if (!user || user.disabled_at) return fail(res, "validation_error", "Invalid email or password.", { password: "Invalid email or password." });

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) return fail(res, "validation_error", "Invalid email or password.", { password: "Invalid email or password." });

    req.session.userId = user.id;
    await audit(req.db, { actorId: user.id, action: "login", entityType: "user", entityId: user.id });
    res.json({ data: { user: toPublicUser(user) } });
  })
);

authRouter.post(
  "/logout",
  asyncRoute(async (req, res) => {
    if (req.session?.userId) {
      await audit(req.db, { actorId: req.session.userId, action: "logout", entityType: "user", entityId: req.session.userId });
    }
    req.session = null;
    res.json({ data: { success: true } });
  })
);
