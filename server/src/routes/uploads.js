import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import multer from "multer";
import { asyncRoute, fail } from "../lib/errors.js";
import { requireUser } from "../lib/auth.js";
import { audit } from "../lib/audit.js";

export const uploadsRouter = express.Router();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_UPLOAD_DIR = path.join(__dirname, "..", "..", "uploads");
// Read lazily (not a module-level const) so tests can point this at a
// throwaway directory per run via process.env after the module has loaded.
function uploadDir() {
  return process.env.UPLOAD_DIR ? path.resolve(process.env.UPLOAD_DIR) : DEFAULT_UPLOAD_DIR;
}

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir()),
    filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error("unsupported_type"));
    }
    cb(null, true);
  },
});

uploadsRouter.post(
  "/upload",
  asyncRoute(async (req, res, next) => {
    const user = await requireUser(req);
    upload.single("file")(req, res, async (err) => {
      if (err) {
        if (err.message === "unsupported_type") return fail(res, "validation_error", "Unsupported file type.", { file: "Unsupported file type." });
        if (err.code === "LIMIT_FILE_SIZE") return fail(res, "validation_error", "File is too large.", { file: "File is too large." });
        return next(err);
      }
      if (!req.file) return fail(res, "validation_error", "A file is required.", { file: "A file is required." });

      const id = crypto.randomUUID();
      await req.db.run(
        "insert into uploads (id, owner_id, name, mime_type, byte_size, storage_path) values (?, ?, ?, ?, ?, ?)",
        id,
        user.id,
        req.file.originalname,
        req.file.mimetype,
        req.file.size,
        req.file.path
      );
      await audit(req.db, { actorId: user.id, action: "upload_file", entityType: "upload", entityId: id });

      res.status(201).json({
        data: {
          file: {
            id,
            // The resource-create and additional-material forms in the
            // vendored bundle read this upload result's "key" field (not
            // "id") to populate fileKey — without it, every real
            // submission previously failed server-side validation with
            // "fileKey: expected string, received undefined". Alias id
            // as key rather than renaming id, since GET /files/:id and
            // the audit log already key off "id".
            key: id,
            name: req.file.originalname,
            size: req.file.size,
            type: req.file.mimetype,
            url: `/api/v1/files/${id}`,
          },
        },
      });
    });
  })
);

// A file's owner uploaded it, but that's rarely who needs to open it: an
// approved Knowledge Library resource is meant to be publicly downloadable,
// and a workshop output's attachment is meant to be openable by every
// member of the case it belongs to — not just whoever happened to submit
// it. Check both of those references before falling back to "forbidden".
async function canAccessFile(db, upload, user) {
  if (upload.owner_id === user.id || user.platform_role === "admin") return true;
  const resource = await db.get("select status from resources where storage_key = ?", upload.id);
  if (resource && resource.status === "approved") return true;
  const output = await db.get("select case_id from workshop_outputs where file_key = ?", upload.id);
  if (output) {
    const membership = await db.get(
      "select 1 from case_members where case_id = ? and user_id = ?",
      output.case_id,
      user.id
    );
    if (membership) return true;
  }
  return false;
}

uploadsRouter.get(
  "/:id",
  asyncRoute(async (req, res) => {
    const user = await requireUser(req);
    const row = await req.db.get("select * from uploads where id = ?", req.params.id);
    if (!row) return fail(res, "not_found", "File not found.");
    if (!(await canAccessFile(req.db, row, user))) {
      return fail(res, "forbidden", "You do not have permission to view this file.");
    }
    res.setHeader("Content-Type", row.mime_type);
    res.setHeader("Content-Disposition", `inline; filename="${row.name.replace(/"/g, "")}"`);
    res.sendFile(row.storage_path);
  })
);
