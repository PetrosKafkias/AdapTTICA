import crypto from "node:crypto";
import express from "express";
import { z } from "zod";
import { asyncRoute, fail, ApiError } from "../lib/errors.js";
import { requireUser } from "../lib/auth.js";
import { audit } from "../lib/audit.js";
import { requireCaseAccess } from "../lib/caseAccess.js";
import { notifyUser } from "../lib/notify.js";
import { notifyByEmail } from "../lib/mailer.js";

const publicStatus = { open: "voting", decided: "approved", archived: "rejected" };
const storedStatus = { voting: "open", review: "open", approved: "decided", rejected: "archived" };

function toPublicDecision(row) {
  const title = JSON.parse(row.title);
  const description = JSON.parse(row.description || "{}");
  return {
    id: row.id,
    case_id: row.case_id,
    title_el: title.el,
    title_en: title.en,
    description_el: description.el || "",
    description_en: description.en || "",
    summary_el: description.el || "",
    summary_en: description.en || "",
    creator_name: row.creator_name || "",
    support: Number(row.support || 0),
    concern: Number(row.concern || 0),
    abstain: Number(row.abstain || 0),
    status: publicStatus[row.status] || row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function requireDecision(db, id) {
  const row = await db.get("select * from decisions where id = ?", id);
  if (!row) throw new ApiError("not_found", "Decision not found.");
  return row;
}

export const caseDecisionsRouter = express.Router({ mergeParams: true });

caseDecisionsRouter.use(
  asyncRoute(async (req, _res, next) => {
    req.user = await requireUser(req);
    next();
  })
);

caseDecisionsRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    await requireCaseAccess(req, req.params.id);
    const rows = await req.db.all(
      `select d.*, u.full_name as creator_name,
        sum(case when v.value = 'support' then 1 else 0 end) as support,
        sum(case when v.value = 'concern' then 1 else 0 end) as concern,
        sum(case when v.value = 'abstain' then 1 else 0 end) as abstain
       from decisions d
       join users u on u.id = d.created_by
       left join decision_votes v on v.decision_id = d.id
       where d.case_id = ?
       group by d.id, u.full_name
       order by d.updated_at desc`,
      req.params.id
    );
    res.json({ data: { items: rows.map(toPublicDecision) } });
  })
);

const createDecisionSchema = z.object({
  titleEl: z.string().trim().min(1, "Title is required."),
  titleEn: z.string().trim().min(1, "Title is required."),
  descriptionEl: z.string().trim().optional(),
  descriptionEn: z.string().trim().optional(),
  status: z.enum(["draft", "open", "voting", "review", "approved", "rejected", "decided", "archived"]).optional(),
});

caseDecisionsRouter.post(
  "/",
  asyncRoute(async (req, res) => {
    const caseRow = await requireCaseAccess(req, req.params.id, ["representative", "coordinator", "admin"]);
    const parsed = createDecisionSchema.safeParse(req.body || {});
    if (!parsed.success) {
      const fields = {};
      for (const issue of parsed.error.issues) fields[issue.path[0]] = issue.message;
      return fail(res, "validation_error", "Please correct the highlighted fields.", fields);
    }
    const body = parsed.data;
    const id = crypto.randomUUID();
    await req.db.run(
      "insert into decisions (id, case_id, title, description, status, created_by) values (?, ?, ?, ?, ?, ?)",
      id,
      req.params.id,
      JSON.stringify({ el: body.titleEl, en: body.titleEn }),
      JSON.stringify({ el: body.descriptionEl || "", en: body.descriptionEn || "" }),
      storedStatus[body.status] || body.status || "draft",
      req.user.id
    );
    await audit(req.db, { actorId: req.user.id, action: "create_decision", entityType: "decision", entityId: id });

    const caseTitle = JSON.parse(caseRow.title);
    const participants = await req.db.all(
      `select u.id, u.email, u.full_name from case_members cm
       join users u on u.id = cm.user_id
       where cm.case_id = ? and cm.user_id != ?`,
      req.params.id,
      req.user.id
    );
    for (const participant of participants) {
      await notifyUser(req.db, {
        userId: participant.id,
        eventType: "decision_created",
        titleEl: `Νέα απόφαση στη μελέτη «${caseTitle.el}»`,
        titleEn: `New decision in "${caseTitle.en}"`,
        bodyEl: `Ο/Η ${req.user.full_name} πρόσθεσε την απόφαση «${body.titleEl}».`,
        bodyEn: `${req.user.full_name} added the decision "${body.titleEn}".`,
        targetUrl: `/?view=case&id=${req.params.id}`,
      });
      notifyByEmail({
        to: participant.email,
        titleEl: `Νέα απόφαση στη μελέτη «${caseTitle.el}»`,
        titleEn: `New decision in "${caseTitle.en}"`,
        bodyEl: `Ο/Η ${req.user.full_name} πρόσθεσε τη νέα απόφαση «${body.titleEl}» στη μελέτη περίπτωσης «${caseTitle.el}».`,
        bodyEn: `${req.user.full_name} added the new decision "${body.titleEn}" to the case study "${caseTitle.en}".`,
        targetPath: `/?view=case&id=${req.params.id}`,
      });
    }

    const row = await req.db.get("select * from decisions where id = ?", id);
    res.status(201).json({ data: { decision: toPublicDecision(row) } });
  })
);

