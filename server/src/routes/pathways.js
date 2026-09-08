import crypto from "node:crypto";
import express from "express";
import { z } from "zod";
import { asyncRoute, fail } from "../lib/errors.js";
import { requireUser } from "../lib/auth.js";
import { requireCaseAccess } from "../lib/caseAccess.js";
import { audit } from "../lib/audit.js";
import { notifyUser } from "../lib/notify.js";
import { notifyByEmail } from "../lib/mailer.js";
import { COMPARISON_CRITERIA } from "../lib/comparisonCriteria.js";
import { PORTFOLIO_CATEGORIES } from "../lib/portfolioCategories.js";
import { optionCriteriaAverages, aggregatePathwayEvaluation } from "../lib/contributions.js";
import { requirePhaseAccessible, requireStepOpen } from "./caseWorkflow.js";

// Publishing a Preferred/Combined Pathway Direction is a Coordinator
// decision -- one of the events this platform emails for, not just an
// in-app ping (spec: email for "a new decision published").
async function notifyCaseMembersOfDecision(db, caseId, actorId, { titleEl, titleEn, bodyEl, bodyEn }) {
  const members = await db.all("select u.id, u.email from case_members cm join users u on u.id = cm.user_id where cm.case_id = ? and cm.user_id != ?", caseId, actorId);
  const targetUrl = `/?view=case&id=${caseId}`;
  await Promise.all([
    ...members.map((m) => notifyUser(db, { userId: m.id, eventType: "decision_published", titleEl, titleEn, bodyEl, bodyEn, targetUrl })),
    ...members.map((m) => notifyByEmail({ to: m.email, titleEl, titleEn, bodyEl, bodyEn, targetPath: targetUrl })),
  ]);
}

const CURATOR_ROLES = ["coordinator", "admin"];

