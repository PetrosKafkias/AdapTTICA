import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import { createTestApp, createUser } from "./helpers.js";

async function loginAgent(app, email, password) {
  const agent = request.agent(app);
  await agent.post("/api/v1/auth/login").send({ email, password });
  return agent;
}

async function seedImpact(admin) {
  const systems = await admin.get("/api/v1/systems");
  const hazards = await admin.get("/api/v1/hazards");
  const system = systems.body.data.items[0];
  const hazard = hazards.body.data.items[0];
  const impact = (
    await admin.post("/api/v1/impacts").send({ systemId: system.id, titleEl: "Π", titleEn: "Impact", hazardIds: [hazard.id] })
  ).body.data.impact;
  return { system, hazard, impact };
}

describe("case study creation", () => {
  let ctx;
  afterEach(async () => ctx && (await ctx.cleanup()));

  it("requires admin, a primary impact, and at least one hazard", async () => {
    ctx = await createTestApp();
    await createUser(ctx.db, { email: "admin@test.local", password: "password123", platformRole: "admin" });
    await createUser(ctx.db, { email: "coord@test.local", password: "password123", platformRole: "coordinator" });
    const admin = await loginAgent(ctx.app, "admin@test.local", "password123");
    const coordinator = await loginAgent(ctx.app, "coord@test.local", "password123");
    const { hazard, impact } = await seedImpact(admin);

    const deniedByRole = await coordinator.post("/api/v1/cases").send({ titleEl: "Υ", titleEn: "Case", impactId: impact.id, hazardIds: [hazard.id] });
    expect(deniedByRole.status).toBe(403);

    const missingImpact = await admin.post("/api/v1/cases").send({ titleEl: "Υ", titleEn: "Case", hazardIds: [hazard.id] });
    expect(missingImpact.status).toBe(400);

    const missingHazard = await admin.post("/api/v1/cases").send({ titleEl: "Υ", titleEn: "Case", impactId: impact.id, hazardIds: [] });
    expect(missingHazard.status).toBe(400);

    const created = await admin.post("/api/v1/cases").send({ titleEl: "Υ", titleEn: "Case", impactId: impact.id, hazardIds: [hazard.id] });
    expect(created.status).toBe(201);
    expect(created.body.data.caseStudy.impact_id).toBe(impact.id);
    expect(created.body.data.caseStudy.hazards).toHaveLength(1);

    // Automatically surfaces under its Impact and System without any
    // separate manual step.
    const impactDetail = await admin.get(`/api/v1/impacts/${impact.id}`);
    expect(impactDetail.body.data.impact.case_study_count).toBe(1);
  });
});

