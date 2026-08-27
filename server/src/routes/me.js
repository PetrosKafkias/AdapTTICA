import express from "express";
import { z } from "zod";
import { asyncRoute, fail } from "../lib/errors.js";
import { requireUser, toPublicUser } from "../lib/auth.js";
import { audit } from "../lib/audit.js";

export const meRouter = express.Router();

meRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    const user = await requireUser(req);
    res.json({ data: { user: toPublicUser(user) } });
  })
);

const patchSchema = z.object({
  fullName: z.string().trim().min(1).optional(),
  phone: z.string().trim().optional(),
  location: z.string().trim().optional(),
  language: z.enum(["el", "en"]).optional(),
  notificationPreferences: z.record(z.string(), z.boolean()).optional(),
  privacyPreferences: z
    .object({
      profileVisibility: z.string().optional(),
      analytics: z.boolean().optional(),
    })
    .optional(),
});

meRouter.patch(
  "/",
  asyncRoute(async (req, res) => {
    const user = await requireUser(req);
    const parsed = patchSchema.safeParse(req.body || {});
    if (!parsed.success) {
      const fields = {};
      for (const issue of parsed.error.issues) fields[issue.path[0]] = issue.message;
      return fail(res, "validation_error", "Please correct the highlighted fields.", fields);
    }
    const body = parsed.data;

    let preferences;
    try {
      preferences = JSON.parse(user.preferences || "{}");
    } catch {
      preferences = {};
    }
    if (body.phone !== undefined) preferences.phone = body.phone;
    if (body.location !== undefined) preferences.location = body.location;
    if (body.notificationPreferences) {
      preferences.notificationPreferences = { ...preferences.notificationPreferences, ...body.notificationPreferences };
    }
    if (body.privacyPreferences) {
      preferences.privacyPreferences = { ...preferences.privacyPreferences, ...body.privacyPreferences };
    }

    await req.db.run(
      `update users set
         full_name = coalesce(?, full_name),
         locale = coalesce(?, locale),
         preferences = ?,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       where id = ?`,
      body.fullName ?? null,
      body.language ?? null,
      JSON.stringify(preferences),
      user.id
    );
    await audit(req.db, { actorId: user.id, action: "update_profile", entityType: "user", entityId: user.id });

    const row = await req.db.get(
      `select u.*, o.name as organisation_name from users u
       left join organisations o on o.id = u.organisation_id
       where u.id = ?`,
      user.id
    );
    res.json({ data: { user: toPublicUser(row) } });
  })
);