async function toPublicPathway(db, row, userId) {
  const get = (col) => JSON.parse(row[col] || "{}");
  const title = get("title");
  const [linkedSystems, options, evaluation, myEvaluationRow] = await Promise.all([
    db.all(`select s.id, s.key, s.name from pathway_linked_systems pls join systems s on s.id = pls.system_id where pls.pathway_id = ?`, row.id),
    db.all(
      `select po.sort_order, po.category, o.id, o.title, o.time_horizon from pathway_options po join adaptation_options o on o.id = po.option_id
       where po.pathway_id = ? order by po.sort_order`,
      row.id
    ),
    aggregatePathwayEvaluation(db, row.id),
    userId ? db.get("select * from pathway_evaluations where pathway_id = ? and user_id = ?", row.id, userId) : null,
  ]);
  return {
    review_status: row.review_status || "draft",
    id: row.id,
    case_id: row.case_id,
    title_el: title.el,
    title_en: title.en,
    short_description_el: get("short_description").el || "",
    short_description_en: get("short_description").en || "",
    time_horizon: row.time_horizon || "",
    primary_system_id: row.primary_system_id,
    relevant_hazards: JSON.parse(row.relevant_hazards || "[]"),
    relevant_impacts_el: get("relevant_impacts").el || "",
    relevant_impacts_en: get("relevant_impacts").en || "",
    sequence_of_interventions_el: get("sequence_of_interventions").el || "",
    sequence_of_interventions_en: get("sequence_of_interventions").en || "",
    enabling_conditions_el: get("enabling_conditions").el || "",
    enabling_conditions_en: get("enabling_conditions").en || "",
    decision_points_el: get("decision_points").el || "",
    decision_points_en: get("decision_points").en || "",
    dependencies_el: get("dependencies").el || "",
    dependencies_en: get("dependencies").en || "",
    trade_offs_el: get("trade_offs").el || "",
    trade_offs_en: get("trade_offs").en || "",
    maladaptation_risks_el: get("maladaptation_risks").el || "",
    maladaptation_risks_en: get("maladaptation_risks").en || "",
    transformative_potential_el: get("transformative_potential").el || "",
    transformative_potential_en: get("transformative_potential").en || "",
    linked_systems: linkedSystems.map((s) => ({ id: s.id, key: s.key, name_el: JSON.parse(s.name).el, name_en: JSON.parse(s.name).en })),
    options: options.map((o) => ({
      id: o.id,
      title_el: JSON.parse(o.title).el,
      title_en: JSON.parse(o.title).en,
      sort_order: o.sort_order,
      category: o.category || null,
      time_horizon: o.time_horizon || "",
    })),
    status: row.status,
    combined_from: row.combined_from ? JSON.parse(row.combined_from) : [],
    direction_summary_el: row.direction_summary ? JSON.parse(row.direction_summary).el || "" : "",
    direction_summary_en: row.direction_summary ? JSON.parse(row.direction_summary).en || "" : "",
    // "Formulate Adaptation Pathways" -- an optional workshop image.
    image_key: row.image_key || null,
    image_url: row.image_key ? `/api/v1/files/${row.image_key}` : "",
    // "Evaluate Pathways" -- the collective High/Medium/Low result across
    // the six methodology criteria, its transparent score, and (when a user
    // is known) their own submitted evaluation alongside it.
    evaluation_count: evaluation.count,
    collective_evaluation: evaluation.collective,
    evaluation_score: evaluation.score,
    my_evaluation: myEvaluationRow
      ? {
          risk_reduction: myEvaluationRow.risk_reduction,
          feasibility: myEvaluationRow.feasibility,
          cost: myEvaluationRow.cost,
          co_benefits: myEvaluationRow.co_benefits,
          transformative_potential: myEvaluationRow.transformative_potential,
          flexibility: myEvaluationRow.flexibility,
        }
      : null,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

const pathwayFields = z.object({
  titleEl: z.string().trim().min(1, "Title is required."),
  titleEn: z.string().trim().min(1, "Title is required."),
  shortDescriptionEl: z.string().trim().optional(),
  shortDescriptionEn: z.string().trim().optional(),
  timeHorizon: z.string().trim().optional(),
  primarySystemId: z.string().trim().optional(),
  relevantHazards: z.array(z.string()).optional(),
  relevantImpactsEl: z.string().trim().optional(),
  relevantImpactsEn: z.string().trim().optional(),
  sequenceOfInterventionsEl: z.string().trim().optional(),
  sequenceOfInterventionsEn: z.string().trim().optional(),
  enablingConditionsEl: z.string().trim().optional(),
  enablingConditionsEn: z.string().trim().optional(),
  decisionPointsEl: z.string().trim().optional(),
  decisionPointsEn: z.string().trim().optional(),
  dependenciesEl: z.string().trim().optional(),
  dependenciesEn: z.string().trim().optional(),
  tradeOffsEl: z.string().trim().optional(),
  tradeOffsEn: z.string().trim().optional(),
  maladaptationRisksEl: z.string().trim().optional(),
  maladaptationRisksEn: z.string().trim().optional(),
  transformativePotentialEl: z.string().trim().optional(),
  transformativePotentialEn: z.string().trim().optional(),
  linkedSystemIds: z.array(z.string()).optional(),
  optionIds: z.array(z.string()).optional(),
  // Which Portfolio category (Knowledge, Planning, Capacity Building,
  // Governance, Nature-based, Infrastructure, Behavioural/Social) each
  // selected option belongs to, keyed by option id. Optional -- a Pathway
  // assembled without categorising its options still works.
  optionCategories: z.record(z.string(), z.enum(PORTFOLIO_CATEGORIES)).optional(),
  // "Formulate Adaptation Pathways": an optional workshop diagram image.
  imageKey: z.string().trim().nullable().optional(),
});

// Step 6: multiple Alternative Pathways per Case Study, assembled from
// Adaptation Options — nested for listing/creating under a case.
export const casePathwaysRouter = express.Router({ mergeParams: true });

casePathwaysRouter.use(
  asyncRoute(async (req, _res, next) => {
    req.user = await requireUser(req);
    await requireCaseAccess(req, req.params.id);
    await requirePhaseAccessible(req, req.params.id, "phase3");
    next();
  })
);

casePathwaysRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    await requireCaseAccess(req, req.params.id);
    const rows = await req.db.all("select * from pathways where case_id = ? order by created_at", req.params.id);
    const items = await Promise.all(rows.map((row) => toPublicPathway(req.db, row, req.user.id)));
    res.json({ data: { items } });
  })
);

