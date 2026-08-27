import crypto from "node:crypto";
import express from "express";
import { z } from "zod";
import { asyncRoute, fail, ApiError } from "../lib/errors.js";
import { requireUser } from "../lib/auth.js";
import { audit } from "../lib/audit.js";
import { requireCaseAccess } from "../lib/caseAccess.js";

const STATUS_LABELS = {
  submitted: { el: "Υποβλήθηκε για έλεγχο", en: "Submitted for review" },
  approved: { el: "Εγκρίθηκε", en: "Approved" },
  changes_requested: { el: "Απαιτούνται αλλαγές", en: "Changes required" },
};

function toPublicOutput(row) {
  const title = JSON.parse(row.title);
  const description = JSON.parse(row.description || "{}");
  const labels = STATUS_LABELS[row.status] || { el: row.status, en: row.status };
  return {
    id: row.id,
    case_id: row.case_id,
    workshop_label: row.workshop_label || "",
    title_el: title.el,
    title_en: title.en,
    description_el: description.el || "",
    description_en: description.en || "",
    status: row.status,
    status_label_el: labels.el,
    status_label_en: labels.en,
    author_name: row.author_name || "",
    author_id: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    file_name: row.file_name || "",
    file_url: row.file_key ? `/api/v1/files/${row.file_key}` : "",
    mime_type: row.mime_type || "",
    byte_size: row.byte_size || 0,
  };
}

export const caseWorkshopOutputsRouter = express.Router({ mergeParams: true });

caseWorkshopOutputsRouter.use(
  asyncRoute(async (req, _res, next) => {
    req.user = await requireUser(req);
    next();
  })
);

caseWorkshopOutputsRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    await requireCaseAccess(req, req.params.id);
    const rows = await req.db.all(
      `select w.*, u.full_name as author_name
       from workshop_outputs w join users u on u.id = w.created_by
       where w.case_id = ? order by w.updated_at desc`,
      req.params.id
    );
    res.json({ data: { items: rows.map(toPublicOutput) } });
  })
);

const createSchema = z.object({
  titleEl: z.string().trim().min(1, "Title is required."),
  titleEn: z.string().trim().min(1, "Title is required."),
  descriptionEl: z.string().trim().optional(),
  descriptionEn: z.string().trim().optional(),
  workshopLabel: z.string().trim().optional(),
  fileKey: z.string().trim().optional(),
  fileName: z.string().trim().optional(),
  mimeType: z.string().trim().optional(),
  byteSize: z.number().int().nonnegative().optional(),
});