export const decisionsRouter = express.Router();

decisionsRouter.use(
  asyncRoute(async (req, _res, next) => {
    req.user = await requireUser(req);
    next();
  })
);

decisionsRouter.get(
  "/:id/comments",
  asyncRoute(async (req, res) => {
    await requireDecision(req.db, req.params.id);
    const rows = await req.db.all(
      `select c.id, c.body, c.created_at, u.full_name as author_name
       from decision_comments c join users u on u.id = c.author_id
       where c.decision_id = ? order by c.created_at`,
      req.params.id
    );
    res.json({ data: { items: rows } });
  })
);

const commentSchema = z.object({ body: z.string().trim().min(1, "A comment cannot be empty.") });

decisionsRouter.post(
  "/:id/comments",
  asyncRoute(async (req, res) => {
    await requireDecision(req.db, req.params.id);
    const parsed = commentSchema.safeParse(req.body || {});
    if (!parsed.success) return fail(res, "validation_error", "A comment cannot be empty.", { body: "A comment cannot be empty." });
    const id = crypto.randomUUID();
    await req.db.run(
      "insert into decision_comments (id, decision_id, author_id, body) values (?, ?, ?, ?)",
      id,
      req.params.id,
      req.user.id,
      parsed.data.body
    );
    await audit(req.db, { actorId: req.user.id, action: "post_comment", entityType: "decision", entityId: req.params.id });
    const row = await req.db.get(
      `select c.id, c.body, c.created_at, u.full_name as author_name
       from decision_comments c join users u on u.id = c.author_id where c.id = ?`,
      id
    );
    res.status(201).json({ data: { comment: row } });
  })
);

const voteSchema = z.object({ value: z.union([z.string(), z.number()]) });

decisionsRouter.post(
  "/:id/vote",
  asyncRoute(async (req, res) => {
    await requireDecision(req.db, req.params.id);
    const parsed = voteSchema.safeParse(req.body || {});
    if (!parsed.success) return fail(res, "validation_error", "A vote value is required.");
    const value = String(parsed.data.value);
    await req.db.run(
      `insert into decision_votes (decision_id, user_id, value) values (?, ?, ?)
       on conflict(decision_id, user_id) do update set value = excluded.value, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
      req.params.id,
      req.user.id,
      value
    );
    await audit(req.db, { actorId: req.user.id, action: "vote", entityType: "decision", entityId: req.params.id, metadata: { value } });
    const results = await req.db.all(
      "select value, count(*) as count from decision_votes where decision_id = ? group by value",
      req.params.id
    );
    res.json({ data: { results } });
  })
);

const statusSchema = z.object({ status: z.enum(["draft", "open", "voting", "review", "approved", "rejected", "decided", "archived"]) });

decisionsRouter.patch(
  "/:id/status",
  asyncRoute(async (req, res) => {
    const decision = await requireDecision(req.db, req.params.id);
    await requireCaseAccess(req, decision.case_id, ["representative", "coordinator", "admin"]);
    const parsed = statusSchema.safeParse(req.body || {});
    if (!parsed.success) return fail(res, "validation_error", "A valid status is required.");
    await req.db.run(
      "update decisions set status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = ?",
      storedStatus[parsed.data.status] || parsed.data.status,
      req.params.id
    );
    await audit(req.db, { actorId: req.user.id, action: "update_decision_status", entityType: "decision", entityId: req.params.id, metadata: parsed.data });
    const row = await req.db.get("select * from decisions where id = ?", req.params.id);
    res.json({ data: { decision: toPublicDecision(row) } });
  })
);
