import crypto from "node:crypto";
import express from "express";
import { z } from "zod";
import { asyncRoute, fail, ApiError } from "../lib/errors.js";
import { requireUser } from "../lib/auth.js";
import { requireCaseAccess } from "../lib/caseAccess.js";
import { audit } from "../lib/audit.js";
import { voteTally, replyCount, optionCriteriaAverages, aggregateOptionAssessment } from "../lib/contributions.js";
import { COMPARISON_CRITERIA } from "../lib/comparisonCriteria.js";
import { notifyUser } from "../lib/notify.js";
import { notifyByEmail } from "../lib/mailer.js";

// The Case Study is the platform's one collaborative workspace: everything
// in this file (Baseline, Alternative Futures, Vision Elements, Theory of
// Change, Adaptation Options, and the Journey trace) is scoped to a single
// case_id. Any authenticated user may view/propose/comment/reply/vote
// (matching the existing loose "signed-in = can read/interact" pattern
// already used for case detail/workspace elsewhere in this file's sibling
// routes); merging contributions, publishing the Shared Vision, and editing
// the Theory of Change are Coordinator/Admin-only via requireCaseAccess.
export const caseWorkflowRouter = express.Router({ mergeParams: true });

// The product-facing "Organisation coordinator" is stored as the legacy
// representative case role. Both coordinator roles manage the one regional
// journey; Participants remain read-only and the server is the authority.
const CURATOR_ROLES = ["representative", "coordinator", "admin"];
const JOURNEY_PHASES = ["phase1", "phase2", "phase3"];
const PHASE_DEFAULTS = { phase1: "completed", phase2: "current", phase3: "locked" };

async function phaseStatus(db, caseId, phase) {
  const row = await db.get("select status from case_phase_state where case_id = ? and phase = ?", caseId, phase);
  return row?.status || PHASE_DEFAULTS[phase];
}

export async function requirePhaseAccessible(req, caseId, phase) {
  const status = await phaseStatus(req.db, caseId, phase);
  if (status === "locked") {
    throw new ApiError("phase_locked", "This phase is locked. Complete the previous phase before continuing.");
  }
  return status;
}

caseWorkflowRouter.get(
  "/phases",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    await requireCaseAccess(req, req.params.id);
    const rows = await req.db.all("select * from case_phase_state where case_id = ?", req.params.id);
    const byPhase = Object.fromEntries(rows.map((row) => [row.phase, row]));
    const membership = await req.db.get(
      "select role from case_members where case_id = ? and user_id = ?",
      req.params.id,
      req.user.id
    );
    const canManage = req.user.platform_role === "admin" || membership?.role === "coordinator";
    res.json({
      data: {
        canManage,
        items: JOURNEY_PHASES.map((phase) => ({
          phase,
          status: byPhase[phase]?.status || PHASE_DEFAULTS[phase],
          updated_by: byPhase[phase]?.updated_by || null,
          updated_at: byPhase[phase]?.updated_at || null,
        })),
      },
    });
  })
);

caseWorkflowRouter.patch(
  "/phases/:phase",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    await requireCaseAccess(req, req.params.id, CURATOR_ROLES);
    if (!JOURNEY_PHASES.includes(req.params.phase)) return fail(res, "not_found", "Unknown phase.");
    const parsed = z.object({ status: z.enum(["locked", "upcoming", "current", "completed"]) }).safeParse(req.body || {});
    if (!parsed.success) return fail(res, "validation_error", "A valid phase status is required.");

    if (req.params.phase === "phase3" && parsed.data.status !== "locked") {
      const phase2 = await phaseStatus(req.db, req.params.id, "phase2");
      if (phase2 !== "completed") {
        throw new ApiError("phase_prerequisite", "Complete the Shared Vision phase before unlocking Pathway Design.");
      }
    }

    if (parsed.data.status === "current") {
      await req.db.run(
        "update case_phase_state set status = 'upcoming', updated_by = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') where case_id = ? and status = 'current' and phase <> ?",
        req.user.id,
        req.params.id,
        req.params.phase
      );
    }
    await req.db.run(
      `insert into case_phase_state (case_id, phase, status, updated_by)
       values (?, ?, ?, ?)
       on conflict(case_id, phase) do update set status = excluded.status, updated_by = excluded.updated_by,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
      req.params.id,
      req.params.phase,
      parsed.data.status,
      req.user.id
    );
    await audit(req.db, {
      actorId: req.user.id,
      action: "update_phase_status",
      entityType: "case_study",
      entityId: req.params.id,
      metadata: { phase: req.params.phase, status: parsed.data.status },
    });
    res.json({ data: { phase: req.params.phase, status: parsed.data.status } });
  })
);

function phaseForRequestPath(path) {
  if (/^\/baseline(?:\/|$)/.test(path)) return "phase1";
  if (/^\/(?:futures|vision-elements|shared-vision|theory-of-change|prioritisation)(?:\/|$)/.test(path)) return "phase2";
  if (/^\/options(?:\/|$)/.test(path)) return "phase3";
  return null;
}

// Phase access is enforced before every matching workflow endpoint. The UI
// reflects the same state, but a hidden control or direct request cannot
// bypass a locked phase.
caseWorkflowRouter.use(
  asyncRoute(async (req, _res, next) => {
    const phase = phaseForRequestPath(req.path);
    if (!phase) return next();
    req.user = await requireUser(req);
    await requireCaseAccess(req, req.params.id);
    await requirePhaseAccessible(req, req.params.id, phase);
    next();
  })
);

caseWorkflowRouter.get(
  "/phases/:phase/forum",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    await requireCaseAccess(req, req.params.id);
    if (!JOURNEY_PHASES.includes(req.params.phase)) return fail(res, "not_found", "Unknown phase.");
    await requirePhaseAccessible(req, req.params.id, req.params.phase);
    const rows = await req.db.all(
      `select c.*, u.full_name as author_name, cm.role as author_role, o.name as author_org,
              coalesce(sum(case when v.value = 1 then 1 else 0 end), 0) as upvote_count,
              coalesce(sum(case when v.value = -1 then 1 else 0 end), 0) as downvote_count,
              coalesce(max(case when v.user_id = ? then v.value end), 0) as my_vote
         from phase_forum_comments c
         join users u on u.id = c.author_id
         left join case_members cm on cm.case_id = c.case_id and cm.user_id = c.author_id
         left join organisations o on o.id = u.organisation_id
         left join phase_forum_votes v on v.comment_id = c.id
       where c.case_id = ? and c.phase = ?
       group by c.id, u.full_name, cm.role, o.name
       order by c.created_at`,
      req.user.id,
      req.params.id,
      req.params.phase
    );
    const items = rows.map((row) => ({
      id: row.id,
      parent_id: row.parent_id || null,
      author_id: row.author_id,
      author_name: row.author_name,
      author_role: row.author_role || "",
      author_org: row.author_org || "",
      body: row.body,
      created_at: row.created_at,
      upvote_count: Number(row.upvote_count || 0),
      downvote_count: Number(row.downvote_count || 0),
      score: Number(row.upvote_count || 0) - Number(row.downvote_count || 0),
      my_vote: Number(row.my_vote || 0),
    }));
    res.json({ data: { items, commentCount: items.length } });
  })
);

caseWorkflowRouter.post(
  "/phases/:phase/forum",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    await requireCaseAccess(req, req.params.id);
    if (!JOURNEY_PHASES.includes(req.params.phase)) return fail(res, "not_found", "Unknown phase.");
    await requirePhaseAccessible(req, req.params.id, req.params.phase);
    const parsed = z
      .object({ body: z.string().trim().min(1, "A comment needs some text."), parentId: z.string().trim().nullable().optional() })
      .safeParse(req.body || {});
    if (!parsed.success) return fail(res, "validation_error", "A comment needs some text.");
    if (parsed.data.parentId) {
      const parent = await req.db.get(
        "select id from phase_forum_comments where id = ? and case_id = ? and phase = ? and parent_id is null",
        parsed.data.parentId,
        req.params.id,
        req.params.phase
      );
      if (!parent) return fail(res, "not_found", "Parent comment not found in this phase.");
    }
    const id = crypto.randomUUID();
    await req.db.run(
      "insert into phase_forum_comments (id, case_id, phase, parent_id, author_id, body) values (?, ?, ?, ?, ?, ?)",
      id,
      req.params.id,
      req.params.phase,
      parsed.data.parentId || null,
      req.user.id,
      parsed.data.body
    );
    await audit(req.db, {
      actorId: req.user.id,
      action: parsed.data.parentId ? "reply_phase_forum" : "comment_phase_forum",
      entityType: "case_study",
      entityId: req.params.id,
      metadata: { phase: req.params.phase },
    });
    const row = await req.db.get(
      `select c.*, u.full_name as author_name, cm.role as author_role, o.name as author_org
         from phase_forum_comments c join users u on u.id = c.author_id
         left join case_members cm on cm.case_id = c.case_id and cm.user_id = c.author_id
         left join organisations o on o.id = u.organisation_id where c.id = ?`,
      id
    );
    res.status(201).json({
      data: {
        comment: {
          id: row.id,
          parent_id: row.parent_id || null,
          author_id: row.author_id,
          author_name: row.author_name,
          author_role: row.author_role || "",
          author_org: row.author_org || "",
          body: row.body,
          created_at: row.created_at,
          upvote_count: 0,
          downvote_count: 0,
          score: 0,
          my_vote: 0,
        },
      },
    });
  })
);

caseWorkflowRouter.post(
  "/phases/:phase/forum/:commentId/vote",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    await requireCaseAccess(req, req.params.id);
    if (!JOURNEY_PHASES.includes(req.params.phase)) return fail(res, "not_found", "Unknown phase.");
    await requirePhaseAccessible(req, req.params.id, req.params.phase);
    const parsed = z.object({ value: z.union([z.literal(-1), z.literal(0), z.literal(1)]) }).safeParse(req.body || {});
    if (!parsed.success) return fail(res, "validation_error", "Vote must be up, down or cleared.");
    const comment = await req.db.get(
      "select id from phase_forum_comments where id = ? and case_id = ? and phase = ?",
      req.params.commentId,
      req.params.id,
      req.params.phase
    );
    if (!comment) return fail(res, "not_found", "Comment not found in this phase.");

    if (parsed.data.value === 0) {
      await req.db.run("delete from phase_forum_votes where comment_id = ? and user_id = ?", req.params.commentId, req.user.id);
    } else {
      await req.db.run(
        `insert into phase_forum_votes (comment_id, user_id, value) values (?, ?, ?)
         on conflict(comment_id, user_id) do update set value = excluded.value,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
        req.params.commentId,
        req.user.id,
        parsed.data.value
      );
    }
    const totals = await req.db.get(
      `select coalesce(sum(case when value = 1 then 1 else 0 end), 0) as upvote_count,
              coalesce(sum(case when value = -1 then 1 else 0 end), 0) as downvote_count
         from phase_forum_votes where comment_id = ?`,
      req.params.commentId
    );
    await audit(req.db, {
      actorId: req.user.id,
      action: "vote_phase_forum",
      entityType: "phase_forum_comment",
      entityId: req.params.commentId,
      metadata: { phase: req.params.phase, value: parsed.data.value },
    });
    const upvotes = Number(totals.upvote_count || 0);
    const downvotes = Number(totals.downvote_count || 0);
    res.json({ data: { commentId: req.params.commentId, upvote_count: upvotes, downvote_count: downvotes, score: upvotes - downvotes, my_vote: parsed.data.value } });
  })
);

