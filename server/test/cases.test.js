import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import { createTestApp, createUser } from "./helpers.js";

async function loginAgent(app, email, password) {
  const agent = request.agent(app);
  await agent.post("/api/v1/auth/login").send({ email, password });
  return agent;
}

describe("cases", () => {
  let ctx;
  afterEach(async () => ctx && (await ctx.cleanup()));

  it("lets an anonymous visitor browse the case-study catalogue but not open a case's detail", async () => {
    ctx = await createTestApp();
    await createUser(ctx.db, { email: "admin0@test.local", password: "password123", platformRole: "admin" });
    const admin = await loginAgent(ctx.app, "admin0@test.local", "password123");
    const created = await admin.post("/api/v1/cases").send({ titleEl: "Δ", titleEn: "Public case" });
    const caseId = created.body.data.caseStudy.id;

    const anonymous = request(ctx.app);
    const list = await anonymous.get("/api/v1/cases");
    expect(list.status).toBe(200);
    expect(list.body.data.items.some((c) => c.id === caseId)).toBe(true);

    const detail = await anonymous.get(`/api/v1/cases/${caseId}`);
    expect(detail.status).toBe(401);

    const signedIn = await admin.get(`/api/v1/cases/${caseId}`);
    expect(signedIn.status).toBe(200);
    expect(signedIn.body.data.caseStudy.title_en).toBe("Public case");
  });

  it("only lets an admin create a case study", async () => {
    ctx = await createTestApp();
    await createUser(ctx.db, { email: "admin@test.local", password: "password123", platformRole: "admin" });
    await createUser(ctx.db, { email: "user@test.local", password: "password123" });

    const user = await loginAgent(ctx.app, "user@test.local", "password123");
    const denied = await user.post("/api/v1/cases").send({ titleEl: "Δ", titleEn: "Test" });
    expect(denied.status).toBe(403);

    const admin = await loginAgent(ctx.app, "admin@test.local", "password123");
    const created = await admin.post("/api/v1/cases").send({ titleEl: "Δοκιμή", titleEn: "Test case", descriptionEl: "Π", descriptionEn: "D" });
    expect(created.status).toBe(201);
    expect(created.body.data.caseStudy.title_en).toBe("Test case");

    const list = await user.get("/api/v1/cases");
    expect(list.body.data.items.some((c) => c.id === created.body.data.caseStudy.id)).toBe(true);
  });

  it("supports the full decision -> comment -> vote -> status flow", async () => {
    ctx = await createTestApp();
    await createUser(ctx.db, { email: "admin2@test.local", password: "password123", platformRole: "admin" });
    await createUser(ctx.db, { email: "member@test.local", password: "password123" });

    const admin = await loginAgent(ctx.app, "admin2@test.local", "password123");
    const member = await loginAgent(ctx.app, "member@test.local", "password123");

    const caseRes = await admin.post("/api/v1/cases").send({ titleEl: "Υ", titleEn: "Case" });
    const caseId = caseRes.body.data.caseStudy.id;

    const decisionRes = await admin.post(`/api/v1/cases/${caseId}/decisions`).send({ titleEl: "Α", titleEn: "Decision", status: "open" });
    expect(decisionRes.status).toBe(201);
    const decisionId = decisionRes.body.data.decision.id;

    const commentRes = await member.post(`/api/v1/decisions/${decisionId}/comments`).send({ body: "Looks good" });
    expect(commentRes.status).toBe(201);

    const commentsList = await member.get(`/api/v1/decisions/${decisionId}/comments`);
    expect(commentsList.body.data.items).toHaveLength(1);

    const voteRes = await member.post(`/api/v1/decisions/${decisionId}/vote`).send({ value: "support" });
    expect(voteRes.status).toBe(200);
    expect(voteRes.body.data.results).toEqual([{ value: "support", count: 1 }]);

    // a non-coordinator/admin cannot change decision status
    const forbidden = await member.patch(`/api/v1/decisions/${decisionId}/status`).send({ status: "decided" });
    expect(forbidden.status).toBe(403);

    const statusRes = await admin.patch(`/api/v1/decisions/${decisionId}/status`).send({ status: "decided" });
    expect(statusRes.status).toBe(200);
    // The API maps the internal "decided" status to the public-facing
    // "approved" label (see publicStatus in server/src/routes/decisions.js).
    expect(statusRes.body.data.decision.status).toBe("approved");
  });

  it("notifies other case participants (but not the creator) when a decision is added", async () => {
    ctx = await createTestApp();
    await createUser(ctx.db, { email: "admin3@test.local", password: "password123", platformRole: "admin" });
    const memberId = await createUser(ctx.db, { email: "member3@test.local", password: "password123" });

    const admin = await loginAgent(ctx.app, "admin3@test.local", "password123");
    const caseRes = await admin.post("/api/v1/cases").send({ titleEl: "Υ", titleEn: "Case" });
    const caseId = caseRes.body.data.caseStudy.id;
    await ctx.db.run("insert into case_members (case_id, user_id, role) values (?, ?, 'user')", caseId, memberId);

    const decisionRes = await admin.post(`/api/v1/cases/${caseId}/decisions`).send({ titleEl: "Α", titleEn: "Decision" });
    expect(decisionRes.status).toBe(201);

    const member = await loginAgent(ctx.app, "member3@test.local", "password123");
    const memberNotifications = await member.get("/api/v1/notifications");
    expect(memberNotifications.body.data.items.some((n) => n.title_en === 'New decision in "Case"')).toBe(true);

    // The creator (also a case member, via the admin coordinator row added
    // on case creation) must not notify themselves.
    const adminNotifications = await admin.get("/api/v1/notifications");
    expect(adminNotifications.body.data.items.some((n) => n.title_en?.startsWith("New decision"))).toBe(false);
  });

  it("lets any registered user submit a resource, but only approved ones are public", async () => {
    ctx = await createTestApp();
    await createUser(ctx.db, { email: "plain@test.local", password: "password123" });
    await createUser(ctx.db, { email: "mod@test.local", password: "password123", platformRole: "admin" });

    const plain = await loginAgent(ctx.app, "plain@test.local", "password123");
    const missingLicence = await plain.post("/api/v1/resources").send({ titleEl: "Π", titleEn: "R", fileKey: "k", fileName: "f.pdf" });
    expect(missingLicence.status).toBe(400);
    expect(missingLicence.body.error.fields.licence).toBeTruthy();

    const created = await plain
      .post("/api/v1/resources")
      .send({ titleEl: "Π", titleEn: "R", fileKey: "k", fileName: "f.pdf", licence: "CC-BY-4.0" });
    expect(created.status).toBe(201);
    expect(created.body.data.resource.status).toBe("pending_review");
    const resourceId = created.body.data.resource.id;

    const anonymousBefore = await request(ctx.app).get("/api/v1/resources");
    expect(anonymousBefore.body.data.items.some((r) => r.id === resourceId)).toBe(false);

    // The submitter can still see their own pending submission.
    const own = await plain.get("/api/v1/resources");
    expect(own.body.data.items.some((r) => r.id === resourceId && r.is_own)).toBe(true);

    const nonAdminReview = await plain.patch(`/api/v1/resources/${resourceId}/status`).send({ status: "approved" });
    expect(nonAdminReview.status).toBe(403);

    const mod = await loginAgent(ctx.app, "mod@test.local", "password123");
    const approved = await mod.patch(`/api/v1/resources/${resourceId}/status`).send({ status: "approved" });
    expect(approved.status).toBe(200);
    expect(approved.body.data.resource.status).toBe("approved");

    const anonymousAfter = await request(ctx.app).get("/api/v1/resources");
    expect(anonymousAfter.body.data.items.some((r) => r.id === resourceId)).toBe(true);
  });

  it("supports creating and listing workshop outputs, gated to case coordinators", async () => {
    ctx = await createTestApp();
    await createUser(ctx.db, { email: "admin3@test.local", password: "password123", platformRole: "admin" });
    await createUser(ctx.db, { email: "member2@test.local", password: "password123" });

    const admin = await loginAgent(ctx.app, "admin3@test.local", "password123");
    const member = await loginAgent(ctx.app, "member2@test.local", "password123");

    const caseRes = await admin.post("/api/v1/cases").send({ titleEl: "Υ", titleEn: "Case" });
    const caseId = caseRes.body.data.caseStudy.id;

    const denied = await member.post(`/api/v1/cases/${caseId}/workshop-outputs`).send({ titleEl: "Α", titleEn: "Output" });
    expect(denied.status).toBe(403);

    const created = await admin.post(`/api/v1/cases/${caseId}/workshop-outputs`).send({
      titleEl: "Αποτέλεσμα",
      titleEn: "Output",
      descriptionEl: "Περιγραφή",
      descriptionEn: "Description",
      workshopLabel: "Εργαστήριο 1",
    });
    expect(created.status).toBe(201);
    expect(created.body.data.output.status).toBe("submitted");
    expect(created.body.data.output.status_label_en).toBe("Submitted for review");
    const outputId = created.body.data.output.id;

    const list = await member.get(`/api/v1/cases/${caseId}/workshop-outputs`);
    expect(list.status).toBe(200);
    expect(list.body.data.items).toHaveLength(1);
    expect(list.body.data.items[0].author_name).toBe("Test User");

    const statusDenied = await member.patch(`/api/v1/workshop-outputs/${outputId}/status`).send({ status: "approved" });
    expect(statusDenied.status).toBe(403);

    const statusRes = await admin.patch(`/api/v1/workshop-outputs/${outputId}/status`).send({ status: "approved" });
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.data.output.status_label_el).toBe("Εγκρίθηκε");
  });
});