casePathwaysRouter.post(
  "/",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    // Any case member may propose an alternative pathway (Pentsiou #11 asks
    // for competing Pathway 1/2/3; #14 forbids "facilitator posts, others
    // vote"). Curation -- status, preferred, combined -- stays gated below.
    await requireCaseAccess(req, req.params.id);
    await requireStepOpen(req, req.params.id, "pathways");
    const parsed = pathwayFields.safeParse(req.body || {});
    if (!parsed.success) {
      const fields = {};
      for (const issue of parsed.error.issues) fields[issue.path[0]] = issue.message;
      return fail(res, "validation_error", "Please correct the highlighted fields.", fields);
    }
    const body = parsed.data;
    // A pathway belongs to exactly one Case Study and inherits that case's
    // taxonomy. This keeps System/Impact/Case/Pathway views connected and
    // avoids asking users to re-enter the same relationships.
    const context = await req.db.get(
      `select i.system_id as primary_system_id, i.title as impact_title
       from case_studies cs join impacts i on i.id = cs.impact_id
       where cs.id = ? and cs.deleted_at is null`,
      req.params.id
    );
    if (!context) return fail(res, "not_found", "Case study not found.");
    const inheritedHazards = await req.db.all(
      `select h.key from case_hazards ch join hazards h on h.id = ch.hazard_id
       where ch.case_id = ? order by h.sort_order`,
      req.params.id
    );
    const inheritedSystems = await req.db.all(
      "select system_id from case_linked_systems where case_id = ?",
      req.params.id
    );
    const impactTitle = JSON.parse(context.impact_title || "{}");
    const primarySystemId = context.primary_system_id;
    const relevantHazards = inheritedHazards.map((hazard) => hazard.key);
    const linkedSystemIds = inheritedSystems.map((system) => system.system_id);
    if (body.imageKey) {
      const upload = await req.db.get("select id from uploads where id = ?", body.imageKey);
      if (!upload) return fail(res, "validation_error", "Image not found. Upload it again.");
    }
    const id = crypto.randomUUID();
    await req.db.run(
      `insert into pathways
         (id, case_id, title, short_description, time_horizon, primary_system_id, relevant_hazards, relevant_impacts,
          sequence_of_interventions, enabling_conditions, decision_points, dependencies, trade_offs, maladaptation_risks,
          transformative_potential, image_key, created_by)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      req.params.id,
      JSON.stringify({ el: body.titleEl, en: body.titleEn }),
      JSON.stringify({ el: body.shortDescriptionEl || "", en: body.shortDescriptionEn || "" }),
      body.timeHorizon || null,
      primarySystemId,
      JSON.stringify(relevantHazards),
      JSON.stringify({ el: impactTitle.el || "", en: impactTitle.en || "" }),
      JSON.stringify({ el: body.sequenceOfInterventionsEl || "", en: body.sequenceOfInterventionsEn || "" }),
      JSON.stringify({ el: body.enablingConditionsEl || "", en: body.enablingConditionsEn || "" }),
      JSON.stringify({ el: body.decisionPointsEl || "", en: body.decisionPointsEn || "" }),
      JSON.stringify({ el: body.dependenciesEl || "", en: body.dependenciesEn || "" }),
      JSON.stringify({ el: body.tradeOffsEl || "", en: body.tradeOffsEn || "" }),
      JSON.stringify({ el: body.maladaptationRisksEl || "", en: body.maladaptationRisksEn || "" }),
      JSON.stringify({ el: body.transformativePotentialEl || "", en: body.transformativePotentialEn || "" }),
      body.imageKey || null,
      req.user.id
    );
    for (const systemId of linkedSystemIds) {
      await req.db.run("insert into pathway_linked_systems (pathway_id, system_id) values (?, ?)", id, systemId);
    }
    for (const [index, optionId] of (body.optionIds || []).entries()) {
      await req.db.run(
        "insert into pathway_options (pathway_id, option_id, sort_order, category) values (?, ?, ?, ?)",
        id,
        optionId,
        index,
        body.optionCategories?.[optionId] || null
      );
    }
    await audit(req.db, { actorId: req.user.id, action: "create_pathway", entityType: "pathway", entityId: id, metadata: { caseId: req.params.id } });
    const row = await req.db.get("select * from pathways where id = ?", id);
    res.status(201).json({ data: { pathway: await toPublicPathway(req.db, row, req.user.id) } });
  })
);

// The comparison matrix for every pathway under a case. Per the journey
// doc, a Pathway's profile is CALCULATED from the measures (Adaptation
// Options) it is built from, not re-assessed independently -- so each cell
// carries a `calculated` score (mean of its constituent options' own
// criterion averages) alongside an optional `stakeholder` score (a direct,
// qualitative whole-pathway rating -- "can be complemented by qualitative
// stakeholder assessment of the pathway as a whole", since synergies,
// trade-offs and sequencing aren't visible at the measure level alone).
// "Preferred"/"combined" stay stakeholder-set status flags, never a
// computed "winner".
//
// Aggregated averages are visible to Participants only once the Coordinator
// closes the "compare" step (spec: "Participants should be able to see
// aggregated stakeholder results when the Coordinator enables them") --
// reusing the same step-activation state every other step already has,
// rather than a second one-off visibility flag. Everyone can keep rating
// while results stay hidden; the Coordinator/Admin always sees them.
casePathwaysRouter.get(
  "/comparison",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    await requireCaseAccess(req, req.params.id);
    const membership = await req.db.get("select role from case_members where case_id = ? and user_id = ?", req.params.id, req.user.id);
    const isCurator = req.user.platform_role === "admin" || CURATOR_ROLES.includes(membership?.role);
    const compareStep = await req.db.get("select status from case_step_state where case_id = ? and step = 'compare'", req.params.id);
    const resultsVisible = isCurator || compareStep?.status === "closed";
    const pathways = await req.db.all("select id, title, status from pathways where case_id = ? order by created_at", req.params.id);
    const [stakeholderScores, optionAverages, pathwayOptionRows] = await Promise.all([
      req.db.all(
        `select pc.pathway_id, pc.criterion, avg(pc.score) as average, count(*) as rating_count
         from pathway_comparisons pc where pc.case_id = ? group by pc.pathway_id, pc.criterion`,
        req.params.id
      ),
      optionCriteriaAverages(req.db, req.params.id),
      req.db.all(
        `select po.pathway_id, po.option_id from pathway_options po join pathways p on p.id = po.pathway_id where p.case_id = ?`,
        req.params.id
      ),
    ]);
    const optionIdsByPathway = {};
    for (const row of pathwayOptionRows) (optionIdsByPathway[row.pathway_id] ||= []).push(row.option_id);
    const matrix = pathways.map((p) => {
      const title = JSON.parse(p.title);
      const optionIds = optionIdsByPathway[p.id] || [];
      const criteria = {};
      for (const criterion of COMPARISON_CRITERIA) {
        const contributingOptions = optionIds.map((id) => optionAverages[id]?.[criterion]).filter(Boolean);
        const calculated = contributingOptions.length
          ? {
              average: resultsVisible ? Math.round((contributingOptions.reduce((sum, o) => sum + o.average, 0) / contributingOptions.length) * 10) / 10 : null,
              option_count: contributingOptions.length,
            }
          : null;
        const stakeholderMatch = stakeholderScores.find((s) => s.pathway_id === p.id && s.criterion === criterion);
        const stakeholder = stakeholderMatch
          ? { average: resultsVisible ? Math.round(stakeholderMatch.average * 10) / 10 : null, rating_count: stakeholderMatch.rating_count }
          : null;
        criteria[criterion] = calculated || stakeholder ? { calculated, stakeholder } : null;
      }
      return { pathway_id: p.id, title_el: title.el, title_en: title.en, status: p.status, criteria };
    });
    res.json({ data: { criteria: COMPARISON_CRITERIA, pathways: matrix, resultsVisible } });
  })
);

// PATCH/comments/comparisons/combine address individual pathways by id —
// mounted separately at /api/v1/pathways.
export const pathwaysRouter = express.Router();

pathwaysRouter.use(
  "/:pathwayId",
  asyncRoute(async (req, _res, next) => {
    req.user = await requireUser(req);
    const pathway = await req.db.get("select case_id from pathways where id = ?", req.params.pathwayId);
    if (!pathway) return next();
    await requireCaseAccess(req, pathway.case_id);
    await requirePhaseAccessible(req, pathway.case_id, "phase3");
    next();
  })
);

const pathwayPatchSchema = pathwayFields.partial().extend({
  status: z.enum(["draft", "under_discussion", "preferred", "combined", "archived"]).optional(),
});

async function getPathwayCaseRow(req, pathwayId) {
  const pathway = await req.db.get("select * from pathways where id = ?", pathwayId);
  if (!pathway) return { pathway: null, caseRow: null };
  const caseRow = await requireCaseAccess(req, pathway.case_id, CURATOR_ROLES);
  return { pathway, caseRow };
}

// A pathway must stay editable while stakeholders discuss it, so its own
// author may revise its content. Publishing decisions (status, preferred,
// combined) remain Coordinator/Admin-only via getPathwayCaseRow above.
async function getPathwayForContentEdit(req, pathwayId) {
  const pathway = await req.db.get("select * from pathways where id = ?", pathwayId);
  if (!pathway) return { pathway: null };
  if (pathway.created_by === req.user.id) {
    await requireCaseAccess(req, pathway.case_id);
  } else {
    await requireCaseAccess(req, pathway.case_id, CURATOR_ROLES);
  }
  return { pathway };
}

pathwaysRouter.patch(
  "/:id",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    const changesStatus = Boolean((req.body || {}).status);
    const { pathway: existing } = changesStatus
      ? await getPathwayCaseRow(req, req.params.id)
      : await getPathwayForContentEdit(req, req.params.id);
    if (!existing) return fail(res, "not_found", "Pathway not found.");
    const parsed = pathwayPatchSchema.safeParse(req.body || {});
    if (!parsed.success) return fail(res, "validation_error", "Please correct the highlighted fields.");
    const body = parsed.data;
    // "Preferred" and "combined" are the Coordinator's stakeholder-facing
    // synthesis of the discussion (spec section 15) -- both are gated the
    // same as every other curation action on this route (Coordinator/Admin),
    // no extra admin-only carve-out.

    const get = (col) => JSON.parse(existing[col] || "{}");
    const merge = (col, elKey, enKey) => JSON.stringify({ el: body[elKey] ?? get(col).el ?? "", en: body[enKey] ?? get(col).en ?? "" });
    if (body.imageKey) {
      const upload = await req.db.get("select id from uploads where id = ?", body.imageKey);
      if (!upload) return fail(res, "validation_error", "Image not found. Upload it again.");
    }

    await req.db.run(
      `update pathways set
         title = ?, short_description = ?, time_horizon = coalesce(?, time_horizon), primary_system_id = coalesce(?, primary_system_id),
         relevant_hazards = coalesce(?, relevant_hazards), relevant_impacts = ?, sequence_of_interventions = ?,
         enabling_conditions = ?, decision_points = ?, dependencies = ?, trade_offs = ?, maladaptation_risks = ?,
         transformative_potential = ?, image_key = coalesce(?, image_key), status = coalesce(?, status),
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       where id = ?`,
      body.titleEl || body.titleEn ? JSON.stringify({ el: body.titleEl ?? get("title").el, en: body.titleEn ?? get("title").en }) : existing.title,
      merge("short_description", "shortDescriptionEl", "shortDescriptionEn"),
      body.timeHorizon ?? null,
      body.primarySystemId ?? null,
      body.relevantHazards ? JSON.stringify(body.relevantHazards) : null,
      merge("relevant_impacts", "relevantImpactsEl", "relevantImpactsEn"),
      merge("sequence_of_interventions", "sequenceOfInterventionsEl", "sequenceOfInterventionsEn"),
      merge("enabling_conditions", "enablingConditionsEl", "enablingConditionsEn"),
      merge("decision_points", "decisionPointsEl", "decisionPointsEn"),
      merge("dependencies", "dependenciesEl", "dependenciesEn"),
      merge("trade_offs", "tradeOffsEl", "tradeOffsEn"),
      merge("maladaptation_risks", "maladaptationRisksEl", "maladaptationRisksEn"),
      merge("transformative_potential", "transformativePotentialEl", "transformativePotentialEn"),
      body.imageKey === undefined ? null : body.imageKey,
      body.status ?? null,
      req.params.id
    );
    if (body.optionIds !== undefined) {
      await req.db.run("delete from pathway_options where pathway_id = ?", req.params.id);
      for (const [index, optionId] of body.optionIds.entries()) {
        await req.db.run(
          "insert into pathway_options (pathway_id, option_id, sort_order, category) values (?, ?, ?, ?)",
          req.params.id,
          optionId,
          index,
          body.optionCategories?.[optionId] || null
        );
      }
    }
    await audit(req.db, {
      actorId: req.user.id,
      action: body.status ? "update_pathway_status" : "update_pathway",
      entityType: "pathway",
      entityId: req.params.id,
      metadata: body.status ? { status: body.status } : {},
    });
    if (body.status === "preferred") {
      const title = JSON.parse(existing.title);
      await notifyCaseMembersOfDecision(req.db, existing.case_id, req.user.id, {
        titleEl: "Δημοσιεύτηκε η Προτεινόμενη Κατεύθυνση",
        titleEn: "The Preferred Pathway Direction has been published",
        bodyEl: `«${title.el}» ορίστηκε ως η προτεινόμενη κατεύθυνση.`,
        bodyEn: `"${title.en}" was set as the preferred direction.`,
      });
    }
    const row = await req.db.get("select * from pathways where id = ?", req.params.id);
    res.json({ data: { pathway: await toPublicPathway(req.db, row, req.user.id) } });
  })
);

// Step 8: synthesise a Preferred or Combined Pathway Direction, with a
// visible trace of which alternatives it drew from.
pathwaysRouter.post(
  "/:id/combine",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    const { pathway: existing } = await getPathwayCaseRow(req, req.params.id);
    if (!existing) return fail(res, "not_found", "Pathway not found.");
    const parsed = z
      .object({
        sourcePathwayIds: z.array(z.string()).min(1, "At least one source pathway is required."),
        directionSummaryEl: z.string().trim().optional(),
        directionSummaryEn: z.string().trim().optional(),
      })
      .safeParse(req.body || {});
    if (!parsed.success) return fail(res, "validation_error", "Please correct the highlighted fields.");
    const body = parsed.data;
    await req.db.run(
      `update pathways set status = 'combined', combined_from = ?, direction_summary = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') where id = ?`,
      JSON.stringify(body.sourcePathwayIds),
      JSON.stringify({ el: body.directionSummaryEl || "", en: body.directionSummaryEn || "" }),
      req.params.id
    );
    await audit(req.db, {
      actorId: req.user.id,
      action: "combine_pathway",
      entityType: "pathway",
      entityId: req.params.id,
      metadata: { sourcePathwayIds: body.sourcePathwayIds },
    });
    const title = JSON.parse(existing.title);
    await notifyCaseMembersOfDecision(req.db, existing.case_id, req.user.id, {
      titleEl: "Δημοσιεύτηκε η Συνδυασμένη Κατεύθυνση",
      titleEn: "The Combined Pathway Direction has been published",
      bodyEl: `«${title.el}» δημιουργήθηκε συνδυάζοντας ${body.sourcePathwayIds.length} εναλλακτικές διαδρομές.`,
      bodyEn: `"${title.en}" was created by combining ${body.sourcePathwayIds.length} alternative pathways.`,
    });
    const row = await req.db.get("select * from pathways where id = ?", req.params.id);
    res.json({ data: { pathway: await toPublicPathway(req.db, row, req.user.id) } });
  })
);

