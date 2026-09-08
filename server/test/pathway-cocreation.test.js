import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import { createTestApp, createUser } from "./helpers.js";

async function loginAgent(app, email, password) {
  const agent = request.agent(app);
  await agent.post("/api/v1/auth/login").send({ email, password });
  return agent;
}

async function seedCase(ctx, admin) {
  const systems = await admin.get("/api/v1/systems");
  const hazards = await admin.get("/api/v1/hazards");
  const impact = (
    await admin.post("/api/v1/impacts").send({
      systemId: systems.body.data.items[0].id,
      titleEl: "Αστικές πλημμύρες",
      titleEn: "Urban flooding",
      hazardIds: [hazards.body.data.items[0].id],
    })
  ).body.data.impact;
  const caseStudy = (
    await admin.post("/api/v1/cases").send({
      titleEl: "Υ",
      titleEn: "Flood case",
      impactId: impact.id,
      hazardIds: [hazards.body.data.items[0].id],
    })
  ).body.data.caseStudy;
  await admin.patch(`/api/v1/cases/${caseStudy.id}/phases/phase2`).send({ status: "completed" });
  await admin.patch(`/api/v1/cases/${caseStudy.id}/phases/phase3`).send({ status: "current" });
  return caseStudy.id;
}

// Pentsiou #11 wants competing Pathway 1/2/3 and #14 forbids the
// "facilitator posts, everyone else votes" shape. The journey doc adds that a
// pathway is a combination AND SEQUENCE of measures with decision points.
describe("pathway co-creation", () => {
  let ctx;
  afterEach(async () => ctx && (await ctx.cleanup()));

  it("lets any case member propose and revise a pathway while curation stays with the coordinator", async () => {
    ctx = await createTestApp();
    await createUser(ctx.db, { email: "admin@test.local", password: "password123", platformRole: "admin" });
    const participantId = await createUser(ctx.db, { email: "part@test.local", password: "password123" });
    const otherId = await createUser(ctx.db, { email: "other@test.local", password: "password123" });
    const admin = await loginAgent(ctx.app, "admin@test.local", "password123");
    const participant = await loginAgent(ctx.app, "part@test.local", "password123");
    const other = await loginAgent(ctx.app, "other@test.local", "password123");

    const caseId = await seedCase(ctx, admin);
    await ctx.db.run("insert into case_members (case_id, user_id, role) values (?, ?, 'user')", caseId, participantId);
    await ctx.db.run("insert into case_members (case_id, user_id, role) values (?, ?, 'user')", caseId, otherId);

    const measure = async (titleEn) =>
      (await participant.post(`/api/v1/cases/${caseId}/options`).send({ titleEl: titleEn, titleEn })).body.data.option;
    const streams = await measure("Restore urban streams");
    const roofs = await measure("Green roofs");
    const drainage = await measure("Drainage upgrades");

    // A Participant may propose an alternative pathway, not merely vote on one.
    const created = await participant.post(`/api/v1/cases/${caseId}/pathways`).send({
      titleEl: "Δ1",
      titleEn: "Nature-based urban transformation",
      optionIds: [drainage.id, streams.id, roofs.id],
      decisionPointsEn: "Review after the 2035 flood-risk reassessment",
      dependenciesEn: "Stream restoration must precede the green corridors",
      tradeOffsEn: "Short-term construction disruption",
    });
    expect(created.status).toBe(201);
    const pathwayId = created.body.data.pathway.id;

    // A pathway is a SEQUENCE: the submitted order is the stored order.
    expect(created.body.data.pathway.options.map((o) => o.title_en)).toEqual([
      "Drainage upgrades",
      "Restore urban streams",
      "Green roofs",
    ]);
    // The whole-pathway dimensions the docs require are persisted, not dropped.
    expect(created.body.data.pathway.decision_points_en).toBe("Review after the 2035 flood-risk reassessment");
    expect(created.body.data.pathway.dependencies_en).toBe("Stream restoration must precede the green corridors");
    expect(created.body.data.pathway.trade_offs_en).toBe("Short-term construction disruption");

    // The author may keep developing it as the discussion evolves...
    const resequenced = await participant.patch(`/api/v1/pathways/${pathwayId}`).send({
      optionIds: [streams.id, roofs.id, drainage.id],
      dependenciesEn: "Revised after discussion",
    });
    expect(resequenced.status).toBe(200);
    expect(resequenced.body.data.pathway.options.map((o) => o.title_en)).toEqual([
      "Restore urban streams",
      "Green roofs",
      "Drainage upgrades",
    ]);
    expect(resequenced.body.data.pathway.dependencies_en).toBe("Revised after discussion");

    // ...but another participant cannot rewrite someone else's pathway.
    const hijack = await other.patch(`/api/v1/pathways/${pathwayId}`).send({ titleEn: "Hijacked" });
    expect(hijack.status).toBe(403);

    // Publishing a direction stays a Coordinator/Admin decision.
    const selfPromote = await participant.patch(`/api/v1/pathways/${pathwayId}`).send({ status: "preferred" });
    expect(selfPromote.status).toBe(403);
    const promoted = await admin.patch(`/api/v1/pathways/${pathwayId}`).send({ status: "preferred" });
    expect(promoted.status).toBe(200);
    expect(promoted.body.data.pathway.status).toBe("preferred");
  });
});

