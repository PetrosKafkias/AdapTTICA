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
  return { impactId: impact.id, hazardIds: [hazard.id] };
}

describe("real role-based co-creation interactivity", () => {
  let ctx;
  afterEach(async () => ctx && (await ctx.cleanup()));

  it("supports Futures propose->reply->vote->merge, Coordinator step activation, Baseline comments, and Shared Vision publish", async () => {
    ctx = await createTestApp();
    await createUser(ctx.db, { email: "admin@test.local", password: "password123", platformRole: "admin" });
    const coordinatorId = await createUser(ctx.db, { email: "coord@test.local", password: "password123" });
    const participantId = await createUser(ctx.db, { email: "part@test.local", password: "password123" });

    const admin = await loginAgent(ctx.app, "admin@test.local", "password123");
    const coordinator = await loginAgent(ctx.app, "coord@test.local", "password123");
    const participant = await loginAgent(ctx.app, "part@test.local", "password123");

    const { impactId, hazardIds } = await seedImpact(admin);
    const caseStudy = (
      await admin.post("/api/v1/cases").send({ titleEl: "Υ", titleEn: "Case", impactId, hazardIds })
    ).body.data.caseStudy;
    const caseId = caseStudy.id;
    await ctx.db.run("insert into case_members (case_id, user_id, role) values (?, ?, 'coordinator')", caseId, coordinatorId);
    await ctx.db.run("insert into case_members (case_id, user_id, role) values (?, ?, 'user')", caseId, participantId);

    // A participant cannot open/close a step -- only the Coordinator/Admin.
    const stepDenied = await participant.patch(`/api/v1/cases/${caseId}/steps/futures`).send({ status: "active" });
    expect(stepDenied.status).toBe(403);
    const stepOpened = await coordinator.patch(`/api/v1/cases/${caseId}/steps/futures`).send({ status: "active" });
    expect(stepOpened.status).toBe(200);
    const steps = await participant.get(`/api/v1/cases/${caseId}/steps`);
    expect(steps.body.data.items.find((s) => s.step === "futures").status).toBe("active");

    // Participant sees the notification that the activity is now open.
    const participantNotifications = await participant.get("/api/v1/notifications");
    expect(participantNotifications.body.data.items.some((n) => n.title_en === "The Alternative Futures activity is now open")).toBe(true);

    // Alternative Futures: full propose -> reply -> vote -> merge pattern,
    // same as Vision Elements/Options (spec: consistent interaction model).
    // Only a Coordinator/Admin proposes a Possible Future.
    const proposeDenied = await participant.post(`/api/v1/cases/${caseId}/futures`).send({ titleEl: "Γ", titleEn: "Not allowed" });
    expect(proposeDenied.status).toBe(403);
    const futureA = (await coordinator.post(`/api/v1/cases/${caseId}/futures`).send({ titleEl: "Α", titleEn: "Future A" })).body.data.future;
    const futureB = (await coordinator.post(`/api/v1/cases/${caseId}/futures`).send({ titleEl: "Β", titleEn: "Future B" })).body.data.future;
    const reply = await coordinator.post(`/api/v1/cases/${caseId}/futures/${futureA.id}/replies`).send({ body: "Interesting angle" });
    expect(reply.status).toBe(201);
    expect(reply.body.data.future.reply_count).toBe(1);
    const voted = await coordinator.post(`/api/v1/cases/${caseId}/futures/${futureA.id}/vote`).send({ value: "agree" });
    expect(voted.body.data.future.agree_count).toBe(1);
    const mergeDenied = await participant.post(`/api/v1/cases/${caseId}/futures/${futureB.id}/merge`).send({ targetId: futureA.id });
    expect(mergeDenied.status).toBe(403);
    const merged = await coordinator.post(`/api/v1/cases/${caseId}/futures/${futureB.id}/merge`).send({ targetId: futureA.id });
    expect(merged.body.data.future.status).toBe("merged");
    expect(merged.body.data.future.merged_into_id).toBe(futureA.id);

    // Merging one's own proposal (both Futures were proposed by the same
    // Coordinator, since only a Coordinator/Admin may propose them) sends no
    // self-notification.
    const participantNotificationsAfterMerge = await participant.get("/api/v1/notifications");
    expect(
      participantNotificationsAfterMerge.body.data.items.some((n) => n.title_en === "Your alternative future was merged with a similar proposal")
    ).toBe(false);

    // Coordinator-only editing: a Possible Future's own content, plus its
    // group label -- no merge/highlight clutter beyond that.
    const editDenied = await participant.patch(`/api/v1/cases/${caseId}/futures/${futureA.id}`).send({ groupLabel: "Transformative" });
    expect(editDenied.status).toBe(403);
    const edited = await coordinator.patch(`/api/v1/cases/${caseId}/futures/${futureA.id}`).send({ groupLabel: "Transformative", titleEn: "Future A (refined)" });
    expect(edited.body.data.future.group_label).toBe("Transformative");
    expect(edited.body.data.future.title_en).toBe("Future A (refined)");

    const deleteDenied = await participant.delete(`/api/v1/cases/${caseId}/futures/${futureA.id}`);
    expect(deleteDenied.status).toBe(403);

    // Baseline is comment-only, not a voting exercise.
    const baselineComment = await participant.post(`/api/v1/cases/${caseId}/baseline/comments`).send({ body: "Missing the flood zone map", isSuggestion: true });
    expect(baselineComment.status).toBe(201);
    const acceptDenied = await participant.patch(`/api/v1/cases/${caseId}/baseline/comments/${baselineComment.body.data.comment.id}`).send({ status: "accepted" });
    expect(acceptDenied.status).toBe(403);
    const accepted = await coordinator.patch(`/api/v1/cases/${caseId}/baseline/comments/${baselineComment.body.data.comment.id}`).send({ status: "accepted" });
    expect(accepted.body.data.comment.status).toBe("accepted");

    // Theory of Change reuses the same comment/suggestion thread as
    // Baseline (spec: ToC must be "editable and connected, not static").
    // The threads are section-scoped -- a ToC comment must never leak into
    // the Baseline list, or vice versa.
    const tocComment = await participant.post(`/api/v1/cases/${caseId}/toc/comments`).send({ body: "Consider a phased transformation", isSuggestion: true });
    expect(tocComment.status).toBe(201);
    const tocAcceptDenied = await participant.patch(`/api/v1/cases/${caseId}/toc/comments/${tocComment.body.data.comment.id}`).send({ status: "accepted" });
    expect(tocAcceptDenied.status).toBe(403);
    const tocAccepted = await coordinator.patch(`/api/v1/cases/${caseId}/toc/comments/${tocComment.body.data.comment.id}`).send({ status: "accepted" });
    expect(tocAccepted.body.data.comment.status).toBe("accepted");
    const baselineThread = await participant.get(`/api/v1/cases/${caseId}/baseline/comments`);
    expect(baselineThread.body.data.items.map((c) => c.id)).not.toContain(tocComment.body.data.comment.id);
    const tocThread = await participant.get(`/api/v1/cases/${caseId}/toc/comments`);
    expect(tocThread.body.data.items.map((c) => c.id)).toContain(tocComment.body.data.comment.id);

    // Vision Elements: propose, mark for synthesis, publish the Shared
    // Vision -- a distinct artifact "built from" the selected elements.
    const ve1 = (
      await coordinator
        .post(`/api/v1/cases/${caseId}/vision-elements`)
        .send({ titleEl: "Protect critical infrastructure", titleEn: "Protect critical infrastructure" })
    ).body.data.visionElement;
    const includeDenied = await participant.patch(`/api/v1/cases/${caseId}/vision-elements/${ve1.id}`).send({ includeInSynthesis: true });
    expect(includeDenied.status).toBe(403);
    const included = await coordinator.patch(`/api/v1/cases/${caseId}/vision-elements/${ve1.id}`).send({ includeInSynthesis: true });
    expect(included.body.data.visionElement.include_in_synthesis).toBe(true);

    const publishDenied = await participant
      .put(`/api/v1/cases/${caseId}/shared-vision`)
      .send({ summaryEl: "Σ", summaryEn: "S", sourceElementIds: [ve1.id] });
    expect(publishDenied.status).toBe(403);
    const published = await coordinator
      .put(`/api/v1/cases/${caseId}/shared-vision`)
      .send({ summaryEl: "Σ", summaryEn: "Protect critical infrastructure", sourceElementIds: [ve1.id] });
    expect(published.status).toBe(200);
    expect(published.body.data.sharedVision.source_element_ids).toEqual([ve1.id]);

    const partNotificationsAfter = await participant.get("/api/v1/notifications");
    expect(partNotificationsAfter.body.data.items.some((n) => n.title_en === "The Shared Vision has been published")).toBe(true);

    // Theory of Change carries Phase 1 and Phase 2 forward automatically
    // ("δεν χρειάζεται να είναι καινούριο ανεξάρτητο exercise από το μηδέν"):
    // Current Challenge comes from the case's Climate Impact, Desired Future
    // from the Shared Vision just published above.
    const toc = await participant.get(`/api/v1/cases/${caseId}/theory-of-change`);
    expect(toc.body.data.theoryOfChange.current_state_en).toBe("Impact");
    expect(toc.body.data.theoryOfChange.desired_future_en).toBe("Protect critical infrastructure");

    // Phase 1 baseline shows the full RCCAP/P2R context, inheriting the
    // system-wide vulnerabilities when the impact has none of its own.
    await ctx.db.run(
      "update systems set key_vulnerabilities = ? where id = (select system_id from impacts where id = ?)",
      JSON.stringify({ el: "Πλημμύρες", en: "Flooding and heat" }),
      impactId
    );
    const baseline = await participant.get(`/api/v1/cases/${caseId}/baseline`);
    expect(baseline.body.data.baseline.vulnerabilities_en).toBe("Flooding and heat");

    // Journey trace includes the new interactive events, in order.
    const journey = await coordinator.get(`/api/v1/cases/${caseId}/journey`);
    const actions = journey.body.data.items.map((e) => e.action);
    expect(actions).toEqual([
      "create_case",
      "update_step_status",
      "propose_alternative_future",
      "propose_alternative_future",
      "reply_alternative_future",
      "merge_alternative_future",
      "update_alternative_future",
      "comment_baseline",
      "comment_toc",
      "propose_vision_element",
      "publish_shared_vision",
    ]);
  });
});