// The Prioritisation feature: participants drag-and-drop rank the actual
// Alternative Futures a coordinator/admin created for this case (a full
// ordering, not a single pick). Kept deliberately simple: no per-item
// classification or extra controls, just a position.
caseWorkflowRouter.get(
  "/prioritisation",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    await requireCaseAccess(req, req.params.id);
    await requirePhaseAccessible(req, req.params.id, "phase2");
    const [futures, mine, submitterCount] = await Promise.all([
      req.db.all(
        "select id, title, description from alternative_futures where case_id = ? and status <> 'merged' order by created_at",
        req.params.id
      ),
      req.db.all(
        "select future_id, rank_position from future_priority_rankings where case_id = ? and user_id = ? order by rank_position",
        req.params.id,
        req.user.id
      ),
      req.db.get(
        "select count(distinct user_id) as c from future_priority_rankings where case_id = ?",
        req.params.id
      ),
    ]);
    // "How others prioritised it" as a Borda-style aggregate across every
    // submitted rank position (not just who put it first) -- an item
    // consistently ranked 2nd-3rd should read as broadly liked, not the
    // same 0% as one everyone ranks last. Points per submission = N minus
    // its position (1st = N-1 points, last = 0), averaged across
    // submitters, then normalised to a 0-100% share of the max possible.
    const avgRankRows = await req.db.all(
      "select future_id, avg(rank_position) as avg_rank from future_priority_rankings where case_id = ? group by future_id",
      req.params.id
    );
    const avgRankByFuture = Object.fromEntries(avgRankRows.map((row) => [row.future_id, Number(row.avg_rank)]));
    const maxScore = Math.max(futures.length - 1, 1);
    res.json({
      data: {
        myRanking: mine.map((row) => row.future_id),
        totalSubmitters: Number(submitterCount?.c || 0),
        items: futures.map((future) => {
          const title = JSON.parse(future.title || "{}");
          const description = JSON.parse(future.description || "{}");
          const avgRank = avgRankByFuture[future.id];
          const score = avgRank === undefined ? 0 : futures.length - avgRank;
          return {
            id: future.id,
            title_el: title.el || "",
            title_en: title.en || "",
            description_el: description.el || "",
            description_en: description.en || "",
            priority_score_percent: avgRank === undefined ? 0 : Math.round((score / maxScore) * 100),
          };
        }),
      },
    });
  })
);

caseWorkflowRouter.post(
  "/prioritisation",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    await requireCaseAccess(req, req.params.id);
    await requirePhaseAccessible(req, req.params.id, "phase2");
    const parsed = z.object({ order: z.array(z.string().trim().min(1)).min(1) }).safeParse(req.body || {});
    if (!parsed.success) return fail(res, "validation_error", "Provide the ranked order of futures.");
    if (new Set(parsed.data.order).size !== parsed.data.order.length) {
      return fail(res, "validation_error", "Each future can only appear once in the ranking.");
    }
    const knownFutures = await req.db.all(
      "select id from alternative_futures where case_id = ? and status <> 'merged'",
      req.params.id
    );
    const knownIds = new Set(knownFutures.map((row) => row.id));
    if (!parsed.data.order.every((id) => knownIds.has(id))) {
      return fail(res, "validation_error", "Unknown future in the ranking.");
    }
    await req.db.exec("begin");
    try {
      await req.db.run(
        "delete from future_priority_rankings where case_id = ? and user_id = ?",
        req.params.id,
        req.user.id
      );
      for (const [index, futureId] of parsed.data.order.entries()) {
        await req.db.run(
          "insert into future_priority_rankings (case_id, user_id, future_id, rank_position) values (?, ?, ?, ?)",
          req.params.id,
          req.user.id,
          futureId,
          index + 1
        );
      }
      await req.db.exec("commit");
    } catch (error) {
      await req.db.exec("rollback");
      throw error;
    }
    await audit(req.db, {
      actorId: req.user.id,
      action: "rank_alternative_futures",
      entityType: "case_study",
      entityId: req.params.id,
    });
    res.json({ data: { myRanking: parsed.data.order } });
  })
);

// A Coordinator who closes a step must actually stop new contributions to it
// (journey doc 2.1: the facilitator "οργανώνει τη συμμετοχή"). Curators stay
// able to write so they can still merge/synthesise after closing.
export async function requireStepOpen(req, caseId, step) {
  const membership = await req.db.get(
    "select role from case_members where case_id = ? and user_id = ?",
    caseId,
    req.user.id
  );
  const isCurator = req.user.platform_role === "admin" || CURATOR_ROLES.includes(membership?.role);
  if (isCurator) return;
  const row = await req.db.get("select status from case_step_state where case_id = ? and step = ?", caseId, step);
  if (row?.status === "closed") {
    throw new ApiError("forbidden", "This activity has been closed for new contributions.");
  }
}

// In-app notifications for collaborative events (spec: notify on comments/
// replies/merges/synthesis/assessment-opening, but only email for the
// handful of events already defined elsewhere as email-worthy — being
// added to a case, a new Coordinator decision. Everything in this file
// that isn't one of those two is in-app only, no email.
async function notifyCaseMembers(db, caseId, excludeUserId, { eventType, titleEl, titleEn, bodyEl = "", bodyEn = "" }) {
  const members = await db.all("select user_id, email, full_name from case_members cm join users u on u.id = cm.user_id where cm.case_id = ?", caseId);
  const targetUrl = `/?view=case&id=${caseId}`;
  await Promise.all(
    members
      .filter((m) => m.user_id !== excludeUserId)
      .map((m) => notifyUser(db, { userId: m.user_id, eventType, titleEl, titleEn, bodyEl, bodyEn, targetUrl }))
  );
}

// ---------------------------------------------------------------------------
// Baseline / "Where Are We Now?"
// ---------------------------------------------------------------------------

caseWorkflowRouter.get(
  "/baseline",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    const caseRow = await requireCaseAccess(req, req.params.id);
    if (!caseRow.impact_id) {
      return res.json({
        data: { baseline: { primary_system: null, climate_hazards: [], linked_systems: [], relevant_stakeholders: [], key_evidence: [] } },
      });
    }
    // Phase 1 is context, not a new assessment (journey doc: "Δεν χρειάζεται
    // να ξανακάνει climate risk assessment μέσα στην πλατφόρμα") -- so the
    // vulnerabilities / affected assets / RCCAP measures shown here are read
    // from what admins already curated on the System and the Impact, with
    // the impact-specific text preferred and the system-wide text as the
    // fallback so a Phase 1 is never blank just because one impact is new.
    const impact = await req.db.get(
      `select i.*, s.name as system_name, s.description as system_description,
              s.key_vulnerabilities as system_vulnerabilities, s.rccap_priorities as system_rccap
       from impacts i join systems s on s.id = i.system_id where i.id = ?`,
      caseRow.impact_id
    );
    const [hazards, linkedSystems, stakeholders, evidence] = await Promise.all([
      req.db.all(
        `select distinct h.id, h.key, h.name from case_hazards ch join hazards h on h.id = ch.hazard_id where ch.case_id = ?
         union
         select distinct h.id, h.key, h.name from impact_hazards ih join hazards h on h.id = ih.hazard_id where ih.impact_id = ?`,
        req.params.id,
        caseRow.impact_id
      ),
      req.db.all(
        `select distinct s.id, s.key, s.name from case_linked_systems cls join systems s on s.id = cls.system_id where cls.case_id = ?
         union
         select distinct s.id, s.key, s.name from impact_linked_systems ils join systems s on s.id = ils.system_id where ils.impact_id = ?`,
        req.params.id,
        caseRow.impact_id
      ),
      req.db.all(
        `select distinct u.id, u.full_name, o.name as organisation from case_members cm
         join users u on u.id = cm.user_id left join organisations o on o.id = u.organisation_id
         where cm.case_id = ?`,
        req.params.id
      ),
      req.db.all(
        `select id, title, resource_type, storage_key, file_name
           from resources where case_id = ? and status = 'approved'`,
        req.params.id
      ),
    ]);
    // Prefer the impact's own curated text, fall back to the system's.
    const bilingual = (json) => {
      const parsed = JSON.parse(json || "{}");
      return { el: parsed.el || "", en: parsed.en || "" };
    };
    const pick = (impactJson, systemJson) => {
      const own = bilingual(impactJson);
      const inherited = bilingual(systemJson);
      return { el: own.el || inherited.el, en: own.en || inherited.en };
    };
    const context = pick(impact.description, impact.system_description);
    const vulnerabilities = pick(impact.vulnerabilities, impact.system_vulnerabilities);
    const affectedAssets = bilingual(impact.affected_assets);
    const rccapMeasures = bilingual(impact.system_rccap);
    res.json({
      data: {
        baseline: {
          primary_system: { id: impact.system_id, name_el: JSON.parse(impact.system_name).el, name_en: JSON.parse(impact.system_name).en },
          climate_impact: { id: impact.id, title_el: JSON.parse(impact.title).el, title_en: JSON.parse(impact.title).en },
          context_el: context.el,
          context_en: context.en,
          vulnerabilities_el: vulnerabilities.el,
          vulnerabilities_en: vulnerabilities.en,
          affected_assets_el: affectedAssets.el,
          affected_assets_en: affectedAssets.en,
          rccap_measures_el: rccapMeasures.el,
          rccap_measures_en: rccapMeasures.en,
          climate_hazards: hazards.map((h) => ({ id: h.id, key: h.key, name_el: JSON.parse(h.name).el, name_en: JSON.parse(h.name).en })),
          linked_systems: linkedSystems.map((s) => ({ id: s.id, key: s.key, name_el: JSON.parse(s.name).el, name_en: JSON.parse(s.name).en })),
          relevant_stakeholders: stakeholders.map((s) => ({ id: s.id, full_name: s.full_name, organisation: s.organisation || "" })),
          key_evidence: evidence.map((e) => {
            const title = JSON.parse(e.title);
            return {
              id: e.id,
              title_el: title.el,
              title_en: title.en,
              type: e.resource_type,
              file_name: e.file_name || "",
              file_url: e.storage_key ? `/api/v1/files/${e.storage_key}` : "",
            };
          }),
        },
      },
    });
  })
);