pathwaysRouter.get(
  "/:id/comments",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    const pathway = await req.db.get("select case_id from pathways where id = ?", req.params.id);
    if (!pathway) return fail(res, "not_found", "Pathway not found.");
    await requireCaseAccess(req, pathway.case_id);
    const rows = await req.db.all(
      `select c.*, u.full_name as author_name from pathway_comments c join users u on u.id = c.author_id
       where c.pathway_id = ? order by c.created_at`,
      req.params.id
    );
    res.json({
      data: { items: rows.map((r) => ({ id: r.id, author_id: r.author_id, author_name: r.author_name, body: r.body, created_at: r.created_at })) },
    });
  })
);

pathwaysRouter.post(
  "/:id/comments",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    const pathway = await req.db.get("select case_id from pathways where id = ?", req.params.id);
    if (!pathway) return fail(res, "not_found", "Pathway not found.");
    await requireCaseAccess(req, pathway.case_id);
    const parsed = z.object({ body: z.string().trim().min(1, "A comment needs some text.") }).safeParse(req.body || {});
    if (!parsed.success) return fail(res, "validation_error", "A comment needs some text.");
    const id = crypto.randomUUID();
    await req.db.run("insert into pathway_comments (id, pathway_id, author_id, body) values (?, ?, ?, ?)", id, req.params.id, req.user.id, parsed.data.body);
    await audit(req.db, { actorId: req.user.id, action: "comment_pathway", entityType: "pathway", entityId: req.params.id });
    const row = await req.db.get(
      "select c.*, u.full_name as author_name from pathway_comments c join users u on u.id = c.author_id where c.id = ?",
      id
    );
    res.status(201).json({ data: { comment: { id: row.id, author_id: row.author_id, author_name: row.author_name, body: row.body, created_at: row.created_at } } });
  })
);

