import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import { createTestApp, createUser } from "./helpers.js";

async function loginAgent(app, email, password) {
  const agent = request.agent(app);
  await agent.post("/api/v1/auth/login").send({ email, password });
  return agent;
}

async function seedCase(admin) {
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
      titleEn: "Attica regional journey",
      impactId: impact.id,
      hazardIds: [hazards.body.data.items[0].id],
    })
  ).body.data.caseStudy;
  return caseStudy.id;
}

// The brief defines one review lifecycle -- Draft -> In Review -> Validated --
// for every co-created output, and separates it from authoring: a stakeholder
// contributes, the region validates.
describe("output review lifecycle", () => {
  let ctx;
  afterEach(async () => ctx && (await ctx.cleanup()));

  it("starts outputs as Draft and lets only a curator advance them", async () => {
    ctx = await createTestApp();
    await createUser(ctx.db, { email: "admin@test.local", password: "password123", platformRole: "admin" });
    const participantId = await createUser(ctx.db, { email: "part@test.local", password: "password123" });
    const admin = await loginAgent(ctx.app, "admin@test.local", "password123");
    const participant = await loginAgent(ctx.app, "part@test.local", "password123");

    const caseId = await seedCase(admin);
    await ctx.db.run("insert into case_members (case_id, user_id, role) values (?, ?, 'user')", caseId, participantId);

    const future = (
      await admin.post(`/api/v1/cases/${caseId}/futures`).send({ titleEl: "Μ", titleEn: "Transformative resilience" })
    ).body.data.future;
    // Nothing is validated merely by being contributed.
    expect(future.review_status).toBe("draft");

    // An author cannot validate their own contribution.
    const selfValidate = await participant
      .patch(`/api/v1/cases/${caseId}/outputs/future/${future.id}/review`)
      .send({ reviewStatus: "validated" });
    expect(selfValidate.status).toBe(403);

    const toReview = await admin
      .patch(`/api/v1/cases/${caseId}/outputs/future/${future.id}/review`)
      .send({ reviewStatus: "in_review" });
    expect(toReview.status).toBe(200);
    expect(toReview.body.data.review.review_status).toBe("in_review");

    // The new state is what everyone reading the journey sees, not just the
    // response to the write.
    const listed = await participant.get(`/api/v1/cases/${caseId}/futures`);
    expect(listed.body.data.items.find((item) => item.id === future.id).review_status).toBe("in_review");

    const validated = await admin
      .patch(`/api/v1/cases/${caseId}/outputs/future/${future.id}/review`)
      .send({ reviewStatus: "validated" });
    expect(validated.status).toBe(200);

    // The lifecycle is closed: no free-text states, no unknown output types.
    const badStatus = await admin
      .patch(`/api/v1/cases/${caseId}/outputs/future/${future.id}/review`)
      .send({ reviewStatus: "approved" });
    expect(badStatus.status).toBe(400);
    const badKind = await admin
      .patch(`/api/v1/cases/${caseId}/outputs/nonsense/${future.id}/review`)
      .send({ reviewStatus: "validated" });
    expect(badKind.status).toBe(404);
  });

  it("applies the same lifecycle to an adaptation option and a pathway", async () => {
    ctx = await createTestApp();
    await createUser(ctx.db, { email: "admin@test.local", password: "password123", platformRole: "admin" });
    const participantId = await createUser(ctx.db, { email: "part@test.local", password: "password123" });
    const admin = await loginAgent(ctx.app, "admin@test.local", "password123");
    const participant = await loginAgent(ctx.app, "part@test.local", "password123");

    const caseId = await seedCase(admin);
    await ctx.db.run("insert into case_members (case_id, user_id, role) values (?, ?, 'user')", caseId, participantId);

    // Adaptation Options live in Phase 3, which the server keeps locked until
    // the Shared Vision phase is complete -- so unlock it the supported way
    // rather than writing round the gate.
    await admin.patch(`/api/v1/cases/${caseId}/phases/phase1`).send({ status: "completed" });
    await admin.patch(`/api/v1/cases/${caseId}/phases/phase2`).send({ status: "completed" });
    const unlocked = await admin.patch(`/api/v1/cases/${caseId}/phases/phase3`).send({ status: "current" });
    expect(unlocked.status).toBe(200);

    const optionRes = await participant.post(`/api/v1/cases/${caseId}/options`).send({ titleEl: "Μ", titleEn: "Green roofs" });
    expect(optionRes.status).toBe(201);
    const option = optionRes.body.data.option;
    expect(option.review_status).toBe("draft");
    const pathway = (
      await participant.post(`/api/v1/cases/${caseId}/pathways`).send({ titleEl: "Δ", titleEn: "Nature-based", optionIds: [option.id] })
    ).body.data.pathway;
    expect(pathway.review_status).toBe("draft");

    for (const [kind, id] of [["option", option.id], ["pathway", pathway.id]]) {
      const res = await admin.patch(`/api/v1/cases/${caseId}/outputs/${kind}/${id}/review`).send({ reviewStatus: "validated" });
      expect(res.status).toBe(200);
    }
    const options = await participant.get(`/api/v1/cases/${caseId}/options`);
    expect(options.body.data.items[0].review_status).toBe("validated");
    const pathways = await participant.get(`/api/v1/cases/${caseId}/pathways`);
    expect(pathways.body.data.items[0].review_status).toBe("validated");
  });
});