// The Baseline itself is not a voting exercise (spec) -- just a comment/
// flag thread. A comment can optionally be flagged is_suggestion, which
// the Coordinator can accept (folding it into their own editing) or
// reject, without ever silently dropping what a Participant raised. The
// Theory of Change step needs the exact same shape (spec: ToC must be
// "editable and connected, not static"), so both are backed by one
// section-scoped table (`section_comments`) rather than duplicating it.
function registerSectionComments(router, section, auditAction) {
  router.get(
    `/${section}/comments`,
    asyncRoute(async (req, res) => {
      req.user = await requireUser(req);
      await requireCaseAccess(req, req.params.id);
      const rows = await req.db.all(
        `select c.*, u.full_name as author_name, cm.role as author_role, o.name as author_org
           from section_comments c
           join users u on u.id = c.author_id
           left join case_members cm on cm.user_id = c.author_id and cm.case_id = c.case_id
           left join organisations o on o.id = u.organisation_id
         where c.case_id = ? and c.section = ? order by c.created_at`,
        req.params.id,
        section
      );
      res.json({
        data: {
          items: rows.map((r) => ({
            id: r.id,
            author_id: r.author_id,
            author_name: r.author_name,
            author_role: r.author_role || "",
            author_org: r.author_org || "",
            body: r.body,
            is_suggestion: Boolean(r.is_suggestion),
            status: r.status,
            created_at: r.created_at,
          })),
        },
      });
    })
  );

  router.post(
    `/${section}/comments`,
    asyncRoute(async (req, res) => {
      req.user = await requireUser(req);
      await requireCaseAccess(req, req.params.id);
      const parsed = z
        .object({ body: z.string().trim().min(1, "A comment needs some text."), isSuggestion: z.boolean().optional() })
        .safeParse(req.body || {});
      if (!parsed.success) return fail(res, "validation_error", "A comment needs some text.");
      const id = crypto.randomUUID();
      await req.db.run(
        "insert into section_comments (id, case_id, section, author_id, body, is_suggestion) values (?, ?, ?, ?, ?, ?)",
        id,
        req.params.id,
        section,
        req.user.id,
        parsed.data.body,
        parsed.data.isSuggestion ? 1 : 0
      );
      await audit(req.db, { actorId: req.user.id, action: auditAction, entityType: "case_study", entityId: req.params.id });
      const row = await req.db.get(
        "select c.*, u.full_name as author_name from section_comments c join users u on u.id = c.author_id where c.id = ?",
        id
      );
      res.status(201).json({
        data: {
          comment: {
            id: row.id,
            author_id: row.author_id,
            author_name: row.author_name,
            body: row.body,
            is_suggestion: Boolean(row.is_suggestion),
            status: row.status,
            created_at: row.created_at,
          },
        },
      });
    })
  );

  router.patch(
    `/${section}/comments/:commentId`,
    asyncRoute(async (req, res) => {
      req.user = await requireUser(req);
      await requireCaseAccess(req, req.params.id, CURATOR_ROLES);
      const parsed = z.object({ status: z.enum(["accepted", "rejected"]) }).safeParse(req.body || {});
      if (!parsed.success) return fail(res, "validation_error", "A valid status is required.");
      await req.db.run(
        "update section_comments set status = ? where id = ? and case_id = ? and section = ?",
        parsed.data.status,
        req.params.commentId,
        req.params.id,
        section
      );
      const row = await req.db.get(
        "select c.*, u.full_name as author_name from section_comments c join users u on u.id = c.author_id where c.id = ?",
        req.params.commentId
      );
      if (!row) return fail(res, "not_found", "Comment not found.");
      res.json({
        data: {
          comment: {
            id: row.id,
            author_id: row.author_id,
            author_name: row.author_name,
            body: row.body,
            is_suggestion: Boolean(row.is_suggestion),
            status: row.status,
            created_at: row.created_at,
          },
        },
      });
    })
  );
}

registerSectionComments(caseWorkflowRouter, "baseline", "comment_baseline");
registerSectionComments(caseWorkflowRouter, "toc", "comment_toc");

// ---------------------------------------------------------------------------
// Step activation -- the Coordinator opens/closes each step as a live
// activity; Participants see what's currently active rather than every
// step being equally "on" at once (spec: "Understand that Alternative
// Futures is currently active").
// ---------------------------------------------------------------------------

const WORKFLOW_STEPS = ["futures", "vision", "toc", "options", "pathways", "compare", "outcome"];
const STEP_EVENT_COPY = {
  futures: { el: "Η δραστηριότητα «Εναλλακτικά μέλλοντα» είναι πλέον ανοιχτή", en: "The Alternative Futures activity is now open" },
  vision: { el: "Η δραστηριότητα «Κοινό όραμα» είναι πλέον ανοιχτή", en: "The Shared Vision activity is now open" },
  toc: { el: "Η Θεωρία Αλλαγής είναι πλέον ανοιχτή για συνεισφορές", en: "The Theory of Change is now open for contributions" },
  options: { el: "Η δραστηριότητα «Επιλογές προσαρμογής» είναι πλέον ανοιχτή", en: "The Adaptation Options activity is now open" },
  pathways: { el: "Ο σχεδιασμός διαδρομών προσαρμογής είναι πλέον ανοιχτός", en: "Adaptation Pathway design is now open" },
  compare: { el: "Η αξιολόγηση διαδρομών είναι πλέον ανοιχτή", en: "Pathway assessment is now open" },
  outcome: { el: "Η τελική κατεύθυνση είναι έτοιμη για επισκόπηση", en: "The final direction is ready for review" },
};

caseWorkflowRouter.get(
  "/steps",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    await requireCaseAccess(req, req.params.id);
    const rows = await req.db.all("select * from case_step_state where case_id = ?", req.params.id);
    const byStep = Object.fromEntries(rows.map((r) => [r.step, r]));
    const items = WORKFLOW_STEPS.map((step) => ({
      step,
      status: byStep[step]?.status || "not_started",
      opened_by: byStep[step]?.opened_by || null,
      opened_at: byStep[step]?.opened_at || null,
    }));
    res.json({ data: { items } });
  })
);

caseWorkflowRouter.patch(
  "/steps/:step",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    await requireCaseAccess(req, req.params.id, CURATOR_ROLES);
    if (!WORKFLOW_STEPS.includes(req.params.step)) return fail(res, "not_found", "Unknown step.");
    const parsed = z.object({ status: z.enum(["not_started", "active", "closed"]) }).safeParse(req.body || {});
    if (!parsed.success) return fail(res, "validation_error", "A valid status is required.");
    await req.db.run(
      `insert into case_step_state (case_id, step, status, opened_by, opened_at) values (?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
       on conflict(case_id, step) do update set status = excluded.status, opened_by = excluded.opened_by, opened_at = excluded.opened_at`,
      req.params.id,
      req.params.step,
      parsed.data.status,
      req.user.id
    );
    await audit(req.db, { actorId: req.user.id, action: "update_step_status", entityType: "case_study", entityId: req.params.id, metadata: { step: req.params.step, status: parsed.data.status } });
    if (parsed.data.status === "active") {
      const copy = STEP_EVENT_COPY[req.params.step];
      await notifyCaseMembers(req.db, req.params.id, req.user.id, {
        eventType: "step_active",
        titleEl: copy.el,
        titleEn: copy.en,
      });
    }
    res.json({ data: { step: req.params.step, status: parsed.data.status } });
  })
);

// ---------------------------------------------------------------------------
// Step 2: Alternative Futures
// ---------------------------------------------------------------------------

async function toPublicFuture(db, row) {
  const get = (col) => JSON.parse(row[col] || "{}");
  const [tally, replies] = await Promise.all([
    voteTally(db, "future_votes", "future_id", row.id),
    replyCount(db, "future_replies", "future_id", row.id),
  ]);
  return {
    review_status: row.review_status || "draft",
    id: row.id,
    case_id: row.case_id,
    author_id: row.created_by,
    author_name: row.author_name || "",
    author_role: row.author_role || "",
    title_el: get("title").el,
    title_en: get("title").en,
    description_el: get("description").el || "",
    description_en: get("description").en || "",
    benefits_el: get("benefits").el || "",
    benefits_en: get("benefits").en || "",
    barriers_el: get("barriers").el || "",
    barriers_en: get("barriers").en || "",
    trade_offs_el: get("trade_offs").el || "",
    trade_offs_en: get("trade_offs").en || "",
    opportunities_el: get("opportunities").el || "",
    opportunities_en: get("opportunities").en || "",
    transformative_potential_el: get("transformative_potential").el || "",
    transformative_potential_en: get("transformative_potential").en || "",
    status: row.status,
    merged_into_id: row.merged_into_id,
    highlighted: Boolean(row.highlighted),
    group_label: row.group_label || "",
    image_key: row.image_key || null,
    image_url: row.image_key ? `/api/v1/files/${row.image_key}` : "",
    agree_count: tally.agree_count,
    disagree_count: tally.disagree_count,
    reply_count: replies,
    created_by: row.created_by,
    created_at: row.created_at,
  };
}

const FUTURE_SELECT =
  "select f.*, u.full_name as author_name, cm.role as author_role from alternative_futures f join users u on u.id = f.created_by left join case_members cm on cm.case_id = f.case_id and cm.user_id = f.created_by";

caseWorkflowRouter.get(
  "/futures",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    await requireCaseAccess(req, req.params.id);
    const rows = await req.db.all(`${FUTURE_SELECT} where f.case_id = ? order by f.created_at`, req.params.id);
    const items = await Promise.all(rows.map((row) => toPublicFuture(req.db, row)));
    res.json({ data: { items } });
  })
);

const futureSchema = z.object({
  titleEl: z.string().trim().min(1, "Title is required."),
  titleEn: z.string().trim().min(1, "Title is required."),
  descriptionEl: z.string().trim().optional(),
  descriptionEn: z.string().trim().optional(),
  imageKey: z.string().trim().nullable().optional(),
});

// Only a Coordinator/Admin creates Possible Futures -- participants react
// to them (vote/reply) rather than adding their own. The form itself is
// just Title, Description and an optional image.
caseWorkflowRouter.post(
  "/futures",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    await requireCaseAccess(req, req.params.id, CURATOR_ROLES);
    await requireStepOpen(req, req.params.id, "futures");
    const parsed = futureSchema.safeParse(req.body || {});
    if (!parsed.success) {
      const fields = {};
      for (const issue of parsed.error.issues) fields[issue.path[0]] = issue.message;
      return fail(res, "validation_error", "Please correct the highlighted fields.", fields);
    }
    const body = parsed.data;
    if (body.imageKey) {
      const upload = await req.db.get("select id from uploads where id = ?", body.imageKey);
      if (!upload) return fail(res, "validation_error", "Image not found. Upload it again.");
    }
    const id = crypto.randomUUID();
    await req.db.run(
      `insert into alternative_futures (id, case_id, title, description, image_key, created_by)
       values (?, ?, ?, ?, ?, ?)`,
      id,
      req.params.id,
      JSON.stringify({ el: body.titleEl, en: body.titleEn }),
      JSON.stringify({ el: body.descriptionEl || "", en: body.descriptionEn || "" }),
      body.imageKey || null,
      req.user.id
    );
    await audit(req.db, { actorId: req.user.id, action: "propose_alternative_future", entityType: "alternative_future", entityId: id, metadata: { caseId: req.params.id } });
    const row = await req.db.get(`${FUTURE_SELECT} where f.id = ?`, id);
    res.status(201).json({ data: { future: await toPublicFuture(req.db, row) } });
  })
);

caseWorkflowRouter.get(
  "/futures/:futureId/replies",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    await requireCaseAccess(req, req.params.id);
    const rows = await req.db.all(
      `select r.*, u.full_name as author_name, cm.role as author_role, o.name as author_org
         from future_replies r
         join users u on u.id = r.author_id
         left join case_members cm on cm.user_id = r.author_id and cm.case_id = ?
         left join organisations o on o.id = u.organisation_id
       where r.future_id = ? order by r.created_at`,
      req.params.id,
      req.params.futureId
    );
    res.json({
      data: {
        items: rows.map((row) => ({
          id: row.id,
          author_id: row.author_id,
          author_name: row.author_name,
          author_role: row.author_role || "",
          author_org: row.author_org || "",
          body: row.body,
          created_at: row.created_at,
        })),
      },
    });
  })
);

caseWorkflowRouter.post(
  "/futures/:futureId/replies",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    await requireCaseAccess(req, req.params.id);
    await requireStepOpen(req, req.params.id, "futures");
    const future = await req.db.get("select * from alternative_futures where id = ? and case_id = ?", req.params.futureId, req.params.id);
    if (!future) return fail(res, "not_found", "Alternative future not found.");
    const parsed = z.object({ body: z.string().trim().min(1, "A reply needs some text.") }).safeParse(req.body || {});
    if (!parsed.success) return fail(res, "validation_error", "A reply needs some text.");
    const id = crypto.randomUUID();
    await req.db.run("insert into future_replies (id, future_id, author_id, body) values (?, ?, ?, ?)", id, req.params.futureId, req.user.id, parsed.data.body);
    await audit(req.db, { actorId: req.user.id, action: "reply_alternative_future", entityType: "alternative_future", entityId: req.params.futureId });
    if (future.created_by !== req.user.id) {
      await notifyUser(req.db, {
        userId: future.created_by,
        eventType: "reply_future",
        titleEl: `${req.user.full_name} απάντησε στο εναλλακτικό σας μέλλον`,
        titleEn: `${req.user.full_name} replied to your alternative future`,
        targetUrl: `/?view=case&id=${req.params.id}`,
      });
    }
    const row = await req.db.get(`${FUTURE_SELECT} where f.id = ?`, req.params.futureId);
    res.status(201).json({ data: { future: await toPublicFuture(req.db, row) } });
  })
);

