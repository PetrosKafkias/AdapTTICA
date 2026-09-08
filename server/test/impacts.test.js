import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import { createTestApp, createUser } from "./helpers.js";

async function loginAgent(app, email, password) {
  const agent = request.agent(app);
  await agent.post("/api/v1/auth/login").send({ email, password });
  return agent;
}

describe("systems and hazards", () => {
  let ctx;
  afterEach(async () => ctx && (await ctx.cleanup()));

  it("lets anyone browse the seeded systems/hazards taxonomy, with per-system stats", async () => {
    ctx = await createTestApp();
    const anonymous = request(ctx.app);
    const systems = await anonymous.get("/api/v1/systems");
    expect(systems.status).toBe(200);
    expect(systems.body.data.items).toHaveLength(10);
    expect(systems.body.data.items.some((s) => s.key === "emergency_response" && s.is_horizontal)).toBe(true);
    expect(systems.body.data.items[0]).toHaveProperty("impact_count");
    expect(systems.body.data.items[0]).toHaveProperty("case_study_count");
    expect(systems.body.data.items[0]).toHaveProperty("pathway_count");

    const hazards = await anonymous.get("/api/v1/hazards");
    expect(hazards.status).toBe(200);
    expect(hazards.body.data.items).toHaveLength(5);
  });
});

describe("impacts (Climate Impact / Resilience Challenge taxonomy)", () => {
  let ctx;
  afterEach(async () => ctx && (await ctx.cleanup()));

  it("lets an admin create an impact, but denies representatives and coordinators", async () => {
    ctx = await createTestApp();
    await createUser(ctx.db, { email: "admin@test.local", password: "password123", platformRole: "admin" });
    await createUser(ctx.db, { email: "rep@test.local", password: "password123", platformRole: "representative" });

    const admin = await loginAgent(ctx.app, "admin@test.local", "password123");
    const rep = await loginAgent(ctx.app, "rep@test.local", "password123");
    const systems = await admin.get("/api/v1/systems");
    const hazards = await admin.get("/api/v1/hazards");
    const system = systems.body.data.items[0];
    const hazard = hazards.body.data.items[0];

    const denied = await rep.post("/api/v1/impacts").send({ systemId: system.id, titleEl: "Δ", titleEn: "Denied" });
    expect(denied.status).toBe(403);

    const created = await admin.post("/api/v1/impacts").send({
      systemId: system.id,
      titleEl: "Αστική πλημμύρα",
      titleEn: "Urban flooding",
      hazardIds: [hazard.id],
    });
    expect(created.status).toBe(201);
    expect(created.body.data.impact.title_en).toBe("Urban flooding");
    expect(created.body.data.impact.hazards).toHaveLength(1);
    expect(created.body.data.impact.case_study_count).toBe(0);

    const detail = await rep.get(`/api/v1/impacts/${created.body.data.impact.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.impact.case_studies).toEqual([]);
  });
});
