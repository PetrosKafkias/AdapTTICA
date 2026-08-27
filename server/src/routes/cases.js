import crypto from "node:crypto";
import express from "express";
import { z } from "zod";
import { asyncRoute, fail } from "../lib/errors.js";
import { requireUser, requireRole } from "../lib/auth.js";
import { audit } from "../lib/audit.js";
import { slugify, toPublicCase, requireCaseAccess } from "../lib/caseAccess.js";
import { caseDecisionsRouter } from "./decisions.js";
import { caseWorkshopOutputsRouter } from "./workshopOutputs.js";
import { notifyByEmail } from "../lib/mailer.js";

export const casesRouter = express.Router();

// Browsing the case-study catalogue is public, matching the original local
// mock's behaviour; everything else here (creating/editing a case, its
// workspace, invitations, members and decisions) requires a signed-in user
// and is gated per-route below.

casesRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    const rows = await req.db.all(
      "select cs.*, o.name as organisation_name from case_studies cs left join organisations o on o.id = cs.organisation_id where cs.deleted_at is null order by cs.updated_at desc"
    );
    const items = await Promise.all(rows.map((row) => toPublicCase(req.db, row)));
    res.json({ data: { items } });
  })
);

const createSchema = z.object({
  titleEl: z.string().trim().min(1, "Title is required."),
  titleEn: z.string().trim().min(1, "Title is required."),
  descriptionEl: z.string().trim().optional(),
  descriptionEn: z.string().trim().optional(),
  areaEl: z.string().trim().optional(),
  areaEn: z.string().trim().optional(),
  saveAsDraft: z.boolean().optional(),
  startDate: z.string().optional(),
  targetDate: z.string().optional(),
});

casesRouter.post(
  "/",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    requireRole(req.user, "admin");
    const parsed = createSchema.safeParse(req.body || {});
    if (!parsed.success) {
      const fields = {};
      for (const issue of parsed.error.issues) fields[issue.path[0]] = issue.message;
      return fail(res, "validation_error", "Please correct the highlighted fields.", fields);
    }
    const body = parsed.data;
    const id = crypto.randomUUID();
    const slug = `${slugify(body.titleEn || body.titleEl)}-${id.slice(0, 4)}`;

    await req.db.run(
      `insert into case_studies
         (id, slug, title, description, sectors, area, organisation_id, owner_id, status, starts_on, due_on)
       values (?, ?, ?, ?, '{}', ?, ?, ?, ?, ?, ?)`,
      id,
      slug,
      JSON.stringify({ el: body.titleEl, en: body.titleEn }),
      JSON.stringify({ el: body.descriptionEl || "", en: body.descriptionEn || "" }),
      JSON.stringify({ el: body.areaEl || "", en: body.areaEn || "" }),
      req.user.organisation_id,
      req.user.id,
      body.saveAsDraft ? "draft" : "in_progress",
      body.startDate || null,
      body.targetDate || null
    );
    await req.db.run(
      "insert into case_members (case_id, user_id, role) values (?, ?, 'coordinator')",
      id,
      req.user.id
    );
    await audit(req.db, { actorId: req.user.id, action: "create_case", entityType: "case_study", entityId: id });

    const row = await req.db.get(
      "select cs.*, o.name as organisation_name from case_studies cs left join organisations o on o.id = cs.organisation_id where cs.id = ?",
      id
    );
    res.status(201).json({ data: { caseStudy: await toPublicCase(req.db, row) } });
  })
);

// The catalogue (GET /) is public; opening a specific case study's full
// detail requires a session, unlike the listing above.
casesRouter.get(
  "/:id",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    const row = await req.db.get(
      "select cs.*, o.name as organisation_name from case_studies cs left join organisations o on o.id = cs.organisation_id where cs.id = ? and cs.deleted_at is null",
      req.params.id
    );
    if (!row) return fail(res, "not_found", "Case study not found.");
    res.json({ data: { caseStudy: await toPublicCase(req.db, row) } });
  })
);

const patchSchema = z.object({
  titleEl: z.string().trim().optional(),
  titleEn: z.string().trim().optional(),
  descriptionEl: z.string().trim().optional(),
  descriptionEn: z.string().trim().optional(),
  areaEl: z.string().trim().optional(),
  areaEn: z.string().trim().optional(),
  status: z.enum(["draft", "in_progress", "under_review", "approved", "completed"]).optional(),
  targetDate: z.string().nullish(),
});