caseWorkflowRouter.post(
  "/futures/:futureId/vote",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    await requireCaseAccess(req, req.params.id);
    await requireStepOpen(req, req.params.id, "futures");
    const future = await req.db.get("select id from alternative_futures where id = ? and case_id = ?", req.params.futureId, req.params.id);
    if (!future) return fail(res, "not_found", "Alternative future not found.");
    const parsed = z.object({ value: z.enum(["agree", "disagree"]) }).safeParse(req.body || {});
    if (!parsed.success) return fail(res, "validation_error", "A valid vote is required.");
    await req.db.run(
      `insert into future_votes (future_id, user_id, value) values (?, ?, ?)
       on conflict(future_id, user_id) do update set value = excluded.value, created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
      req.params.futureId,
      req.user.id,
      parsed.data.value
    );
    const row = await req.db.get(`${FUTURE_SELECT} where f.id = ?`, req.params.futureId);
    res.json({ data: { future: await toPublicFuture(req.db, row) } });
  })
);

const futurePatchSchema = z.object({
  groupLabel: z.string().trim().nullable().optional(),
  titleEl: z.string().trim().min(1).optional(),
  titleEn: z.string().trim().min(1).optional(),
  descriptionEl: z.string().trim().optional(),
  descriptionEn: z.string().trim().optional(),
  benefitsEl: z.string().trim().optional(),
  benefitsEn: z.string().trim().optional(),
  barriersEl: z.string().trim().optional(),
  barriersEn: z.string().trim().optional(),
  imageKey: z.string().trim().nullable().optional(),
});

caseWorkflowRouter.patch(
  "/futures/:futureId",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    await requireCaseAccess(req, req.params.id, CURATOR_ROLES);
    const future = await req.db.get("select * from alternative_futures where id = ? and case_id = ?", req.params.futureId, req.params.id);
    if (!future) return fail(res, "not_found", "Alternative future not found.");
    const parsed = futurePatchSchema.safeParse(req.body || {});
    if (!parsed.success) return fail(res, "validation_error", "Please correct the highlighted fields.");
    const { groupLabel, titleEl, titleEn, descriptionEl, descriptionEn, benefitsEl, benefitsEn, barriersEl, barriersEn, imageKey } = parsed.data;
    if (imageKey) {
      const upload = await req.db.get("select id from uploads where id = ?", imageKey);
      if (!upload) return fail(res, "validation_error", "Image not found. Upload it again.");
    }
    const mergeField = (existingJson, updates) => {
      const hasUpdate = Object.values(updates).some((v) => v !== undefined);
      if (!hasUpdate) return existingJson;
      const existing = JSON.parse(existingJson || "{}");
      return JSON.stringify({ el: updates.el ?? existing.el ?? "", en: updates.en ?? existing.en ?? "" });
    };
    await req.db.run(
      `update alternative_futures set
         group_label = coalesce(?, group_label),
         title = ?,
         description = ?,
         benefits = ?,
         barriers = ?,
         image_key = coalesce(?, image_key)
       where id = ?`,
      groupLabel === undefined ? null : groupLabel,
      mergeField(future.title, { el: titleEl, en: titleEn }),
      mergeField(future.description, { el: descriptionEl, en: descriptionEn }),
      mergeField(future.benefits, { el: benefitsEl, en: benefitsEn }),
      mergeField(future.barriers, { el: barriersEl, en: barriersEn }),
      imageKey === undefined ? null : imageKey,
      req.params.futureId
    );
    await audit(req.db, { actorId: req.user.id, action: "update_alternative_future", entityType: "alternative_future", entityId: req.params.futureId });
    const row = await req.db.get(`${FUTURE_SELECT} where f.id = ?`, req.params.futureId);
    res.json({ data: { future: await toPublicFuture(req.db, row) } });
  })
);

caseWorkflowRouter.delete(
  "/futures/:futureId",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    await requireCaseAccess(req, req.params.id, CURATOR_ROLES);
    const future = await req.db.get("select id from alternative_futures where id = ? and case_id = ?", req.params.futureId, req.params.id);
    if (!future) return fail(res, "not_found", "Alternative future not found.");
    await req.db.run("delete from alternative_futures where id = ?", req.params.futureId);
    await audit(req.db, { actorId: req.user.id, action: "delete_alternative_future", entityType: "alternative_future", entityId: req.params.futureId });
    res.json({ data: { success: true } });
  })
);

// Merging similar Futures preserves the originals -- 'merged' status plus
// merged_into_id, never a destructive delete -- so authorship and the
// original text stay inspectable (spec: "Preserve the original
// contributions when merging").
caseWorkflowRouter.post(
  "/futures/:futureId/merge",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    await requireCaseAccess(req, req.params.id, CURATOR_ROLES);
    const parsed = z.object({ targetId: z.string().min(1, "A target future is required.") }).safeParse(req.body || {});
    if (!parsed.success) return fail(res, "validation_error", "A target future is required.");
    const [source, target] = await Promise.all([
      req.db.get("select * from alternative_futures where id = ? and case_id = ?", req.params.futureId, req.params.id),
      req.db.get("select id from alternative_futures where id = ? and case_id = ?", parsed.data.targetId, req.params.id),
    ]);
    if (!source || !target) return fail(res, "not_found", "Alternative future not found.");
    if (source.id === target.id) return fail(res, "validation_error", "Cannot merge a future into itself.");
    await req.db.run("update alternative_futures set status = 'merged', merged_into_id = ? where id = ?", target.id, source.id);
    await audit(req.db, {
      actorId: req.user.id,
      action: "merge_alternative_future",
      entityType: "alternative_future",
      entityId: source.id,
      metadata: { mergedIntoId: target.id },
    });
    if (source.created_by !== req.user.id) {
      await notifyUser(req.db, {
        userId: source.created_by,
        eventType: "merge_future",
        titleEl: "Το εναλλακτικό σας μέλλον συγχωνεύτηκε με μια παρόμοια πρόταση",
        titleEn: "Your alternative future was merged with a similar proposal",
        targetUrl: `/?view=case&id=${req.params.id}`,
      });
    }
    const row = await req.db.get(`${FUTURE_SELECT} where f.id = ?`, source.id);
    res.json({ data: { future: await toPublicFuture(req.db, row) } });
  })
);

// ---------------------------------------------------------------------------
// Step 3: Shared Vision, built from Vision Elements
// ---------------------------------------------------------------------------

async function toPublicVisionElement(db, row) {
  const [tally, replies] = await Promise.all([
    voteTally(db, "vision_element_votes", "vision_element_id", row.id),
    replyCount(db, "vision_element_replies", "vision_element_id", row.id),
  ]);
  return {
    review_status: row.review_status || "draft",
    id: row.id,
    case_id: row.case_id,
    future_id: row.future_id,
    author_id: row.author_id,
    author_name: row.author_name || "",
    author_role: row.author_role || "",
    title_el: row.title_el || "",
    title_en: row.title_en || "",
    description_el: row.description_el || "",
    description_en: row.description_en || "",
    body: row.body,
    image_key: row.image_key || null,
    image_url: row.image_key ? `/api/v1/files/${row.image_key}` : "",
    status: row.status,
    merged_into_id: row.merged_into_id,
    highlighted: Boolean(row.highlighted),
    group_label: row.group_label || "",
    include_in_synthesis: Boolean(row.include_in_synthesis),
    agree_count: tally.agree_count,
    disagree_count: tally.disagree_count,
    reply_count: replies,
    created_at: row.created_at,
  };
}

caseWorkflowRouter.get(
  "/vision-elements",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    await requireCaseAccess(req, req.params.id);
    const conditions = ["ve.case_id = ?"];
    const params = [req.params.id];
    if (req.query.futureId) {
      conditions.push("ve.future_id = ?");
      params.push(req.query.futureId);
    }
    const rows = await req.db.all(
      `select ve.*, u.full_name as author_name, cm.role as author_role from vision_elements ve join users u on u.id = ve.author_id
       left join case_members cm on cm.case_id = ve.case_id and cm.user_id = ve.author_id
       where ${conditions.join(" and ")} order by ve.created_at`,
      ...params
    );
    const items = await Promise.all(rows.map((row) => toPublicVisionElement(req.db, row)));
    res.json({ data: { items } });
  })
);

const visionElementSchema = z.object({
  futureId: z.string().trim().optional(),
  titleEl: z.string().trim().min(1, "A shared vision needs a title."),
  titleEn: z.string().trim().min(1, "A shared vision needs a title."),
  descriptionEl: z.string().trim().optional(),
  descriptionEn: z.string().trim().optional(),
  imageKey: z.string().trim().optional(),
});

// Only a Coordinator/Admin publishes a Shared Vision idea here (title,
// description, optional image) -- everyone else in the case can only
// agree/disagree and reply to it, the same restriction already applied to
// Possible Futures.
caseWorkflowRouter.post(
  "/vision-elements",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    await requireCaseAccess(req, req.params.id, CURATOR_ROLES);
    await requireStepOpen(req, req.params.id, "vision");
    const parsed = visionElementSchema.safeParse(req.body || {});
    if (!parsed.success) return fail(res, "validation_error", "A shared vision needs a title.");
    const body = parsed.data;
    if (body.imageKey) {
      const upload = await req.db.get("select id from uploads where id = ?", body.imageKey);
      if (!upload) return fail(res, "validation_error", "Image not found. Upload it again.");
    }
    const id = crypto.randomUUID();
    await req.db.run(
      `insert into vision_elements (id, case_id, future_id, author_id, title_el, title_en, description_el, description_en, image_key, body)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      req.params.id,
      body.futureId || null,
      req.user.id,
      body.titleEl,
      body.titleEn,
      body.descriptionEl || "",
      body.descriptionEn || "",
      body.imageKey || null,
      body.descriptionEl || body.titleEl
    );
    await audit(req.db, { actorId: req.user.id, action: "propose_vision_element", entityType: "vision_element", entityId: id, metadata: { caseId: req.params.id } });
    const row = await req.db.get(
      "select ve.*, u.full_name as author_name, cm.role as author_role from vision_elements ve join users u on u.id = ve.author_id left join case_members cm on cm.case_id = ve.case_id and cm.user_id = ve.author_id where ve.id = ?",
      id
    );
    res.status(201).json({ data: { visionElement: await toPublicVisionElement(req.db, row) } });
  })
);

caseWorkflowRouter.get(
  "/vision-elements/:elementId/replies",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    await requireCaseAccess(req, req.params.id);
    const rows = await req.db.all(
      `select r.*, u.full_name as author_name, cm.role as author_role, o.name as author_org
         from vision_element_replies r
         join users u on u.id = r.author_id
         left join case_members cm on cm.user_id = r.author_id and cm.case_id = ?
         left join organisations o on o.id = u.organisation_id
       where r.vision_element_id = ? order by r.created_at`,
      req.params.id,
      req.params.elementId
    );
    res.json({
      data: {
        items: rows.map((row) => ({
          id: row.id,
          author_id: row.author_id,
          author_name: row.author_name,
          author_role: row.author_role || "",
          author_org: row.author_org || "",
          body: row.body,
          created_at: row.created_at,
        })),
      },
    });
  })
);