// Journey doc 2.1: the facilitator "οργανώνει τη συμμετοχή". Closing an
// activity has to actually stop new contributions, otherwise the badge is
// decoration and the Coordinator has no real control over the process.
describe("closing an activity", () => {
  let ctx;
  afterEach(async () => ctx && (await ctx.cleanup()));

  it("blocks participant contributions once the coordinator closes the step, but not the coordinator's own curation", async () => {
    ctx = await createTestApp();
    await createUser(ctx.db, { email: "admin@test.local", password: "password123", platformRole: "admin" });
    const participantId = await createUser(ctx.db, { email: "part@test.local", password: "password123" });
    const admin = await loginAgent(ctx.app, "admin@test.local", "password123");
    const participant = await loginAgent(ctx.app, "part@test.local", "password123");

    const caseId = await seedCase(ctx, admin);
    await ctx.db.run("insert into case_members (case_id, user_id, role) values (?, ?, 'user')", caseId, participantId);

    // Only a Coordinator/Admin proposes a Possible Future.
    const open = await admin.post(`/api/v1/cases/${caseId}/futures`).send({ titleEl: "M1", titleEn: "Transformative resilience" });
    expect(open.status).toBe(201);

    // While the activity is open a participant can still react to it.
    const openReply = await participant
      .post(`/api/v1/cases/${caseId}/futures/${open.body.data.future.id}/replies`)
      .send({ body: "Still on time" });
    expect(openReply.status).toBe(201);

    await admin.patch(`/api/v1/cases/${caseId}/steps/futures`).send({ status: "closed" });

    // Now the same request is refused...
    const blockedReply = await participant
      .post(`/api/v1/cases/${caseId}/futures/${open.body.data.future.id}/replies`)
      .send({ body: "Also too late" });
    expect(blockedReply.status).toBe(403);

    // ...while the Coordinator can still work on what was already gathered.
    const curatorStillWrites = await admin.post(`/api/v1/cases/${caseId}/futures`).send({ titleEl: "S", titleEn: "Synthesised" });
    expect(curatorStillWrites.status).toBe(201);

    // Reopening restores participation.
    await admin.patch(`/api/v1/cases/${caseId}/steps/futures`).send({ status: "active" });
    const reopened = await participant
      .post(`/api/v1/cases/${caseId}/futures/${open.body.data.future.id}/replies`)
      .send({ body: "Back in" });
    expect(reopened.status).toBe(201);
  });
});