casesRouter.patch(
  "/:id",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    const existing = await requireCaseAccess(req, req.params.id, ["coordinator", "admin"]);
    const parsed = patchSchema.safeParse(req.body || {});
    if (!parsed.success) {
      const fields = {};
      for (const issue of parsed.error.issues) fields[issue.path[0]] = issue.message;
      return fail(res, "validation_error", "Please correct the highlighted fields.", fields);
    }
    const body = parsed.data;
    const title = JSON.parse(existing.title);
    const description = JSON.parse(existing.description || "{}");
    const area = JSON.parse(existing.area || "{}");
    if (body.titleEl !== undefined) title.el = body.titleEl;
    if (body.titleEn !== undefined) title.en = body.titleEn;
    if (body.descriptionEl !== undefined) description.el = body.descriptionEl;
    if (body.descriptionEn !== undefined) description.en = body.descriptionEn;
    if (body.areaEl !== undefined) area.el = body.areaEl;
    if (body.areaEn !== undefined) area.en = body.areaEn;

    await req.db.run(
      `update case_studies set
         title = ?, description = ?, area = ?,
         status = coalesce(?, status),
         due_on = coalesce(?, due_on),
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       where id = ?`,
      JSON.stringify(title),
      JSON.stringify(description),
      JSON.stringify(area),
      body.status ?? null,
      body.targetDate ?? null,
      req.params.id
    );
    await audit(req.db, { actorId: req.user.id, action: "update_case", entityType: "case_study", entityId: req.params.id });

    const row = await req.db.get(
      "select cs.*, o.name as organisation_name from case_studies cs left join organisations o on o.id = cs.organisation_id where cs.id = ?",
      req.params.id
    );
    res.json({ data: { caseStudy: await toPublicCase(req.db, row) } });
  })
);

casesRouter.delete(
  "/:id",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    await requireCaseAccess(req, req.params.id, ["coordinator", "admin"]);
    await req.db.run(
      "update case_studies set deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = ?",
      req.params.id
    );
    await audit(req.db, { actorId: req.user.id, action: "delete_case", entityType: "case_study", entityId: req.params.id });
    res.json({ data: { success: true } });
  })
);

casesRouter.get(
  "/:id/workspace",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    const row = await requireCaseAccess(req, req.params.id);
    const state = JSON.parse(row.workspace_state);
    res.json({ data: { workspace: { state, provider: row.workspace_provider }, state, provider: row.workspace_provider } });
  })
);

const workspaceSchema = z.object({ state: z.record(z.string(), z.any()).optional() });

casesRouter.patch(
  "/:id/workspace",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    const row = await requireCaseAccess(req, req.params.id, ["coordinator", "admin"]);
    const parsed = workspaceSchema.safeParse(req.body || {});
    if (!parsed.success) return fail(res, "validation_error", "Invalid workspace payload.");
    const nextState = parsed.data.state ? { ...JSON.parse(row.workspace_state), ...parsed.data.state } : JSON.parse(row.workspace_state);
    await req.db.run(
      "update case_studies set workspace_state = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = ?",
      JSON.stringify(nextState),
      req.params.id
    );
    res.json({ data: { workspace: { state: nextState, provider: row.workspace_provider }, state: nextState, provider: row.workspace_provider } });
  })
);

const inviteSchema = z.object({
  email: z.string().trim().email("Invalid email"),
  role: z.enum(["user", "representative", "coordinator"]).optional(),
  message: z.string().trim().optional(),
});