caseWorkflowRouter.post(
  "/vision-elements/:elementId/replies",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    await requireCaseAccess(req, req.params.id);
    await requireStepOpen(req, req.params.id, "vision");
    const element = await req.db.get("select * from vision_elements where id = ? and case_id = ?", req.params.elementId, req.params.id);
    if (!element) return fail(res, "not_found", "Vision element not found.");
    const parsed = z.object({ body: z.string().trim().min(1, "A reply needs some text.") }).safeParse(req.body || {});
    if (!parsed.success) return fail(res, "validation_error", "A reply needs some text.");
    const id = crypto.randomUUID();
    await req.db.run(
      "insert into vision_element_replies (id, vision_element_id, author_id, body) values (?, ?, ?, ?)",
      id,
      req.params.elementId,
      req.user.id,
      parsed.data.body
    );
    await audit(req.db, { actorId: req.user.id, action: "reply_vision_element", entityType: "vision_element", entityId: req.params.elementId });
    if (element.author_id !== req.user.id) {
      await notifyUser(req.db, {
        userId: element.author_id,
        eventType: "reply_vision_element",
        titleEl: `${req.user.full_name} σχολίασε την ιδέα σας για το κοινό όραμα`,
        titleEn: `${req.user.full_name} commented on your Vision Element`,
        targetUrl: `/?view=case&id=${req.params.id}`,
      });
    }
    const row = await req.db.get(
      "select ve.*, u.full_name as author_name, cm.role as author_role from vision_elements ve join users u on u.id = ve.author_id left join case_members cm on cm.case_id = ve.case_id and cm.user_id = ve.author_id where ve.id = ?",
      req.params.elementId
    );
    res.status(201).json({ data: { visionElement: await toPublicVisionElement(req.db, row) } });
  })
);

caseWorkflowRouter.post(
  "/vision-elements/:elementId/vote",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    await requireCaseAccess(req, req.params.id);
    await requireStepOpen(req, req.params.id, "vision");
    const element = await req.db.get("select id from vision_elements where id = ? and case_id = ?", req.params.elementId, req.params.id);
    if (!element) return fail(res, "not_found", "Vision element not found.");
    const parsed = z.object({ value: z.enum(["agree", "disagree"]) }).safeParse(req.body || {});
    if (!parsed.success) return fail(res, "validation_error", "A valid vote is required.");
    await req.db.run(
      `insert into vision_element_votes (vision_element_id, user_id, value) values (?, ?, ?)
       on conflict(vision_element_id, user_id) do update set value = excluded.value, created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
      req.params.elementId,
      req.user.id,
      parsed.data.value
    );
    const row = await req.db.get(
      "select ve.*, u.full_name as author_name, cm.role as author_role from vision_elements ve join users u on u.id = ve.author_id left join case_members cm on cm.case_id = ve.case_id and cm.user_id = ve.author_id where ve.id = ?",
      req.params.elementId
    );
    res.json({ data: { visionElement: await toPublicVisionElement(req.db, row) } });
  })
);

caseWorkflowRouter.patch(
  "/vision-elements/:elementId",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    await requireCaseAccess(req, req.params.id);
    const element = await req.db.get("select * from vision_elements where id = ? and case_id = ?", req.params.elementId, req.params.id);
    if (!element) return fail(res, "not_found", "Vision element not found.");
    const isOwner = element.author_id === req.user.id;
    const membership = await req.db.get("select role from case_members where case_id = ? and user_id = ?", req.params.id, req.user.id);
    const isCurator = req.user.platform_role === "admin" || CURATOR_ROLES.includes(membership?.role);
    if (!isOwner && !isCurator) throw new ApiError("forbidden", "You do not have permission to edit this vision element.");
    const parsed = z
      .object({
        titleEl: z.string().trim().min(1).optional(),
        titleEn: z.string().trim().min(1).optional(),
        descriptionEl: z.string().trim().optional(),
        descriptionEn: z.string().trim().optional(),
        imageKey: z.string().trim().nullable().optional(),
        status: z.enum(["proposed", "archived"]).optional(),
        highlighted: z.boolean().optional(),
        groupLabel: z.string().trim().nullable().optional(),
        includeInSynthesis: z.boolean().optional(),
      })
      .safeParse(req.body || {});
    if (!parsed.success) return fail(res, "validation_error", "Please correct the highlighted fields.");
    const { titleEl, titleEn, descriptionEl, descriptionEn, imageKey, status, highlighted, groupLabel, includeInSynthesis } = parsed.data;
    if (
      (titleEl !== undefined || titleEn !== undefined || descriptionEl !== undefined || descriptionEn !== undefined || imageKey !== undefined ||
        status || highlighted !== undefined || groupLabel !== undefined || includeInSynthesis !== undefined) &&
      !isCurator
    ) {
      throw new ApiError("forbidden", "Only a coordinator can curate a vision element.");
    }
    if (imageKey) {
      const upload = await req.db.get("select id from uploads where id = ?", imageKey);
      if (!upload) return fail(res, "validation_error", "Image not found. Upload it again.");
    }
    const nextDescriptionEl = descriptionEl ?? element.description_el;
    const nextDescriptionEn = descriptionEn ?? element.description_en;
    await req.db.run(
      `update vision_elements set title_el = coalesce(?, title_el), title_en = coalesce(?, title_en),
         description_el = coalesce(?, description_el), description_en = coalesce(?, description_en),
         body = coalesce(?, body), image_key = coalesce(?, image_key), status = coalesce(?, status),
         highlighted = coalesce(?, highlighted), group_label = coalesce(?, group_label),
         include_in_synthesis = coalesce(?, include_in_synthesis)
       where id = ?`,
      titleEl ?? null,
      titleEn ?? null,
      descriptionEl ?? null,
      descriptionEn ?? null,
      nextDescriptionEl || nextDescriptionEn || titleEl || titleEn || null,
      imageKey === undefined ? null : imageKey,
      status ?? null,
      highlighted === undefined ? null : highlighted ? 1 : 0,
      groupLabel === undefined ? null : groupLabel,
      includeInSynthesis === undefined ? null : includeInSynthesis ? 1 : 0,
      req.params.elementId
    );
    const row = await req.db.get(
      "select ve.*, u.full_name as author_name, cm.role as author_role from vision_elements ve join users u on u.id = ve.author_id left join case_members cm on cm.case_id = ve.case_id and cm.user_id = ve.author_id where ve.id = ?",
      req.params.elementId
    );
    res.json({ data: { visionElement: await toPublicVisionElement(req.db, row) } });
  })
);

caseWorkflowRouter.delete(
  "/vision-elements/:elementId",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    await requireCaseAccess(req, req.params.id, CURATOR_ROLES);
    const element = await req.db.get("select id from vision_elements where id = ? and case_id = ?", req.params.elementId, req.params.id);
    if (!element) return fail(res, "not_found", "Vision element not found.");
    await req.db.run("delete from vision_elements where id = ?", req.params.elementId);
    await audit(req.db, { actorId: req.user.id, action: "delete_vision_element", entityType: "vision_element", entityId: req.params.elementId });
    res.json({ data: { success: true } });
  })
);

// Merging two similar ideas: sets the source's status to 'merged' and
// points it at the target — the facilitator/Coordinator composes the final
// Shared Vision from the agreed elements, so this is Coordinator/Admin-only.
caseWorkflowRouter.post(
  "/vision-elements/:elementId/merge",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    await requireCaseAccess(req, req.params.id, CURATOR_ROLES);
    const parsed = z.object({ targetId: z.string().min(1, "A target vision element is required.") }).safeParse(req.body || {});
    if (!parsed.success) return fail(res, "validation_error", "A target vision element is required.");
    const [source, target] = await Promise.all([
      req.db.get("select * from vision_elements where id = ? and case_id = ?", req.params.elementId, req.params.id),
      req.db.get("select id from vision_elements where id = ? and case_id = ?", parsed.data.targetId, req.params.id),
    ]);
    if (!source || !target) return fail(res, "not_found", "Vision element not found.");
    if (source.id === target.id) return fail(res, "validation_error", "Cannot merge a vision element into itself.");
    await req.db.run("update vision_elements set status = 'merged', merged_into_id = ? where id = ?", target.id, source.id);
    await audit(req.db, {
      actorId: req.user.id,
      action: "merge_vision_element",
      entityType: "vision_element",
      entityId: source.id,
      metadata: { mergedIntoId: target.id },
    });
    if (source.author_id !== req.user.id) {
      await notifyUser(req.db, {
        userId: source.author_id,
        eventType: "merge_vision_element",
        titleEl: "Η ιδέα σας συγχωνεύτηκε με μια παρόμοια πρόταση",
        titleEn: "Your Vision Element was merged with a similar proposal",
        targetUrl: `/?view=case&id=${req.params.id}`,
      });
    }
    const row = await req.db.get(
      "select ve.*, u.full_name as author_name, cm.role as author_role from vision_elements ve join users u on u.id = ve.author_id left join case_members cm on cm.case_id = ve.case_id and cm.user_id = ve.author_id where ve.id = ?",
      source.id
    );
    res.json({ data: { visionElement: await toPublicVisionElement(req.db, row) } });
  })
);

// The Shared Vision is a distinct published artifact "built from" a
// Coordinator-selected set of Vision Elements (those marked
// include_in_synthesis) -- never a single freeform text field maintained
// independently of the stakeholder contributions.
function toPublicSharedVision(row) {
  if (!row) return null;
  return {
    review_status: row.review_status || "draft",
    id: row.id,
    case_id: row.case_id,
    summary_el: row.summary_el,
    summary_en: row.summary_en,
    source_element_ids: JSON.parse(row.source_element_ids || "[]"),
    published_by: row.published_by,
    published_at: row.published_at,
  };
}

caseWorkflowRouter.get(
  "/shared-vision",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    await requireCaseAccess(req, req.params.id);
    const row = await req.db.get("select * from shared_visions where case_id = ?", req.params.id);
    res.json({ data: { sharedVision: toPublicSharedVision(row) } });
  })
);

const sharedVisionSchema = z.object({
  summaryEl: z.string().trim().min(1, "A summary is required."),
  summaryEn: z.string().trim().min(1, "A summary is required."),
  sourceElementIds: z.array(z.string()).min(1, "Select at least one Vision Element to build the Shared Vision from."),
});

caseWorkflowRouter.put(
  "/shared-vision",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    await requireCaseAccess(req, req.params.id, CURATOR_ROLES);
    const parsed = sharedVisionSchema.safeParse(req.body || {});
    if (!parsed.success) {
      const fields = {};
      for (const issue of parsed.error.issues) fields[issue.path[0]] = issue.message;
      return fail(res, "validation_error", "Please correct the highlighted fields.", fields);
    }
    const body = parsed.data;
    const existing = await req.db.get("select id from shared_visions where case_id = ?", req.params.id);
    if (existing) {
      await req.db.run(
        `update shared_visions set summary_el = ?, summary_en = ?, source_element_ids = ?, published_by = ?, published_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         where case_id = ?`,
        body.summaryEl,
        body.summaryEn,
        JSON.stringify(body.sourceElementIds),
        req.user.id,
        req.params.id
      );
    } else {
      await req.db.run(
        `insert into shared_visions (id, case_id, summary_el, summary_en, source_element_ids, published_by) values (?, ?, ?, ?, ?, ?)`,
        crypto.randomUUID(),
        req.params.id,
        body.summaryEl,
        body.summaryEn,
        JSON.stringify(body.sourceElementIds),
        req.user.id
      );
    }
    await audit(req.db, { actorId: req.user.id, action: "publish_shared_vision", entityType: "case_study", entityId: req.params.id });
    // Publishing the Shared Vision is a Coordinator decision -- one of the
    // events this platform emails for, not just an in-app ping.
    await notifyCaseMembers(req.db, req.params.id, req.user.id, {
      eventType: "shared_vision_published",
      titleEl: "Δημοσιεύτηκε το Κοινό Όραμα",
      titleEn: "The Shared Vision has been published",
      bodyEl: `Χτίστηκε από ${body.sourceElementIds.length} προτάσεις των εμπλεκόμενων φορέων.`,
      bodyEn: `Built from ${body.sourceElementIds.length} stakeholder Vision Elements.`,
    });
    const members = await req.db.all("select u.email, u.full_name from case_members cm join users u on u.id = cm.user_id where cm.case_id = ? and cm.user_id != ?", req.params.id, req.user.id);
    members.forEach((m) =>
      notifyByEmail({
        to: m.email,
        titleEl: "Δημοσιεύτηκε το Κοινό Όραμα",
        titleEn: "The Shared Vision has been published",
        bodyEl: `Ο συντονιστής δημοσίευσε το Κοινό Όραμα, χτισμένο από ${body.sourceElementIds.length} προτάσεις των εμπλεκόμενων φορέων.`,
        bodyEn: `The Coordinator published the Shared Vision, built from ${body.sourceElementIds.length} stakeholder Vision Elements.`,
        targetPath: `/?view=case&id=${req.params.id}`,
      })
    );
    const row = await req.db.get("select * from shared_visions where case_id = ?", req.params.id);
    res.json({ data: { sharedVision: toPublicSharedVision(row) } });
  })
);

// ---------------------------------------------------------------------------
// Step 4: Theory of Change — built from Baseline + agreed Vision Elements
// ---------------------------------------------------------------------------

async function toPublicToC(db, row) {
  if (!row) return null;
  const get = (col) => JSON.parse(row[col] || "{}");
  const cs = get("current_state"),
    df = get("desired_future"),
    rt = get("required_transformations"),
    io = get("intermediate_outcomes"),
    ec = get("enabling_conditions");
  const [tally, replies] = await Promise.all([
    voteTally(db, "toc_votes", "case_id", row.case_id),
    replyCount(db, "toc_replies", "case_id", row.case_id),
  ]);
  return {
    review_status: row.review_status || "draft",
    id: row.id,
    case_id: row.case_id,
    current_state_el: cs.el || "",
    current_state_en: cs.en || "",
    desired_future_el: df.el || "",
    desired_future_en: df.en || "",
    required_transformations_el: rt.el || "",
    required_transformations_en: rt.en || "",
    intermediate_outcomes_el: io.el || "",
    intermediate_outcomes_en: io.en || "",
    enabling_conditions_el: ec.el || "",
    enabling_conditions_en: ec.en || "",
    image_key: row.image_key || null,
    image_url: row.image_key ? `/api/v1/files/${row.image_key}` : "",
    agree_count: tally.agree_count,
    disagree_count: tally.disagree_count,
    reply_count: replies,
    updated_by: row.updated_by,
    updated_at: row.updated_at,
  };
}

// "Το Theory of Change πρέπει να παίρνει στοιχεία αυτόματα από όσα έχουν
// προηγηθεί ... Δεν χρειάζεται να είναι καινούριο ανεξάρτητο exercise από
// το μηδέν" (journey doc). So when no row exists yet this seeds:
//   Current Challenge  <- the case's own Climate Impact (Phase 1)
//   Desired Future     <- the published Shared Vision (Phase 2.3), or the
//                         top-agreed Vision Element while it's unpublished
// Light prepopulation, not a hard copy: once a ToC row exists, later edits
// to the Baseline/Vision never overwrite what the Coordinator wrote.
async function computeToCDefaults(req) {
  const [caseRow, sharedVision] = await Promise.all([
    req.db.get(
      `select i.title as impact_title from case_studies cs
       left join impacts i on i.id = cs.impact_id where cs.id = ?`,
      req.params.id
    ),
    req.db.get("select summary_el, summary_en from shared_visions where case_id = ?", req.params.id),
  ]);
  const impactTitle = caseRow?.impact_title ? JSON.parse(caseRow.impact_title) : { el: "", en: "" };

  let desiredFuture = { el: sharedVision?.summary_el || "", en: sharedVision?.summary_en || "" };
  if (!desiredFuture.el && !desiredFuture.en) {
    const topElement = await req.db.get(
      `select ve.body from vision_elements ve
       left join vision_element_votes v on v.vision_element_id = ve.id and v.value = 'agree'
       where ve.case_id = ? and ve.status != 'merged'
       group by ve.id order by count(v.value) desc, ve.created_at limit 1`,
      req.params.id
    );
    desiredFuture = { el: topElement?.body || "", en: topElement?.body || "" };
  }

  return {
    current_state: JSON.stringify({ el: impactTitle.el || "", en: impactTitle.en || "" }),
    desired_future: JSON.stringify(desiredFuture),
    required_transformations: JSON.stringify({ el: "", en: "" }),
    intermediate_outcomes: JSON.stringify({ el: "", en: "" }),
    enabling_conditions: JSON.stringify({ el: "", en: "" }),
  };
}

caseWorkflowRouter.get(
  "/theory-of-change",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    await requireCaseAccess(req, req.params.id);
    const row = await req.db.get("select * from theory_of_change_entries where case_id = ?", req.params.id);
    if (row) return res.json({ data: { theoryOfChange: await toPublicToC(req.db, row) } });
    const defaults = await computeToCDefaults(req);
    res.json({ data: { theoryOfChange: await toPublicToC(req.db, { id: null, case_id: req.params.id, ...defaults, updated_by: null, updated_at: null }) } });
  })
);

const tocSchema = z.object({
  currentStateEl: z.string().trim().optional(),
  currentStateEn: z.string().trim().optional(),
  desiredFutureEl: z.string().trim().optional(),
  desiredFutureEn: z.string().trim().optional(),
  requiredTransformationsEl: z.string().trim().optional(),
  requiredTransformationsEn: z.string().trim().optional(),
  intermediateOutcomesEl: z.string().trim().optional(),
  intermediateOutcomesEn: z.string().trim().optional(),
  enablingConditionsEl: z.string().trim().optional(),
  enablingConditionsEn: z.string().trim().optional(),
  imageKey: z.string().trim().nullable().optional(),
});

caseWorkflowRouter.put(
  "/theory-of-change",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    await requireCaseAccess(req, req.params.id, CURATOR_ROLES);
    const parsed = tocSchema.safeParse(req.body || {});
    if (!parsed.success) return fail(res, "validation_error", "Please correct the highlighted fields.");
    const body = parsed.data;
    if (body.imageKey) {
      const upload = await req.db.get("select id from uploads where id = ?", body.imageKey);
      if (!upload) return fail(res, "validation_error", "Image not found. Upload it again.");
    }
    const existing = await req.db.get("select * from theory_of_change_entries where case_id = ?", req.params.id);
    const base = existing || (await computeToCDefaults(req));
    const merge = (col, elKey, enKey) => {
      const current = JSON.parse(base[col] || "{}");
      return JSON.stringify({ el: body[elKey] ?? current.el ?? "", en: body[enKey] ?? current.en ?? "" });
    };
    const currentState = merge("current_state", "currentStateEl", "currentStateEn");
    const desiredFuture = merge("desired_future", "desiredFutureEl", "desiredFutureEn");
    const requiredTransformations = merge("required_transformations", "requiredTransformationsEl", "requiredTransformationsEn");
    const intermediateOutcomes = merge("intermediate_outcomes", "intermediateOutcomesEl", "intermediateOutcomesEn");
    const enablingConditions = merge("enabling_conditions", "enablingConditionsEl", "enablingConditionsEn");
    const imageKey = body.imageKey === undefined ? (existing?.image_key ?? null) : body.imageKey;
    if (existing) {
      await req.db.run(
        `update theory_of_change_entries set current_state=?, desired_future=?, required_transformations=?,
           intermediate_outcomes=?, enabling_conditions=?, image_key=?, updated_by=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
         where case_id = ?`,
        currentState,
        desiredFuture,
        requiredTransformations,
        intermediateOutcomes,
        enablingConditions,
        imageKey,
        req.user.id,
        req.params.id
      );
    } else {
      await req.db.run(
        `insert into theory_of_change_entries
           (id, case_id, current_state, desired_future, required_transformations, intermediate_outcomes, enabling_conditions, image_key, updated_by)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        crypto.randomUUID(),
        req.params.id,
        currentState,
        desiredFuture,
        requiredTransformations,
        intermediateOutcomes,
        enablingConditions,
        imageKey,
        req.user.id
      );
    }
    await audit(req.db, { actorId: req.user.id, action: "update_theory_of_change", entityType: "case_study", entityId: req.params.id });
    const row = await req.db.get("select * from theory_of_change_entries where case_id = ?", req.params.id);
    res.json({ data: { theoryOfChange: await toPublicToC(req.db, row) } });
  })
);

