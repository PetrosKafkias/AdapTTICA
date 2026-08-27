import crypto from "node:crypto";
import express from "express";
import { z } from "zod";
import { asyncRoute, fail, ApiError } from "../lib/errors.js";
import { requireUser, requireRole } from "../lib/auth.js";
import { audit } from "../lib/audit.js";
import { notifyUser } from "../lib/notify.js";
import { notifyByEmail } from "../lib/mailer.js";

export const resourcesRouter = express.Router();

const STATUS_LABELS = {
  pending_review: { el: "Σε αναμονή ελέγχου", en: "Pending review" },
  approved: { el: "Εγκρίθηκε", en: "Approved" },
  changes_requested: { el: "Απαιτούνται αλλαγές", en: "Changes required" },
  rejected: { el: "Απορρίφθηκε", en: "Rejected" },
};

const LICENCE_LABELS = {
  "CC-BY-4.0": { el: "CC BY 4.0", en: "CC BY 4.0" },
  "CC-BY-SA-4.0": { el: "CC BY-SA 4.0", en: "CC BY-SA 4.0" },
  "CC-BY-NC-4.0": { el: "CC BY-NC 4.0", en: "CC BY-NC 4.0" },
  "CC0-1.0": { el: "CC0 1.0 (Δημόσιος τομέας)", en: "CC0 1.0 (Public domain)" },
  MIT: { el: "Άδεια MIT", en: "MIT Licence" },
  GPL: { el: "GNU GPL", en: "GNU GPL" },
  other: { el: "Άλλη / προσαρμοσμένη άδεια", en: "Other / custom licence" },
};

function toPublicResource(row, currentUserId) {
  const title = JSON.parse(row.title);
  const description = JSON.parse(row.description || "{}");
  const tags = JSON.parse(row.tags || "[]");
  const statusLabel = STATUS_LABELS[row.status] || {};
  return {
    id: row.id,
    type: row.resource_type,
    title_el: title.el,
    title_en: title.en,
    description_el: description.el || "",
    description_en: description.en || "",
    author_organisation: row.author_organisation || "",
    tags,
    file_name: row.file_name || "",
    file_type: row.mime_type || "",
    file_size: row.byte_size || 0,
    published_at: row.published_at,
    file_key: row.storage_key || "",
    status: row.status,
    status_label_el: statusLabel.el || row.status,
    status_label_en: statusLabel.en || row.status,
    licence: row.licence,
    licence_label_el: (LICENCE_LABELS[row.licence] || {}).el || row.licence,
    licence_label_en: (LICENCE_LABELS[row.licence] || {}).en || row.licence,
    licence_other: row.licence_other || "",
    moderation_note: row.moderation_note || "",
    is_own: currentUserId ? row.author_id === currentUserId : false,
  };
}

// Browsing the knowledge library is public, but only *approved* material is
// visible to the public/other members — a submitter can still see their own
// item at any status, and a moderator (admin) sees the full queue. Anyone
// registered may submit (enforced below); moderation review is admin-only.

resourcesRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    const sessionUserId = req.session?.userId || null;
    const currentUser = sessionUserId
      ? await req.db.get("select id, platform_role from users where id = ? and disabled_at is null", sessionUserId)
      : null;
    const isModerator = currentUser?.platform_role === "admin";
    const search = String(req.query.q || "").trim();

    const visibilityClause = isModerator ? "1=1" : currentUser ? "(r.status = 'approved' or r.author_id = ?)" : "r.status = 'approved'";
    const visibilityParams = isModerator || !currentUser ? [] : [currentUser.id];

    let rows;
    if (search) {
      rows = await req.db.all(
        `select r.*, o.name as author_organisation from resources_fts f
         join resources r on r.id = f.id
         left join users au on au.id = r.author_id left join organisations o on o.id = au.organisation_id
         where resources_fts match ? and ${visibilityClause} order by r.published_at desc`,
        `${search}*`,
        ...visibilityParams
      );
    } else {
      rows = await req.db.all(
        `select r.*, o.name as author_organisation from resources r
         left join users au on au.id = r.author_id left join organisations o on o.id = au.organisation_id
         where ${visibilityClause} order by r.published_at desc`,
        ...visibilityParams
      );
    }
    res.json({ data: { items: rows.map((row) => toPublicResource(row, currentUser?.id)), total: rows.length } });
  })
);