pathwaysRouter.post(
  "/:id/comparisons",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    const pathway = await req.db.get("select id, case_id from pathways where id = ?", req.params.id);
    if (!pathway) return fail(res, "not_found", "Pathway not found.");
    await requireCaseAccess(req, pathway.case_id);
    const parsed = z
      .object({ criterion: z.enum(COMPARISON_CRITERIA), score: z.number().int().min(1).max(5), justification: z.string().trim().optional() })
      .safeParse(req.body || {});
    if (!parsed.success) return fail(res, "validation_error", "A criterion and a score from 1-5 are required.");
    await req.db.run(
      `insert into pathway_comparisons (id, case_id, pathway_id, criterion, score, justification, rated_by) values (?, ?, ?, ?, ?, ?, ?)
       on conflict(pathway_id, criterion, rated_by) do update set score = excluded.score, justification = excluded.justification, created_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
      crypto.randomUUID(),
      pathway.case_id,
      req.params.id,
      parsed.data.criterion,
      parsed.data.score,
      parsed.data.justification || null,
      req.user.id
    );
    await audit(req.db, { actorId: req.user.id, action: "rate_pathway", entityType: "pathway", entityId: req.params.id, metadata: { criterion: parsed.data.criterion, score: parsed.data.score } });
    res.status(201).json({ data: { success: true } });
  })
);

// "Evaluate Pathways" (Design Portfolio of Interventions, sub-tab 2): the
// six-criterion, Low/Medium/High evaluation the methodology doc specifies
// -- upserted per stakeholder per pathway, distinct from the 1-5
// "comparisons" above.
const pathwayEvaluationSchema = z.object({
  riskReduction: z.enum(["low", "medium", "high"]),
  feasibility: z.enum(["low", "medium", "high"]),
  cost: z.enum(["low", "medium", "high"]),
  coBenefits: z.enum(["low", "medium", "high"]),
  transformativePotential: z.enum(["low", "medium", "high"]),
  flexibility: z.enum(["low", "medium", "high"]),
});

pathwaysRouter.post(
  "/:id/evaluations",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    const pathway = await req.db.get("select id, case_id from pathways where id = ?", req.params.id);
    if (!pathway) return fail(res, "not_found", "Pathway not found.");
    await requireCaseAccess(req, pathway.case_id);
    const parsed = pathwayEvaluationSchema.safeParse(req.body || {});
    if (!parsed.success) return fail(res, "validation_error", "Please correct the highlighted fields.");
    const body = parsed.data;
    await req.db.run(
      `insert into pathway_evaluations
         (id, pathway_id, user_id, risk_reduction, feasibility, cost, co_benefits, transformative_potential, flexibility)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?)
       on conflict(pathway_id, user_id) do update set
         risk_reduction = excluded.risk_reduction, feasibility = excluded.feasibility, cost = excluded.cost,
         co_benefits = excluded.co_benefits, transformative_potential = excluded.transformative_potential,
         flexibility = excluded.flexibility, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
      crypto.randomUUID(),
      req.params.id,
      req.user.id,
      body.riskReduction,
      body.feasibility,
      body.cost,
      body.coBenefits,
      body.transformativePotential,
      body.flexibility
    );
    await audit(req.db, { actorId: req.user.id, action: "evaluate_pathway", entityType: "pathway", entityId: req.params.id });
    const row = await req.db.get("select * from pathways where id = ?", req.params.id);
    res.json({ data: { pathway: await toPublicPathway(req.db, row, req.user.id) } });
  })
);