// A single Theory of Change entry has no per-item list to react to like
// Futures/Vision Elements do, but participants still need a way to
// agree/disagree and reply to it -- keyed by case_id (not the entry's own
// id) since a ToC row may not exist yet the first time someone opens it.
caseWorkflowRouter.post(
  "/theory-of-change/vote",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    await requireCaseAccess(req, req.params.id);
    const parsed = z.object({ value: z.enum(["agree", "disagree"]) }).safeParse(req.body || {});
    if (!parsed.success) return fail(res, "validation_error", "A valid vote is required.");
    await req.db.run(
      `insert into toc_votes (case_id, user_id, value) values (?, ?, ?)
       on conflict(case_id, user_id) do update set value = excluded.value, created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
      req.params.id,
      req.user.id,
      parsed.data.value
    );
    const tally = await voteTally(req.db, "toc_votes", "case_id", req.params.id);
    res.json({ data: tally });
  })
);

caseWorkflowRouter.get(
  "/theory-of-change/replies",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    await requireCaseAccess(req, req.params.id);
    const rows = await req.db.all(
      `select r.*, u.full_name as author_name, cm.role as author_role, o.name as author_org
         from toc_replies r
         join users u on u.id = r.author_id
         left join case_members cm on cm.user_id = r.author_id and cm.case_id = ?
         left join organisations o on o.id = u.organisation_id
       where r.case_id = ? order by r.created_at`,
      req.params.id,
      req.params.id
    );
    res.json({
      data: {
        items: rows.map((row) => ({
          id: row.id,
          author_id: row.author_id,
          author_name: row.author_name,
          author_role: row.author_role || "",
          author_org: row.author_org || "",
          body: row.body,
          created_at: row.created_at,
        })),
      },
    });
  })
);

caseWorkflowRouter.post(
  "/theory-of-change/replies",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    await requireCaseAccess(req, req.params.id);
    const parsed = z.object({ body: z.string().trim().min(1, "A reply needs some text.") }).safeParse(req.body || {});
    if (!parsed.success) return fail(res, "validation_error", "A reply needs some text.");
    const id = crypto.randomUUID();
    await req.db.run(
      "insert into toc_replies (id, case_id, author_id, body) values (?, ?, ?, ?)",
      id,
      req.params.id,
      req.user.id,
      parsed.data.body
    );
    await audit(req.db, { actorId: req.user.id, action: "reply_theory_of_change", entityType: "case_study", entityId: req.params.id });
    res.status(201).json({ data: { success: true } });
  })
);

// ---------------------------------------------------------------------------
// Step 5: Adaptation Options — same propose/comment/reply/agree-disagree/
// merge pattern as Futures and Vision Elements.
// ---------------------------------------------------------------------------

async function toPublicOption(db, row, userId) {
  const get = (col) => JSON.parse(row[col] || "{}");
  const [tally, replies, supportCount, mySupport, assessment, myAssessmentRow] = await Promise.all([
    voteTally(db, "option_votes", "option_id", row.id),
    replyCount(db, "option_replies", "option_id", row.id),
    db.get("select count(*) as c from option_supports where option_id = ?", row.id).then((r) => r.c),
    userId ? db.get("select 1 from option_supports where option_id = ? and user_id = ?", row.id, userId) : null,
    aggregateOptionAssessment(db, row.id),
    userId ? db.get("select * from option_assessments where option_id = ? and user_id = ?", row.id, userId) : null,
  ]);
  return {
    review_status: row.review_status || "draft",
    id: row.id,
    case_id: row.case_id,
    author_id: row.author_id,
    author_name: row.author_name || "",
    title_el: get("title").el,
    title_en: get("title").en,
    description_el: get("description").el || "",
    description_en: get("description").en || "",
    benefits_el: get("benefits").el || "",
    benefits_en: get("benefits").en || "",
    barriers_el: get("barriers").el || "",
    barriers_en: get("barriers").en || "",
    enabling_conditions_el: get("enabling_conditions").el || "",
    enabling_conditions_en: get("enabling_conditions").en || "",
    co_benefits_el: get("co_benefits").el || "",
    co_benefits_en: get("co_benefits").en || "",
    trade_offs_el: get("trade_offs").el || "",
    trade_offs_en: get("trade_offs").en || "",
    maladaptation_risks_el: get("maladaptation_risks").el || "",
    maladaptation_risks_en: get("maladaptation_risks").en || "",
    transformative_potential_el: get("transformative_potential").el || "",
    transformative_potential_en: get("transformative_potential").en || "",
    status: row.status,
    merged_into_id: row.merged_into_id,
    highlighted: Boolean(row.highlighted),
    group_label: row.group_label || "",
    ready_for_pathway: Boolean(row.ready_for_pathway),
    agree_count: tally.agree_count,
    disagree_count: tally.disagree_count,
    reply_count: replies,
    // Step 1 identification: a reference (PESPKA) measure vs a
    // stakeholder-proposed one, its time-horizon tag, and how many people
    // find it worth considering -- distinct from "vote" (agree/disagree),
    // which this UI no longer uses for adaptation options.
    source: row.source || "stakeholder",
    time_horizon: row.time_horizon || null,
    pespka_evidence: row.pespka_evidence ? JSON.parse(row.pespka_evidence) : null,
    support_count: supportCount,
    my_support: Boolean(mySupport),
    shortlisted: Boolean(row.shortlisted),
    // Step 2 assessment: the collective (mode-based) Low/Medium/High per
    // criterion, the resulting automatic priority score, how many
    // stakeholders have assessed it, and (when a user is known) their own
    // assessment alongside the collective one.
    assessment_count: assessment.count,
    collective_assessment: assessment.collective,
    priority_score: assessment.score,
    my_assessment: myAssessmentRow
      ? {
          effectiveness: myAssessmentRow.effectiveness,
          feasibility: myAssessmentRow.feasibility,
          co_benefits: myAssessmentRow.co_benefits,
          transformative_potential: myAssessmentRow.transformative_potential,
          robust_across_futures: myAssessmentRow.robust_across_futures,
          comment: myAssessmentRow.comment || "",
        }
      : null,
    created_at: row.created_at,
  };
}

caseWorkflowRouter.get(
  "/options",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    await requireCaseAccess(req, req.params.id);
    const rows = await req.db.all(
      "select o.*, u.full_name as author_name from adaptation_options o join users u on u.id = o.author_id where o.case_id = ? order by o.created_at",
      req.params.id
    );
    const items = await Promise.all(rows.map((row) => toPublicOption(req.db, row, req.user.id)));
    res.json({ data: { items } });
  })
);

const optionSchema = z.object({
  titleEl: z.string().trim().min(1, "Title is required."),
  titleEn: z.string().trim().min(1, "Title is required."),
  descriptionEl: z.string().trim().optional(),
  descriptionEn: z.string().trim().optional(),
  benefitsEl: z.string().trim().optional(),
  benefitsEn: z.string().trim().optional(),
  barriersEl: z.string().trim().optional(),
  barriersEn: z.string().trim().optional(),
  enablingConditionsEl: z.string().trim().optional(),
  enablingConditionsEn: z.string().trim().optional(),
  coBenefitsEl: z.string().trim().optional(),
  coBenefitsEn: z.string().trim().optional(),
  tradeOffsEl: z.string().trim().optional(),
  tradeOffsEn: z.string().trim().optional(),
  maladaptationRisksEl: z.string().trim().optional(),
  maladaptationRisksEn: z.string().trim().optional(),
  transformativePotentialEl: z.string().trim().optional(),
  transformativePotentialEn: z.string().trim().optional(),
  timeHorizon: z.enum(["short", "long"]).optional(),
});

caseWorkflowRouter.post(
  "/options",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    await requireCaseAccess(req, req.params.id);
    await requireStepOpen(req, req.params.id, "options");
    const parsed = optionSchema.safeParse(req.body || {});
    if (!parsed.success) {
      const fields = {};
      for (const issue of parsed.error.issues) fields[issue.path[0]] = issue.message;
      return fail(res, "validation_error", "Please correct the highlighted fields.", fields);
    }
    const body = parsed.data;
    const id = crypto.randomUUID();
    await req.db.run(
      `insert into adaptation_options
         (id, case_id, author_id, title, description, benefits, barriers, enabling_conditions, co_benefits, trade_offs, maladaptation_risks, transformative_potential, source, time_horizon)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'stakeholder', ?)`,
      id,
      req.params.id,
      req.user.id,
      JSON.stringify({ el: body.titleEl, en: body.titleEn }),
      JSON.stringify({ el: body.descriptionEl || "", en: body.descriptionEn || "" }),
      JSON.stringify({ el: body.benefitsEl || "", en: body.benefitsEn || "" }),
      JSON.stringify({ el: body.barriersEl || "", en: body.barriersEn || "" }),
      JSON.stringify({ el: body.enablingConditionsEl || "", en: body.enablingConditionsEn || "" }),
      JSON.stringify({ el: body.coBenefitsEl || "", en: body.coBenefitsEn || "" }),
      JSON.stringify({ el: body.tradeOffsEl || "", en: body.tradeOffsEn || "" }),
      JSON.stringify({ el: body.maladaptationRisksEl || "", en: body.maladaptationRisksEn || "" }),
      JSON.stringify({ el: body.transformativePotentialEl || "", en: body.transformativePotentialEn || "" }),
      body.timeHorizon || null
    );
    await audit(req.db, { actorId: req.user.id, action: "propose_adaptation_option", entityType: "adaptation_option", entityId: id, metadata: { caseId: req.params.id } });
    const row = await req.db.get(
      "select o.*, u.full_name as author_name from adaptation_options o join users u on u.id = o.author_id where o.id = ?",
      id
    );
    res.status(201).json({ data: { option: await toPublicOption(req.db, row, req.user.id) } });
  })
);

caseWorkflowRouter.get(
  "/options/:optionId/replies",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    await requireCaseAccess(req, req.params.id);
    const rows = await req.db.all(
      `select r.*, u.full_name as author_name, cm.role as author_role, o.name as author_org
         from option_replies r
         join users u on u.id = r.author_id
         left join case_members cm on cm.user_id = r.author_id and cm.case_id = ?
         left join organisations o on o.id = u.organisation_id
       where r.option_id = ? order by r.created_at`,
      req.params.id,
      req.params.optionId
    );
    res.json({
      data: {
        items: rows.map((row) => ({
          id: row.id,
          author_id: row.author_id,
          author_name: row.author_name,
          author_role: row.author_role || "",
          author_org: row.author_org || "",
          body: row.body,
          created_at: row.created_at,
        })),
      },
    });
  })
);

caseWorkflowRouter.post(
  "/options/:optionId/replies",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    await requireCaseAccess(req, req.params.id);
    await requireStepOpen(req, req.params.id, "options");
    const option = await req.db.get("select * from adaptation_options where id = ? and case_id = ?", req.params.optionId, req.params.id);
    if (!option) return fail(res, "not_found", "Option not found.");
    const parsed = z.object({ body: z.string().trim().min(1, "A reply needs some text.") }).safeParse(req.body || {});
    if (!parsed.success) return fail(res, "validation_error", "A reply needs some text.");
    const id = crypto.randomUUID();
    await req.db.run("insert into option_replies (id, option_id, author_id, body) values (?, ?, ?, ?)", id, req.params.optionId, req.user.id, parsed.data.body);
    await audit(req.db, { actorId: req.user.id, action: "reply_adaptation_option", entityType: "adaptation_option", entityId: req.params.optionId });
    if (option.author_id !== req.user.id) {
      await notifyUser(req.db, {
        userId: option.author_id,
        eventType: "reply_adaptation_option",
        titleEl: `${req.user.full_name} σχολίασε την επιλογή προσαρμογής σας`,
        titleEn: `${req.user.full_name} commented on your Adaptation Option`,
        targetUrl: `/?view=case&id=${req.params.id}`,
      });
    }
    const row = await req.db.get(
      "select o.*, u.full_name as author_name from adaptation_options o join users u on u.id = o.author_id where o.id = ?",
      req.params.optionId
    );
    res.status(201).json({ data: { option: await toPublicOption(req.db, row, req.user.id) } });
  })
);

caseWorkflowRouter.post(
  "/options/:optionId/vote",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    await requireCaseAccess(req, req.params.id);
    await requireStepOpen(req, req.params.id, "options");
    const option = await req.db.get("select id from adaptation_options where id = ? and case_id = ?", req.params.optionId, req.params.id);
    if (!option) return fail(res, "not_found", "Option not found.");
    const parsed = z.object({ value: z.enum(["agree", "disagree"]) }).safeParse(req.body || {});
    if (!parsed.success) return fail(res, "validation_error", "A valid vote is required.");
    await req.db.run(
      `insert into option_votes (option_id, user_id, value) values (?, ?, ?)
       on conflict(option_id, user_id) do update set value = excluded.value, created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
      req.params.optionId,
      req.user.id,
      parsed.data.value
    );
    const row = await req.db.get(
      "select o.*, u.full_name as author_name from adaptation_options o join users u on u.id = o.author_id where o.id = ?",
      req.params.optionId
    );
    res.json({ data: { option: await toPublicOption(req.db, row, req.user.id) } });
  })
);