casesRouter.post(
  "/:id/invitations",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    const caseRow = await requireCaseAccess(req, req.params.id, ["representative", "coordinator", "admin"]);
    const parsed = inviteSchema.safeParse(req.body || {});
    if (!parsed.success) {
      const fields = {};
      for (const issue of parsed.error.issues) fields[issue.path[0]] = issue.message;
      return fail(res, "validation_error", "Please correct the highlighted fields.", fields);
    }
    const body = parsed.data;
    const existingUser = await req.db.get("select id from users where email = ? collate nocase", body.email);
    const id = crypto.randomUUID();
    const token = crypto.randomUUID();
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

    await req.db.run(
      `insert into invitations (id, case_id, invited_by, email, case_role, token_hash, expires_at)
       values (?, ?, ?, ?, ?, ?, ?)`,
      id,
      req.params.id,
      req.user.id,
      body.email.toLowerCase(),
      body.role || "user",
      tokenHash,
      expiresAt
    );
    await audit(req.db, { actorId: req.user.id, action: "invite_member", entityType: "case_study", entityId: req.params.id, metadata: { email: body.email } });

    // No real email provider may be configured in this environment yet
    // (server/src/lib/mailer.js logs instead of sending when it isn't) —
    // keep this console breadcrumb for local development convenience
    // alongside the real send below.
    console.log(`[invitations] ${body.email} invited to case ${req.params.id}: /?view=accept-invite&token=${token}`);

    const caseTitle = JSON.parse(caseRow.title);
    const role = body.role || "user";
    notifyByEmail({
      to: body.email,
      titleEl: `Προσκλήθηκατε στη μελέτη «${caseTitle.el}»`,
      titleEn: `You've been invited to "${caseTitle.en}"`,
      bodyEl: `Ο/Η ${req.user.full_name} σας προσκάλεσε να συμμετάσχετε στη μελέτη περίπτωσης «${caseTitle.el}» ως ${role}. ${existingUser ? "Συνδεθείτε με τον λογαριασμό σας για να την αποδεχτείτε." : "Χρειάζεται να δημιουργήσετε λογαριασμό με αυτή τη διεύθυνση email πριν την αποδεχτείτε."} Ο σύνδεσμος λήγει σε 14 ημέρες.`,
      bodyEn: `${req.user.full_name} invited you to join the case study "${caseTitle.en}" as ${role}. ${existingUser ? "Sign in to your account to accept it." : "You'll need to create an account with this email address before accepting it."} The link expires in 14 days.`,
      targetPath: `/?view=accept-invite&token=${token}`,
    });

    res.status(201).json({ data: { existingUser: Boolean(existingUser), invitationId: id } });
  })
);

casesRouter.get(
  "/:id/members",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    await requireCaseAccess(req, req.params.id);
    const rows = await req.db.all(
      `select cm.role, cm.joined_at, u.id as user_id, u.full_name, u.email,
              o.name as organisation
       from case_members cm
       join users u on u.id = cm.user_id
       left join organisations o on o.id = u.organisation_id
       where cm.case_id = ? order by cm.joined_at`,
      req.params.id
    );
    res.json({ data: { items: rows } });
  })
);

const memberPatchSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["user", "representative", "coordinator"]),
});

casesRouter.patch(
  "/:id/members",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    await requireCaseAccess(req, req.params.id, ["representative", "coordinator", "admin"]);
    const parsed = memberPatchSchema.safeParse(req.body || {});
    if (!parsed.success) return fail(res, "validation_error", "Please correct the highlighted fields.");
    await req.db.run(
      "update case_members set role = ? where case_id = ? and user_id = ?",
      parsed.data.role,
      req.params.id,
      parsed.data.userId
    );
    await audit(req.db, { actorId: req.user.id, action: "update_member_role", entityType: "case_study", entityId: req.params.id, metadata: parsed.data });
    res.json({ data: { success: true } });
  })
);

casesRouter.delete(
  "/:id/members/:userId",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    await requireCaseAccess(req, req.params.id, ["representative", "coordinator", "admin"]);
    if (req.params.userId === req.user.id) {
      return fail(res, "validation_error", "You cannot remove yourself from the case.");
    }
    const target = await req.db.get(
      "select role from case_members where case_id = ? and user_id = ?",
      req.params.id,
      req.params.userId
    );
    if (!target) return fail(res, "not_found", "This person is not a member of the case.");
    if (target.role === "coordinator") {
      const coordinatorCount = await req.db.get(
        "select count(*) as count from case_members where case_id = ? and role = 'coordinator'",
        req.params.id
      );
      if (coordinatorCount.count <= 1) {
        return fail(res, "validation_error", "A case study needs at least one coordinator.");
      }
    }
    await req.db.run("delete from case_members where case_id = ? and user_id = ?", req.params.id, req.params.userId);
    await audit(req.db, {
      actorId: req.user.id,
      action: "remove_member",
      entityType: "case_study",
      entityId: req.params.id,
      metadata: { userId: req.params.userId },
    });
    res.json({ data: { success: true } });
  })
);

casesRouter.use("/:id/decisions", caseDecisionsRouter);
casesRouter.use("/:id/workshop-outputs", caseWorkshopOutputsRouter);