// "Design portfolio of interventions" (sub-tab 3): one AFFiNE-produced
// screenshot per case, visualizing how its pathways combine. Read by every
// case member, written by a Coordinator/Admin only -- the same shape as the
// Theory of Change image.
export const casePortfolioImageRouter = express.Router({ mergeParams: true });

casePortfolioImageRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    await requireCaseAccess(req, req.params.id);
    const row = await req.db.get("select * from case_portfolio_images where case_id = ?", req.params.id);
    res.json({
      data: {
        portfolioImage: row
          ? {
              image_key: row.image_key,
              image_url: row.image_key ? `/api/v1/files/${row.image_key}` : "",
              caption_el: row.caption_el || "",
              caption_en: row.caption_en || "",
              updated_at: row.updated_at,
            }
          : null,
      },
    });
  })
);

const portfolioImageSchema = z.object({
  imageKey: z.string().trim().min(1, "An image is required."),
  captionEl: z.string().trim().optional(),
  captionEn: z.string().trim().optional(),
});

casePortfolioImageRouter.put(
  "/",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    await requireCaseAccess(req, req.params.id, CURATOR_ROLES);
    const parsed = portfolioImageSchema.safeParse(req.body || {});
    if (!parsed.success) return fail(res, "validation_error", "An image is required.");
    const body = parsed.data;
    const upload = await req.db.get("select id from uploads where id = ?", body.imageKey);
    if (!upload) return fail(res, "validation_error", "Image not found. Upload it again.");
    await req.db.run(
      `insert into case_portfolio_images (case_id, image_key, caption_el, caption_en, updated_by)
       values (?, ?, ?, ?, ?)
       on conflict(case_id) do update set image_key = excluded.image_key, caption_el = excluded.caption_el,
         caption_en = excluded.caption_en, updated_by = excluded.updated_by, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
      req.params.id,
      body.imageKey,
      body.captionEl || "",
      body.captionEn || "",
      req.user.id
    );
    await audit(req.db, { actorId: req.user.id, action: "update_portfolio_image", entityType: "case_study", entityId: req.params.id });
    const row = await req.db.get("select * from case_portfolio_images where case_id = ?", req.params.id);
    res.json({
      data: {
        portfolioImage: {
          image_key: row.image_key,
          image_url: row.image_key ? `/api/v1/files/${row.image_key}` : "",
          caption_el: row.caption_el || "",
          caption_en: row.caption_en || "",
          updated_at: row.updated_at,
        },
      },
    });
  })
);