// Step 1's "Support" -- "this is relevant and worth considering", a plain
// per-user toggle, deliberately not the agree/disagree pair above: this UI
// never lets a stakeholder register disagreement with a candidate measure,
// only that it is (or isn't, on a second click) worth their support.
caseWorkflowRouter.post(
  "/options/:optionId/support",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    await requireCaseAccess(req, req.params.id);
    const option = await req.db.get("select id from adaptation_options where id = ? and case_id = ?", req.params.optionId, req.params.id);
    if (!option) return fail(res, "not_found", "Option not found.");
    const existing = await req.db.get(
      "select 1 from option_supports where option_id = ? and user_id = ?",
      req.params.optionId,
      req.user.id
    );
    if (existing) {
      await req.db.run("delete from option_supports where option_id = ? and user_id = ?", req.params.optionId, req.user.id);
    } else {
      await req.db.run("insert into option_supports (option_id, user_id) values (?, ?)", req.params.optionId, req.user.id);
    }
    await audit(req.db, {
      actorId: req.user.id,
      action: existing ? "unsupport_adaptation_option" : "support_adaptation_option",
      entityType: "adaptation_option",
      entityId: req.params.optionId,
    });
    const row = await req.db.get(
      "select o.*, u.full_name as author_name from adaptation_options o join users u on u.id = o.author_id where o.id = ?",
      req.params.optionId
    );
    res.json({ data: { option: await toPublicOption(req.db, row, req.user.id) } });
  })
);