describe("case study co-creation workflow", () => {
  let ctx;
  afterEach(async () => ctx && (await ctx.cleanup()));

  it("runs the full journey: baseline -> futures -> vision -> theory of change -> options -> pathways -> compare -> combined direction", async () => {
    ctx = await createTestApp();
    await createUser(ctx.db, { email: "admin@test.local", password: "password123", platformRole: "admin" });
    const participantId = await createUser(ctx.db, { email: "participant@test.local", password: "password123" });
    const admin = await loginAgent(ctx.app, "admin@test.local", "password123");
    const participant = await loginAgent(ctx.app, "participant@test.local", "password123");
    const { hazard, impact, system } = await seedImpact(admin);

    const caseStudy = (
      await admin.post("/api/v1/cases").send({ titleEl: "Υ", titleEn: "Flood case", impactId: impact.id, hazardIds: [hazard.id] })
    ).body.data.caseStudy;
    const caseId = caseStudy.id;
    await ctx.db.run("insert into case_members (case_id, user_id, role) values (?, ?, 'user')", caseId, participantId);

    // Step 1: Baseline reads straight from the case's own impact/hazards,
    // no separate data entry required.
    const baseline = await admin.get(`/api/v1/cases/${caseId}/baseline`);
    expect(baseline.status).toBe(200);
    expect(baseline.body.data.baseline.primary_system.id).toBe(system.id);
    expect(baseline.body.data.baseline.climate_hazards).toHaveLength(1);
    expect(baseline.body.data.baseline.relevant_stakeholders.some((s) => s.full_name === "Test User")).toBe(true);

    // Step 2: Alternative Futures — only a Coordinator/Admin proposes them;
    // participants react (vote/reply) rather than adding their own.
    const denied = await participant.post(`/api/v1/cases/${caseId}/futures`).send({ titleEl: "Χ", titleEn: "Not allowed" });
    expect(denied.status).toBe(403);

    // The creation form is deliberately minimal: title, description and an
    // optional image -- no benefits/barriers/translation fields.
    const future = (
      await admin.post(`/api/v1/cases/${caseId}/futures`).send({
        titleEl: "Μ1",
        titleEn: "Transformative resilience",
        descriptionEn: "A fast contribution form",
      })
    ).body.data.future;
    expect(future.title_en).toBe("Transformative resilience");
    expect(future.description_en).toBe("A fast contribution form");

    // The Coordinator/Admin can edit or delete their own Possible Future,
    // including the benefits/barriers fields an older contribution may
    // already carry.
    const edited = await admin
      .patch(`/api/v1/cases/${caseId}/futures/${future.id}`)
      .send({ titleEn: "Transformative resilience (revised)", benefitsEn: "Reduced exposure", barriersEn: "Long-term funding" });
    expect(edited.status).toBe(200);
    expect(edited.body.data.future.title_en).toBe("Transformative resilience (revised)");
    expect(edited.body.data.future.title_el).toBe("Μ1");
    expect(edited.body.data.future.benefits_en).toBe("Reduced exposure");
    expect(edited.body.data.future.barriers_en).toBe("Long-term funding");

    const deleteDenied = await participant.delete(`/api/v1/cases/${caseId}/futures/${future.id}`);
    expect(deleteDenied.status).toBe(403);

    const prioritised = await participant.post(`/api/v1/cases/${caseId}/prioritisation`).send({ order: [future.id] });
    expect(prioritised.status).toBe(200);
    const priorities = await participant.get(`/api/v1/cases/${caseId}/prioritisation`);
    expect(priorities.body.data.myRanking).toEqual([future.id]);
    expect(priorities.body.data.items[0].first_place_count).toBe(1);
    expect(priorities.body.data.items[0].description_en).toBe("A fast contribution form");
    expect(priorities.body.data.totalSubmitters).toBe(1);

    const phase2Comment = await participant.post(`/api/v1/cases/${caseId}/phases/phase2/forum`).send({ body: "A phase-specific comment" });
    const phase2Reply = await admin
      .post(`/api/v1/cases/${caseId}/phases/phase2/forum`)
      .send({ body: "A phase-specific reply", parentId: phase2Comment.body.data.comment.id });
    expect(phase2Reply.status).toBe(201);
    const commentUpvote = await participant
      .post(`/api/v1/cases/${caseId}/phases/phase2/forum/${phase2Comment.body.data.comment.id}/vote`)
      .send({ value: 1 });
    expect(commentUpvote.body.data).toMatchObject({ upvote_count: 1, downvote_count: 0, score: 1, my_vote: 1 });
    const changedVote = await participant
      .post(`/api/v1/cases/${caseId}/phases/phase2/forum/${phase2Comment.body.data.comment.id}/vote`)
      .send({ value: -1 });
    expect(changedVote.body.data).toMatchObject({ upvote_count: 0, downvote_count: 1, score: -1, my_vote: -1 });
    const replyUpvote = await admin
      .post(`/api/v1/cases/${caseId}/phases/phase2/forum/${phase2Reply.body.data.comment.id}/vote`)
      .send({ value: 1 });
    expect(replyUpvote.body.data.upvote_count).toBe(1);
    const phase2Forum = await participant.get(`/api/v1/cases/${caseId}/phases/phase2/forum`);
    expect(phase2Forum.body.data.commentCount).toBe(2);
    expect(phase2Forum.body.data.items.find((item) => item.id === phase2Comment.body.data.comment.id)).toMatchObject({
      upvote_count: 0,
      downvote_count: 1,
      score: -1,
      my_vote: -1,
    });

    // Step 3: Vision Elements — only a Coordinator/Admin can propose one
    // (Title + Description); a participant can only reply -> vote -> and
    // read, not create or merge.
    const visionCreateDenied = await participant
      .post(`/api/v1/cases/${caseId}/vision-elements`)
      .send({ titleEl: "Reduce heat exposure", titleEn: "Reduce heat exposure" });
    expect(visionCreateDenied.status).toBe(403);
    const ve1 = (
      await admin.post(`/api/v1/cases/${caseId}/vision-elements`).send({ titleEl: "Reduce heat exposure", titleEn: "Reduce heat exposure" })
    ).body.data.visionElement;
    const ve2 = (
      await admin.post(`/api/v1/cases/${caseId}/vision-elements`).send({ titleEl: "Green infrastructure", titleEn: "Green infrastructure" })
    ).body.data.visionElement;
    await participant.post(`/api/v1/cases/${caseId}/vision-elements/${ve1.id}/replies`).send({ body: "Agreed, priority one" });
    const afterVote = await participant.post(`/api/v1/cases/${caseId}/vision-elements/${ve1.id}/vote`).send({ value: "agree" });
    expect(afterVote.body.data.visionElement.agree_count).toBe(1);
    const mergeDenied = await participant.post(`/api/v1/cases/${caseId}/vision-elements/${ve2.id}/merge`).send({ targetId: ve1.id });
    expect(mergeDenied.status).toBe(403);
    const merged = await admin.post(`/api/v1/cases/${caseId}/vision-elements/${ve2.id}/merge`).send({ targetId: ve1.id });
    expect(merged.body.data.visionElement.status).toBe("merged");

    // Step 4: Theory of Change prepopulates from the top-voted vision
    // element before any row exists, then upserts without clobbering.
    const tocDefaults = await admin.get(`/api/v1/cases/${caseId}/theory-of-change`);
    expect(tocDefaults.body.data.theoryOfChange.desired_future_el).toBe("Reduce heat exposure");
    const tocSave1 = await admin.put(`/api/v1/cases/${caseId}/theory-of-change`).send({ currentStateEn: "Current flooding risk" });
    expect(tocSave1.body.data.theoryOfChange.current_state_en).toBe("Current flooding risk");
    const tocSave2 = await admin.put(`/api/v1/cases/${caseId}/theory-of-change`).send({ desiredFutureEn: "Resilient built environment" });
    expect(tocSave2.body.data.theoryOfChange.current_state_en).toBe("Current flooding risk");
    expect(tocSave2.body.data.theoryOfChange.desired_future_en).toBe("Resilient built environment");

    // Phase 3 starts locked and cannot be bypassed by a Participant. Only a
    // Coordinator/Admin can complete Phase 2 and unlock it.
    const lockedOption = await participant.post(`/api/v1/cases/${caseId}/options`).send({ titleEl: "Ο0", titleEn: "Blocked" });
    expect(lockedOption.status).toBe(403);
    const participantUnlock = await participant.patch(`/api/v1/cases/${caseId}/phases/phase3`).send({ status: "current" });
    expect(participantUnlock.status).toBe(403);
    const prematureUnlock = await admin.patch(`/api/v1/cases/${caseId}/phases/phase3`).send({ status: "current" });
    expect(prematureUnlock.status).toBe(403);
    await admin.patch(`/api/v1/cases/${caseId}/phases/phase2`).send({ status: "completed" });
    const unlocked = await admin.patch(`/api/v1/cases/${caseId}/phases/phase3`).send({ status: "current" });
    expect(unlocked.status).toBe(200);

    // Step 5: Adaptation Options — same contribution pattern, plus each
    // measure is assessed separately on the shared criteria (journey doc:
    // "Κάθε measure να αξιολογείται ξεχωριστά").
    const option1 = (
      await participant.post(`/api/v1/cases/${caseId}/options`).send({ titleEl: "Ο1", titleEn: "Grey infrastructure" })
    ).body.data.option;
    const option2 = (
      await participant.post(`/api/v1/cases/${caseId}/options`).send({ titleEl: "Ο2", titleEn: "Nature-based solution" })
    ).body.data.option;
    await participant.post(`/api/v1/cases/${caseId}/options/${option1.id}/vote`).send({ value: "agree" });
    await admin.post(`/api/v1/cases/${caseId}/options/${option1.id}/comparisons`).send({ criterion: "effectiveness", score: 4 });
    await participant.post(`/api/v1/cases/${caseId}/options/${option1.id}/comparisons`).send({ criterion: "effectiveness", score: 2 });
    const optionComparison = await participant.get(`/api/v1/cases/${caseId}/options/comparison`);
    const optionScores = Object.fromEntries(optionComparison.body.data.options.map((o) => [o.option_id, o]));
    expect(optionScores[option1.id].criteria.effectiveness).toEqual({ average: 3, rating_count: 2 });

    // Phase 3, Step 1 (Identify): "Support" ("worth considering") is a
    // separate concept from the agree/disagree vote above, and only a
    // Coordinator/Admin moves a candidate to the shortlist for Step 2.
    await participant.post(`/api/v1/cases/${caseId}/options/${option2.id}/support`);
    const afterSupport = (await participant.get(`/api/v1/cases/${caseId}/options`)).body.data.items.find((o) => o.id === option2.id);
    expect(afterSupport.support_count).toBe(1);
    expect(afterSupport.my_support).toBe(true);

    const assessBeforeShortlist = await participant.post(`/api/v1/cases/${caseId}/options/${option2.id}/assessments`).send({
      effectiveness: "high",
      feasibility: "high",
      coBenefits: "high",
      transformativePotential: "high",
      robustAcrossFutures: "most",
    });
    expect(assessBeforeShortlist.status).toBe(400);

    const shortlistDeniedByRole = await participant.patch(`/api/v1/cases/${caseId}/options/${option2.id}`).send({ shortlisted: true });
    expect(shortlistDeniedByRole.status).toBe(403);
    await admin.patch(`/api/v1/cases/${caseId}/options/${option2.id}`).send({ shortlisted: true });

    // Step 2 (Assess): Low/Medium/High per criterion. The collective
    // assessment and automatic priority score (High=3/Medium=2/Low=1,
    // summed across the four criteria) come from the FIRST assessment here.
    await admin.post(`/api/v1/cases/${caseId}/options/${option2.id}/assessments`).send({
      effectiveness: "high",
      feasibility: "high",
      coBenefits: "high",
      transformativePotential: "medium",
      robustAcrossFutures: "most",
      comment: "Strong fit for the desired change",
    });
    const afterAssessment = (await admin.get(`/api/v1/cases/${caseId}/options`)).body.data.items.find((o) => o.id === option2.id);
    expect(afterAssessment.priority_score).toBe(11);
    expect(afterAssessment.collective_assessment.effectiveness).toBe("high");
    expect(afterAssessment.collective_assessment.robust_across_futures).toBe("most");
    expect(afterAssessment.assessment_count).toBe(1);

    await participant.post(`/api/v1/cases/${caseId}/options/${option2.id}/assessments`).send({
      effectiveness: "medium",
      feasibility: "medium",
      coBenefits: "high",
      transformativePotential: "medium",
      robustAcrossFutures: "some",
    });
    const afterSecondAssessment = (await admin.get(`/api/v1/cases/${caseId}/options`)).body.data.items.find((o) => o.id === option2.id);
    expect(afterSecondAssessment.assessment_count).toBe(2);

    // Step 6: multiple Alternative Pathways, assembled from Options. A
    // Portfolio (Tab 2) groups its measures by intervention category.
    const p1 = (
      await admin.post(`/api/v1/cases/${caseId}/pathways`).send({
        titleEl: "Δ1",
        titleEn: "Pathway 1",
        timeHorizon: "2050",
        optionIds: [option1.id],
        optionCategories: { [option1.id]: "nature_based" },
      })
    ).body.data.pathway;
    expect(p1.options[0].category).toBe("nature_based");
    const p2 = (
      await admin.post(`/api/v1/cases/${caseId}/pathways`).send({
        titleEl: "Δ2",
        titleEn: "Pathway 2",
        timeHorizon: "2050",
        optionIds: [option2.id],
      })
    ).body.data.pathway;
    expect(p1.options).toHaveLength(1);

    const list = await participant.get(`/api/v1/cases/${caseId}/pathways`);
    expect(list.body.data.items).toHaveLength(2);

    // Design Portfolio of Interventions, sub-tab 2 (Evaluate Pathways): its
    // own six-criterion Low/Medium/High evaluation, upserted per
    // stakeholder per pathway, distinct from the 1-5 "comparisons" below.
    await admin.post(`/api/v1/pathways/${p1.id}/evaluations`).send({
      riskReduction: "high",
      feasibility: "high",
      cost: "medium",
      coBenefits: "high",
      transformativePotential: "medium",
      flexibility: "high",
    });
    await participant.post(`/api/v1/pathways/${p1.id}/evaluations`).send({
      riskReduction: "high",
      feasibility: "medium",
      cost: "medium",
      coBenefits: "high",
      transformativePotential: "medium",
      flexibility: "medium",
    });
    const evaluated = (await participant.get(`/api/v1/cases/${caseId}/pathways`)).body.data.items.find((p) => p.id === p1.id);
    expect(evaluated.evaluation_count).toBe(2);
    expect(evaluated.collective_evaluation.risk_reduction).toBe("high");
    expect(evaluated.evaluation_score).toBe(16);

    // Design Portfolio of Interventions, sub-tab 3: one AFFiNE-produced
    // portfolio image per case, Coordinator/Admin-only to set.
    const portfolioImageUpload = await admin
      .post("/api/v1/files/upload")
      .attach("file", Buffer.from("portfolio-image"), { filename: "portfolio.png", contentType: "image/png" });
    const portfolioImageDenied = await participant
      .put(`/api/v1/cases/${caseId}/portfolio-image`)
      .send({ imageKey: portfolioImageUpload.body.data.file.key });
    expect(portfolioImageDenied.status).toBe(403);
    const portfolioImage = (
      await admin
        .put(`/api/v1/cases/${caseId}/portfolio-image`)
        .send({ imageKey: portfolioImageUpload.body.data.file.key, captionEn: "Portfolio of complementary interventions" })
    ).body.data.portfolioImage;
    expect(portfolioImage.image_url).toBe(`/api/v1/files/${portfolioImageUpload.body.data.file.key}`);
    const fetchedPortfolioImage = (await participant.get(`/api/v1/cases/${caseId}/portfolio-image`)).body.data.portfolioImage;
    expect(fetchedPortfolioImage.caption_en).toBe("Portfolio of complementary interventions");

    // Step 7: Compare and Prioritise. Pathway 1's "effectiveness" profile is
    // CALCULATED from option1's measure-level ratings above (average 3,
    // asserted just above), not re-entered from scratch. Stakeholders can
    // still add a qualitative whole-pathway rating on top (here: feasibility).
    await admin.post(`/api/v1/pathways/${p1.id}/comparisons`).send({ criterion: "feasibility", score: 4 });
    await participant.post(`/api/v1/pathways/${p1.id}/comparisons`).send({ criterion: "feasibility", score: 3 });
    await participant.post(`/api/v1/pathways/${p2.id}/comparisons`).send({ criterion: "transformative_potential", score: 5 });
    const invalidScore = await admin.post(`/api/v1/pathways/${p1.id}/comparisons`).send({ criterion: "feasibility", score: 9 });
    expect(invalidScore.status).toBe(400);
    // Aggregated averages stay hidden from Participants until the
    // Coordinator/Admin closes the compare step (spec: "Participants should
    // be able to see aggregated stakeholder results when the Coordinator
    // enables them") -- the Coordinator/Admin can always see them. Counts
    // (how many measures/stakeholders contributed) stay visible regardless.
    const hiddenFromParticipant = await participant.get(`/api/v1/cases/${caseId}/pathways/comparison`);
    expect(hiddenFromParticipant.body.data.resultsVisible).toBe(false);
    const hiddenById = Object.fromEntries(hiddenFromParticipant.body.data.pathways.map((p) => [p.pathway_id, p]));
    expect(hiddenById[p1.id].criteria.effectiveness).toEqual({ calculated: { average: null, option_count: 1 }, stakeholder: null });
    expect(hiddenById[p1.id].criteria.feasibility).toEqual({ calculated: null, stakeholder: { average: null, rating_count: 2 } });

    const visibleToAdmin = await admin.get(`/api/v1/cases/${caseId}/pathways/comparison`);
    expect(visibleToAdmin.body.data.resultsVisible).toBe(true);
    const adminById = Object.fromEntries(visibleToAdmin.body.data.pathways.map((p) => [p.pathway_id, p]));
    expect(adminById[p1.id].criteria.effectiveness).toEqual({ calculated: { average: 3, option_count: 1 }, stakeholder: null });
    expect(adminById[p1.id].criteria.feasibility).toEqual({ calculated: null, stakeholder: { average: 3.5, rating_count: 2 } });

    await admin.patch(`/api/v1/cases/${caseId}/steps/compare`).send({ status: "closed" });
    const comparison = await participant.get(`/api/v1/cases/${caseId}/pathways/comparison`);
    expect(comparison.body.data.resultsVisible).toBe(true);
    const byId = Object.fromEntries(comparison.body.data.pathways.map((p) => [p.pathway_id, p]));
    expect(byId[p1.id].criteria.effectiveness).toEqual({ calculated: { average: 3, option_count: 1 }, stakeholder: null });
    expect(comparison.body.data.criteria).toEqual([
      "effectiveness",
      "applicability",
      "feasibility",
      "co_benefits",
      "trade_off_risk",
      "transformative_potential",
      "adaptivity",
    ]);

    // Step 8: Coordinator/Admin combines a direction from multiple
    // alternatives, with a visible trace of what it drew from.
    const combineDenied = await participant.post(`/api/v1/pathways/${p1.id}/combine`).send({ sourcePathwayIds: [p1.id, p2.id] });
    expect(combineDenied.status).toBe(403);
    const combined = await admin
      .post(`/api/v1/pathways/${p1.id}/combine`)
      .send({ sourcePathwayIds: [p1.id, p2.id], directionSummaryEn: "Blend of grey and nature-based measures" });
    expect(combined.body.data.pathway.status).toBe("combined");
    expect(combined.body.data.pathway.combined_from).toEqual([p1.id, p2.id]);

    // The final decision preserves the full contribution/decision trace.
    const journey = await admin.get(`/api/v1/cases/${caseId}/journey`);
    const actions = journey.body.data.items.map((e) => e.action);
    expect(actions).toEqual([
      "create_case",
      "propose_alternative_future",
      "update_alternative_future",
      "rank_alternative_futures",
      "comment_phase_forum",
      "reply_phase_forum",
      "propose_vision_element",
      "propose_vision_element",
      "reply_vision_element",
      "merge_vision_element",
      "update_theory_of_change",
      "update_theory_of_change",
      "update_phase_status",
      "update_phase_status",
      "propose_adaptation_option",
      "propose_adaptation_option",
      "rate_option",
      "rate_option",
      "support_adaptation_option",
      "shortlist_adaptation_option",
      "assess_adaptation_option",
      "assess_adaptation_option",
      "create_pathway",
      "create_pathway",
      "evaluate_pathway",
      "evaluate_pathway",
      "update_portfolio_image",
      "rate_pathway",
      "rate_pathway",
      "rate_pathway",
      "update_step_status",
      "combine_pathway",
    ]);

    // A pathway can never exist without a case: the nested route requires
    // a valid case id, and there is no route to create one outside a case.
    const orphanAttempt = await admin.post("/api/v1/cases/does-not-exist/pathways").send({ titleEl: "Χ", titleEn: "Orphan" });
    expect(orphanAttempt.status).toBe(404);
  });
});