const RESOURCE_TYPES = ["report", "dataset", "workshop_output", "good_practice", "methodology"];
const LICENCES = ["CC-BY-4.0", "CC-BY-SA-4.0", "CC-BY-NC-4.0", "CC0-1.0", "MIT", "GPL", "other"];

const resourceFields = z.object({
  titleEl: z.string().trim().min(1, "Title is required."),
  titleEn: z.string().trim().min(1, "Title is required."),
  descriptionEl: z.string().trim().optional(),
  descriptionEn: z.string().trim().optional(),
  authorOrganisation: z.string().trim().optional(),
  fileKey: z.string().trim().min(1, "A file is required."),
  fileName: z.string().trim().min(1, "A file is required."),
  fileType: z.string().trim().optional(),
  fileSize: z.number().optional(),
  // The real create form posts the type under "type"; the field was
  // previously misnamed "resourceType" only, so every real submission
  // silently defaulted to "report". Accept both.
  resourceType: z.enum(RESOURCE_TYPES).optional(),
  type: z.enum(RESOURCE_TYPES).optional(),
  licence: z.enum(LICENCES, { message: "Please select a licence." }),
  licenceOther: z.string().trim().optional(),
  publishedAt: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const createSchema = resourceFields.superRefine((data, ctx) => {
  if (data.licence === "other" && !data.licenceOther?.trim()) {
    ctx.addIssue({ path: ["licenceOther"], code: z.ZodIssueCode.custom, message: "Please describe the licence." });
  }
});

resourcesRouter.post(
  "/",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    const parsed = createSchema.safeParse(req.body || {});
    if (!parsed.success) {
      const fields = {};
      for (const issue of parsed.error.issues) fields[issue.path[0]] = issue.message;
      return fail(res, "validation_error", "Please correct the highlighted fields.", fields);
    }
    const body = parsed.data;
    const resourceType = body.resourceType || body.type || "report";
    const id = crypto.randomUUID();
    await req.db.run(
      `insert into resources
         (id, title, description, resource_type, tags, author_id, file_name, storage_key, mime_type, byte_size, published_at, status, licence, licence_other)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_review', ?, ?)`,
      id,
      JSON.stringify({ el: body.titleEl, en: body.titleEn }),
      JSON.stringify({ el: body.descriptionEl || "", en: body.descriptionEn || "" }),
      resourceType,
      JSON.stringify(body.tags || []),
      req.user.id,
      body.fileName,
      body.fileKey,
      body.fileType || "application/octet-stream",
      body.fileSize || 0,
      body.publishedAt || new Date().toISOString(),
      body.licence,
      body.licence === "other" ? body.licenceOther || "" : null
    );
    await audit(req.db, { actorId: req.user.id, action: "create_resource", entityType: "resource", entityId: id });

    if (process.env.MODERATION_EMAIL) {
      notifyByEmail({
        to: process.env.MODERATION_EMAIL,
        titleEl: "Νέο υλικό προς έλεγχο",
        titleEn: "New material submitted for review",
        bodyEl: `${req.user.full_name} υπέβαλε «${body.titleEl}» (${resourceType}, άδεια: ${body.licence}) στη Βιβλιοθήκη γνώσης. Απαιτείται έλεγχος πριν τη δημοσίευση.`,
        bodyEn: `${req.user.full_name} submitted "${body.titleEn}" (${resourceType}, licence: ${body.licence}) to the Knowledge Library. It needs review before publication.`,
        targetPath: "/?view=admin",
      });
    } else {
      console.warn("[resources] MODERATION_EMAIL is not configured — skipping moderation email.");
    }

    const row = await req.db.get(
      `select r.*, o.name as author_organisation from resources r
       left join users au on au.id = r.author_id left join organisations o on o.id = au.organisation_id where r.id = ?`,
      id
    );
    res.status(201).json({ data: { resource: toPublicResource(row, req.user.id) } });
  })
);