// Step 2's structured assessment -- one upserted row per stakeholder per
// option. The response carries both the collective (mode-based) result and
// this user's own submission, so the UI can show "Your assessment" next to
// "Collective assessment" without a second request.
const optionAssessmentSchema = z.object({
  effectiveness: z.enum(["low", "medium", "high"]),
  feasibility: z.enum(["low", "medium", "high"]),
  coBenefits: z.enum(["low", "medium", "high"]),
  transformativePotential: z.enum(["low", "medium", "high"]),
  robustAcrossFutures: z.enum(["most", "some", "dependent"]),
  comment: z.string().trim().max(2000).optional(),
});

caseWorkflowRouter.post(
  "/options/:optionId/assessments",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    await requireCaseAccess(req, req.params.id);
    const option = await req.db.get("select id from adaptation_options where id = ? and case_id = ?", req.params.optionId, req.params.id);
    if (!option) return fail(res, "not_found", "Option not found.");
    const parsed = optionAssessmentSchema.safeParse(req.body || {});
    if (!parsed.success) return fail(res, "validation_error", "Please correct the highlighted fields.");
    const body = parsed.data;
    await req.db.run(
      `insert into option_assessments
         (id, option_id, user_id, effectiveness, feasibility, co_benefits, transformative_potential, robust_across_futures, comment)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?)
       on conflict(option_id, user_id) do update set
         effectiveness = excluded.effectiveness, feasibility = excluded.feasibility,
         co_benefits = excluded.co_benefits, transformative_potential = excluded.transformative_potential,
         robust_across_futures = excluded.robust_across_futures, comment = excluded.comment,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
      crypto.randomUUID(),
      req.params.optionId,
      req.user.id,
      body.effectiveness,
      body.feasibility,
      body.coBenefits,
      body.transformativePotential,
      body.robustAcrossFutures,
      body.comment || ""
    );
    await audit(req.db, { actorId: req.user.id, action: "assess_adaptation_option", entityType: "adaptation_option", entityId: req.params.optionId });
    const row = await req.db.get(
      "select o.*, u.full_name as author_name from adaptation_options o join users u on u.id = o.author_id where o.id = ?",
      req.params.optionId
    );
    res.json({ data: { option: await toPublicOption(req.db, row, req.user.id) } });
  })
);

caseWorkflowRouter.post(
  "/options/:optionId/merge",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    await requireCaseAccess(req, req.params.id, CURATOR_ROLES);
    const parsed = z.object({ targetId: z.string().min(1, "A target option is required.") }).safeParse(req.body || {});
    if (!parsed.success) return fail(res, "validation_error", "A target option is required.");
    const [source, target] = await Promise.all([
      req.db.get("select * from adaptation_options where id = ? and case_id = ?", req.params.optionId, req.params.id),
      req.db.get("select id from adaptation_options where id = ? and case_id = ?", parsed.data.targetId, req.params.id),
    ]);
    if (!source || !target) return fail(res, "not_found", "Option not found.");
    if (source.id === target.id) return fail(res, "validation_error", "Cannot merge an option into itself.");
    await req.db.run("update adaptation_options set status = 'merged', merged_into_id = ? where id = ?", target.id, source.id);
    await audit(req.db, { actorId: req.user.id, action: "merge_adaptation_option", entityType: "adaptation_option", entityId: source.id, metadata: { mergedIntoId: target.id } });
    if (source.author_id !== req.user.id) {
      await notifyUser(req.db, {
        userId: source.author_id,
        eventType: "merge_adaptation_option",
        titleEl: "Η επιλογή προσαρμογής σας συγχωνεύτηκε με μια παρόμοια πρόταση",
        titleEn: "Your Adaptation Option was merged with a similar proposal",
        targetUrl: `/?view=case&id=${req.params.id}`,
      });
    }
    const row = await req.db.get(
      "select o.*, u.full_name as author_name from adaptation_options o join users u on u.id = o.author_id where o.id = ?",
      source.id
    );
    res.json({ data: { option: await toPublicOption(req.db, row, req.user.id) } });
  })
);

caseWorkflowRouter.patch(
  "/options/:optionId",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    await requireCaseAccess(req, req.params.id, CURATOR_ROLES);
    const option = await req.db.get("select id from adaptation_options where id = ? and case_id = ?", req.params.optionId, req.params.id);
    if (!option) return fail(res, "not_found", "Option not found.");
    const parsed = z
      .object({
        highlighted: z.boolean().optional(),
        groupLabel: z.string().trim().nullable().optional(),
        readyForPathway: z.boolean().optional(),
      })
      .safeParse(req.body || {});
    if (!parsed.success) return fail(res, "validation_error", "Please correct the highlighted fields.");
    const { highlighted, groupLabel, readyForPathway } = parsed.data;
    await req.db.run(
      `update adaptation_options set highlighted = coalesce(?, highlighted), group_label = coalesce(?, group_label),
         ready_for_pathway = coalesce(?, ready_for_pathway) where id = ?`,
      highlighted === undefined ? null : highlighted ? 1 : 0,
      groupLabel === undefined ? null : groupLabel,
      readyForPathway === undefined ? null : readyForPathway ? 1 : 0,
      req.params.optionId
    );
    const row = await req.db.get(
      "select o.*, u.full_name as author_name from adaptation_options o join users u on u.id = o.author_id where o.id = ?",
      req.params.optionId
    );
    res.json({ data: { option: await toPublicOption(req.db, row, req.user.id) } });
  })
);

// Each measure is "assessed separately" (journey doc: 3.1 Identify & Assess
// Adaptation Options) -- this is the measure-level input a Pathway's
// calculated profile is built from in /pathways/comparison, not a second
// independent rating exercise at the pathway level.
caseWorkflowRouter.get(
  "/options/comparison",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    await requireCaseAccess(req, req.params.id);
    const options = await req.db.all("select id, title, status from adaptation_options where case_id = ? order by created_at", req.params.id);
    const averagesByOption = await optionCriteriaAverages(req.db, req.params.id);
    const items = options
      .filter((o) => o.status !== "merged")
      .map((o) => {
        const title = JSON.parse(o.title);
        return { option_id: o.id, title_el: title.el, title_en: title.en, criteria: averagesByOption[o.id] || {} };
      });
    res.json({ data: { criteria: COMPARISON_CRITERIA, options: items } });
  })
);

const optionComparisonSchema = z.object({
  criterion: z.enum(COMPARISON_CRITERIA),
  score: z.number().int().min(1).max(5),
  justification: z.string().trim().optional(),
});

caseWorkflowRouter.post(
  "/options/:optionId/comparisons",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    await requireCaseAccess(req, req.params.id);
    await requireStepOpen(req, req.params.id, "options");
    const option = await req.db.get("select id from adaptation_options where id = ? and case_id = ?", req.params.optionId, req.params.id);
    if (!option) return fail(res, "not_found", "Option not found.");
    const parsed = optionComparisonSchema.safeParse(req.body || {});
    if (!parsed.success) return fail(res, "validation_error", "A criterion and a score from 1-5 are required.");
    await req.db.run(
      `insert into option_comparisons (id, case_id, option_id, criterion, score, justification, rated_by) values (?, ?, ?, ?, ?, ?, ?)
       on conflict(option_id, criterion, rated_by) do update set score = excluded.score, justification = excluded.justification, created_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
      crypto.randomUUID(),
      req.params.id,
      req.params.optionId,
      parsed.data.criterion,
      parsed.data.score,
      parsed.data.justification || null,
      req.user.id
    );
    await audit(req.db, {
      actorId: req.user.id,
      action: "rate_option",
      entityType: "adaptation_option",
      entityId: req.params.optionId,
      metadata: { criterion: parsed.data.criterion, score: parsed.data.score },
    });
    res.status(201).json({ data: { success: true } });
  })
);

// ---------------------------------------------------------------------------
// Journey trace — the full decision/contribution history for this case
// ---------------------------------------------------------------------------

caseWorkflowRouter.get(
  "/journey",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    await requireCaseAccess(req, req.params.id);
    const entries = [];
    const pushAudit = async (entityType, ids) => {
      if (!ids.length) return;
      const placeholders = ids.map(() => "?").join(",");
      const rows = await req.db.all(
        `select a.action, a.entity_id, a.created_at, u.full_name as actor_name from audit_log a
         left join users u on u.id = a.actor_id where a.entity_type = ? and a.entity_id in (${placeholders}) order by a.created_at`,
        entityType,
        ...ids
      );
      entries.push(...rows.map((r) => ({ action: r.action, actor_name: r.actor_name || "", entity_id: r.entity_id, created_at: r.created_at })));
    };

    await pushAudit("case_study", [req.params.id]);
    const [futures, visionElements, options, pathways] = await Promise.all([
      req.db.all("select id from alternative_futures where case_id = ?", req.params.id),
      req.db.all("select id from vision_elements where case_id = ?", req.params.id),
      req.db.all("select id from adaptation_options where case_id = ?", req.params.id),
      req.db.all("select id from pathways where case_id = ?", req.params.id),
    ]);
    await pushAudit("alternative_future", futures.map((f) => f.id));
    await pushAudit("vision_element", visionElements.map((v) => v.id));
    await pushAudit("adaptation_option", options.map((o) => o.id));
    await pushAudit("pathway", pathways.map((p) => p.id));

    entries.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
    res.json({ data: { items: entries } });
  })
);

// One review lifecycle, six output types. The brief asks for Draft -> In
// Review -> Validated across Possible Futures, the Shared Vision, the Theory
// of Change, Adaptation Options and Pathways. Each of those already has its
// own PATCH route with its own content schema and its own author-vs-curator
// rules; bolting a `reviewStatus` field onto all six would duplicate the same
// guard, audit entry and enum five more times. This is the one place review
// state changes, so the permission rule is stated once.
//
// The table name comes from this fixed map, never from the request, so it is
// safe to interpolate where a bound parameter is not allowed.
export const REVIEW_STATUSES = ["draft", "in_review", "validated"];

const REVIEWABLE_OUTPUTS = {
  future: "alternative_futures",
  "vision-element": "vision_elements",
  "shared-vision": "shared_visions",
  "theory-of-change": "theory_of_change_entries",
  option: "adaptation_options",
  pathway: "pathways",
};

caseWorkflowRouter.patch(
  "/outputs/:kind/:outputId/review",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    // Validating a regional output is a curation decision, not an authoring
    // one: an author must not be able to mark their own contribution
    // Validated.
    await requireCaseAccess(req, req.params.id, CURATOR_ROLES);
    const table = REVIEWABLE_OUTPUTS[req.params.kind];
    if (!table) return fail(res, "not_found", "Unknown output type.");
    const parsed = z.object({ reviewStatus: z.enum(REVIEW_STATUSES) }).safeParse(req.body || {});
    if (!parsed.success) return fail(res, "validation_error", "Choose Draft, In review or Validated.");
    const row = await req.db.get(`select id from ${table} where id = ? and case_id = ?`, req.params.outputId, req.params.id);
    if (!row) return fail(res, "not_found", "Output not found.");
    await req.db.run(`update ${table} set review_status = ? where id = ?`, parsed.data.reviewStatus, req.params.outputId);
    await audit(req.db, {
      actorId: req.user.id,
      action: "review_output",
      entityType: req.params.kind,
      entityId: row.id,
      metadata: { reviewStatus: parsed.data.reviewStatus },
    });
    res.json({ data: { review: { id: row.id, kind: req.params.kind, review_status: parsed.data.reviewStatus } } });
  })
);