describe("alternative futures ranking", () => {
  let ctx;
  afterEach(async () => ctx && (await ctx.cleanup()));

  it("lets participants drag-and-drop rank the Alternative Futures a coordinator/admin created, and shows the collective #1 distribution", async () => {
    ctx = await createTestApp();
    await createUser(ctx.db, { email: "admin@test.local", password: "password123", platformRole: "admin" });
    const participantAId = await createUser(ctx.db, { email: "pa@test.local", password: "password123" });
    const participantBId = await createUser(ctx.db, { email: "pb@test.local", password: "password123" });
    const admin = await loginAgent(ctx.app, "admin@test.local", "password123");
    const participantA = await loginAgent(ctx.app, "pa@test.local", "password123");
    const participantB = await loginAgent(ctx.app, "pb@test.local", "password123");
    const { hazard, impact } = await seedImpact(admin);

    const caseStudy = (
      await admin.post("/api/v1/cases").send({ titleEl: "Υ", titleEn: "Case", impactId: impact.id, hazardIds: [hazard.id] })
    ).body.data.caseStudy;
    const caseId = caseStudy.id;
    for (const userId of [participantAId, participantBId]) {
      await ctx.db.run("insert into case_members (case_id, user_id, role) values (?, ?, 'user')", caseId, userId);
    }

    const first = (await admin.post(`/api/v1/cases/${caseId}/futures`).send({ titleEl: "Μ1", titleEn: "Future one" })).body.data.future.id;
    const second = (await admin.post(`/api/v1/cases/${caseId}/futures`).send({ titleEl: "Μ2", titleEn: "Future two" })).body.data.future.id;

    const emptyState = await participantA.get(`/api/v1/cases/${caseId}/prioritisation`);
    expect(emptyState.status).toBe(200);
    expect(emptyState.body.data.myRanking).toEqual([]);
    expect(emptyState.body.data.totalSubmitters).toBe(0);

    const rankA = await participantA.post(`/api/v1/cases/${caseId}/prioritisation`).send({ order: [first, second] });
    expect(rankA.status).toBe(200);
    const rankB = await participantB.post(`/api/v1/cases/${caseId}/prioritisation`).send({ order: [second, first] });
    expect(rankB.status).toBe(200);

    const afterBoth = await participantA.get(`/api/v1/cases/${caseId}/prioritisation`);
    expect(afterBoth.body.data.myRanking).toEqual([first, second]);
    expect(afterBoth.body.data.totalSubmitters).toBe(2);
    const firstFuture = afterBoth.body.data.items.find((item) => item.id === first);
    const secondFuture = afterBoth.body.data.items.find((item) => item.id === second);
    expect(firstFuture.first_place_count).toBe(1);
    expect(secondFuture.first_place_count).toBe(1);

    // Resubmitting replaces the previous ranking rather than accumulating.
    const rankAAgain = await participantA.post(`/api/v1/cases/${caseId}/prioritisation`).send({ order: [second, first] });
    expect(rankAAgain.status).toBe(200);
    const afterUpdate = await participantA.get(`/api/v1/cases/${caseId}/prioritisation`);
    expect(afterUpdate.body.data.totalSubmitters).toBe(2);
    expect(afterUpdate.body.data.items.find((item) => item.id === second).first_place_count).toBe(2);

    const duplicateOrder = await participantA.post(`/api/v1/cases/${caseId}/prioritisation`).send({ order: [first, first] });
    expect(duplicateOrder.status).toBe(400);

    const unknownFuture = await participantA.post(`/api/v1/cases/${caseId}/prioritisation`).send({ order: ["does-not-exist"] });
    expect(unknownFuture.status).toBe(400);
  });
});