caseWorkshopOutputsRouter.post(
  "/",
  asyncRoute(async (req, res) => {
    await requireCaseAccess(req, req.params.id, ["representative", "coordinator", "admin"]);
    const parsed = createSchema.safeParse(req.body || {});
    if (!parsed.success) {
      const fields = {};
      for (const issue of parsed.error.issues) fields[issue.path[0]] = issue.message;
      return fail(res, "validation_error", "Please correct the highlighted fields.", fields);
    }
    const body = parsed.data;
    const id = crypto.randomUUID();
    await req.db.run(
      `insert into workshop_outputs (id, case_id, workshop_label, title, description, created_by, file_key, file_name, mime_type, byte_size)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      req.params.id,
      body.workshopLabel || "",
      JSON.stringify({ el: body.titleEl, en: body.titleEn }),
      JSON.stringify({ el: body.descriptionEl || "", en: body.descriptionEn || "" }),
      req.user.id,
      body.fileKey || null,
      body.fileName || null,
      body.mimeType || null,
      body.byteSize ?? null
    );
    await audit(req.db, { actorId: req.user.id, action: "create_workshop_output", entityType: "workshop_output", entityId: id });
    const row = await req.db.get(
      `select w.*, u.full_name as author_name from workshop_outputs w join users u on u.id = w.created_by where w.id = ?`,
      id
    );
    res.status(201).json({ data: { output: toPublicOutput(row) } });
  })
);

export const workshopOutputsRouter = express.Router();

workshopOutputsRouter.use(
  asyncRoute(async (req, _res, next) => {
    req.user = await requireUser(req);
    next();
  })
);

const statusSchema = z.object({ status: z.enum(["submitted", "approved", "changes_requested"]) });

workshopOutputsRouter.patch(
  "/:id/status",
  asyncRoute(async (req, res) => {
    const existing = await req.db.get("select * from workshop_outputs where id = ?", req.params.id);
    if (!existing) throw new ApiError("not_found", "Workshop output not found.");
    await requireCaseAccess(req, existing.case_id, ["representative", "coordinator", "admin"]);
    const parsed = statusSchema.safeParse(req.body || {});
    if (!parsed.success) return fail(res, "validation_error", "A valid status is required.");
    await req.db.run(
      "update workshop_outputs set status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = ?",
      parsed.data.status,
      req.params.id
    );
    await audit(req.db, {
      actorId: req.user.id,
      action: "update_workshop_output_status",
      entityType: "workshop_output",
      entityId: req.params.id,
      metadata: parsed.data,
    });
    const row = await req.db.get(
      `select w.*, u.full_name as author_name from workshop_outputs w join users u on u.id = w.created_by where w.id = ?`,
      req.params.id
    );
    res.json({ data: { output: toPublicOutput(row) } });
  })
);

const editSchema = z.object({
  titleEl: z.string().trim().min(1, "Title is required.").optional(),
  titleEn: z.string().trim().min(1, "Title is required.").optional(),
  descriptionEl: z.string().trim().optional(),
  descriptionEn: z.string().trim().optional(),
  workshopLabel: z.string().trim().optional(),
  fileKey: z.string().trim().optional(),
  fileName: z.string().trim().optional(),
  mimeType: z.string().trim().optional(),
  byteSize: z.number().int().nonnegative().optional(),
});

workshopOutputsRouter.patch(
  "/:id",
  asyncRoute(async (req, res) => {
    const existing = await req.db.get("select * from workshop_outputs where id = ?", req.params.id);
    if (!existing) throw new ApiError("not_found", "Workshop output not found.");
    await requireCaseAccess(req, existing.case_id, ["representative", "coordinator", "admin"]);
    const parsed = editSchema.safeParse(req.body || {});
    if (!parsed.success) {
      const fields = {};
      for (const issue of parsed.error.issues) fields[issue.path[0]] = issue.message;
      return fail(res, "validation_error", "Please correct the highlighted fields.", fields);
    }
    const body = parsed.data;
    const title = JSON.parse(existing.title);
    const description = JSON.parse(existing.description || "{}");
    if (body.titleEl !== undefined) title.el = body.titleEl;
    if (body.titleEn !== undefined) title.en = body.titleEn;
    if (body.descriptionEl !== undefined) description.el = body.descriptionEl;
    if (body.descriptionEn !== undefined) description.en = body.descriptionEn;
    // A replaced file carries all four columns together (see the frontend's
    // upload-then-edit flow); omit fileKey entirely to keep the existing
    // attachment untouched, matching how the other optional fields behave.
    const fileKey = body.fileKey !== undefined ? body.fileKey : existing.file_key;
    const fileName = body.fileKey !== undefined ? body.fileName || null : existing.file_name;
    const mimeType = body.fileKey !== undefined ? body.mimeType || null : existing.mime_type;
    const byteSize = body.fileKey !== undefined ? body.byteSize ?? null : existing.byte_size;
    await req.db.run(
      `update workshop_outputs set
         title = ?, description = ?, workshop_label = coalesce(?, workshop_label),
         file_key = ?, file_name = ?, mime_type = ?, byte_size = ?,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       where id = ?`,
      JSON.stringify(title),
      JSON.stringify(description),
      body.workshopLabel ?? null,
      fileKey,
      fileName,
      mimeType,
      byteSize,
      req.params.id
    );
    await audit(req.db, {
      actorId: req.user.id,
      action: "update_workshop_output",
      entityType: "workshop_output",
      entityId: req.params.id,
    });
    const row = await req.db.get(
      `select w.*, u.full_name as author_name from workshop_outputs w join users u on u.id = w.created_by where w.id = ?`,
      req.params.id
    );
    res.json({ data: { output: toPublicOutput(row) } });
  })
);

workshopOutputsRouter.delete(
  "/:id",
  asyncRoute(async (req, res) => {
    const existing = await req.db.get("select * from workshop_outputs where id = ?", req.params.id);
    if (!existing) throw new ApiError("not_found", "Workshop output not found.");
    await requireCaseAccess(req, existing.case_id, ["representative", "coordinator", "admin"]);
    await req.db.run("delete from workshop_outputs where id = ?", req.params.id);
    await audit(req.db, {
      actorId: req.user.id,
      action: "delete_workshop_output",
      entityType: "workshop_output",
      entityId: req.params.id,
    });
    res.json({ data: { success: true } });
  })
);
