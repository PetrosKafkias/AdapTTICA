import express from "express";
import { z } from "zod";
import { asyncRoute, fail } from "../lib/errors.js";
import { requireUser, requireRole } from "../lib/auth.js";
import { audit } from "../lib/audit.js";

export const adminRouter = express.Router();

adminRouter.use(
  asyncRoute(async (req, _res, next) => {
    req.user = await requireUser(req);
    requireRole(req.user, "admin");
    next();
  })
);

adminRouter.get(
  "/users",
  asyncRoute(async (req, res) => {
    const rows = await req.db.all(
      `select u.id, u.full_name, u.email, u.platform_role, u.locale, u.created_at, u.disabled_at,
              o.name as organisation_name
       from users u left join organisations o on o.id = u.organisation_id
       order by u.created_at desc`
    );
    res.json({
      data: {
        items: rows.map((row) => ({
          id: row.id,
          full_name: row.full_name,
          email: row.email,
          platform_role: row.platform_role,
          locale: row.locale,
          organisation_name: row.organisation_name || "",
          created_at: row.created_at,
          disabled_at: row.disabled_at,
          active: !row.disabled_at,
        })),
      },
    });
  })
);

const roleSchema = z.object({
  platformRole: z.enum(["user", "representative", "coordinator", "admin"]),
});

adminRouter.patch(
  "/users/:id",
  asyncRoute(async (req, res) => {
    const parsed = roleSchema.safeParse(req.body || {});
    if (!parsed.success) return fail(res, "validation_error", "A valid role is required.");
    const target = await req.db.get("select * from users where id = ?", req.params.id);
    if (!target) return fail(res, "not_found", "User not found.");

    await req.db.run(
      "update users set platform_role = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = ?",
      parsed.data.platformRole,
      req.params.id
    );
    await audit(req.db, {
      actorId: req.user.id,
      action: "change_role",
      entityType: "user",
      entityId: req.params.id,
      metadata: { from: target.platform_role, to: parsed.data.platformRole },
    });
    res.json({ data: { success: true } });
  })
);

adminRouter.get(
  "/audit",
  asyncRoute(async (req, res) => {
    const rows = await req.db.all(
      `select a.id, a.action, a.entity_type, a.entity_id, a.metadata, a.created_at, u.full_name as actor_name
       from audit_log a left join users u on u.id = a.actor_id
       order by a.created_at desc limit 200`
    );
    res.json({
      data: {
        items: rows.map((row) => ({
          id: row.id,
          action: row.action,
          entity_type: row.entity_type,
          entity_id: row.entity_id,
          metadata: JSON.parse(row.metadata || "{}"),
          actor_name: row.actor_name || "System",
          created_at: row.created_at,
        })),
      },
    });
  })
);