const patchSchema = resourceFields.partial();

resourcesRouter.patch(
  "/:id",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    requireRole(req.user, "representative", "admin");
    const existing = await req.db.get("select * from resources where id = ?", req.params.id);
    if (!existing) return fail(res, "not_found", "Resource not found.");
    const parsed = patchSchema.safeParse(req.body || {});
    if (!parsed.success) return fail(res, "validation_error", "Please correct the highlighted fields.");
    const body = parsed.data;
    const title = JSON.parse(existing.title);
    const description = JSON.parse(existing.description || "{}");
    if (body.titleEl !== undefined) title.el = body.titleEl;
    if (body.titleEn !== undefined) title.en = body.titleEn;
    if (body.descriptionEl !== undefined) description.el = body.descriptionEl;
    if (body.descriptionEn !== undefined) description.en = body.descriptionEn;

    await req.db.run(
      "update resources set title = ?, description = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = ?",
      JSON.stringify(title),
      JSON.stringify(description),
      req.params.id
    );
    await audit(req.db, { actorId: req.user.id, action: "update_resource", entityType: "resource", entityId: req.params.id });
    const row = await req.db.get(
      `select r.*, o.name as author_organisation from resources r
       left join users au on au.id = r.author_id left join organisations o on o.id = au.organisation_id where r.id = ?`,
      req.params.id
    );
    res.json({ data: { resource: toPublicResource(row, req.user.id) } });
  })
);

const statusSchema = z.object({
  status: z.enum(["approved", "changes_requested", "rejected"]),
  moderationNote: z.string().trim().optional(),
});

// The moderation review endpoint — DREVEN is treated as the platform's
// admin-equivalent moderator, matching how case creation and user
// management are already admin-only.
resourcesRouter.patch(
  "/:id/status",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    requireRole(req.user, "admin");
    const existing = await req.db.get("select * from resources where id = ?", req.params.id);
    if (!existing) throw new ApiError("not_found", "Resource not found.");
    const parsed = statusSchema.safeParse(req.body || {});
    if (!parsed.success) return fail(res, "validation_error", "A valid status is required.");
    const { status, moderationNote } = parsed.data;

    await req.db.run(
      `update resources set status = ?, moderated_by = ?, moderated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
         moderation_note = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = ?`,
      status,
      req.user.id,
      moderationNote || null,
      req.params.id
    );
    await audit(req.db, { actorId: req.user.id, action: "update_resource_status", entityType: "resource", entityId: req.params.id, metadata: parsed.data });

    const title = JSON.parse(existing.title);
    const statusLabel = STATUS_LABELS[status] || { el: status, en: status };
    await notifyUser(req.db, {
      userId: existing.author_id,
      eventType: "resource_status_changed",
      titleEl: `Η κατάσταση του υλικού άλλαξε: ${statusLabel.el || status}`,
      titleEn: `Your submission status changed: ${statusLabel.en || status}`,
      bodyEl: moderationNote
        ? `Το υλικό «${title.el}» ${statusLabel.el || status} — ${moderationNote}`
        : `Το υλικό «${title.el}» ${statusLabel.el || status}.`,
      bodyEn: moderationNote
        ? `"${title.en}" is now ${statusLabel.en || status} — ${moderationNote}`
        : `"${title.en}" is now ${statusLabel.en || status}.`,
      targetUrl: "/?view=knowledge",
    });

    const row = await req.db.get(
      `select r.*, o.name as author_organisation from resources r
       left join users au on au.id = r.author_id left join organisations o on o.id = au.organisation_id where r.id = ?`,
      req.params.id
    );
    res.json({ data: { resource: toPublicResource(row, req.user.id) } });
  })
);

resourcesRouter.delete(
  "/:id",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    requireRole(req.user, "representative", "admin");
    await req.db.run("delete from resources where id = ?", req.params.id);
    await audit(req.db, { actorId: req.user.id, action: "delete_resource", entityType: "resource", entityId: req.params.id });
    res.json({ data: { success: true } });
  })
);
