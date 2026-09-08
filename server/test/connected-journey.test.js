import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import { createTestApp, createUser } from "./helpers.js";

async function loginAgent(app, email, password) {
  const agent = request.agent(app);
  await agent.post("/api/v1/auth/login").send({ email, password });
  return agent;
}

describe("connected Priority System journey", () => {
  let ctx;
  afterEach(async () => ctx && (await ctx.cleanup()));

  it("surfaces one case and its pathway everywhere from shared relationships, then updates and removes it everywhere", async () => {
    ctx = await createTestApp();
    await createUser(ctx.db, { email: "admin@test.local", password: "password123", platformRole: "admin" });
    const admin = await loginAgent(ctx.app, "admin@test.local", "password123");

    const systems = (await admin.get("/api/v1/systems")).body.data.items;
    const byKey = Object.fromEntries(systems.map((item) => [item.key, item]));
    expect(byKey.water.description_en).toContain("Water resilience");
    expect(byKey.water.key_vulnerabilities_en).toContain("urban flooding");
    expect(byKey.water.rccap_priorities_en).toContain("RCCAP baseline");
    const flood = (await admin.get("/api/v1/hazards")).body.data.items.find((item) => item.key === "floods");
    const linked = [byKey.water, byKey.transport, byKey.health, byKey.emergency_response];
    const impact = (
      await admin.post("/api/v1/impacts").send({
        systemId: byKey.built_environment.id,
        titleEl: "Αστικές πλημμύρες",
        titleEn: "Urban Flooding",
        hazardIds: [flood.id],
        linkedSystemIds: linked.map((item) => item.id),
      })
    ).body.data.impact;

    const created = await admin.post("/api/v1/cases").send({
      titleEl: "Ανθεκτικότητα στις πλημμύρες",
      titleEn: "Flood resilience",
      descriptionEl: "Συνδεδεμένη μελέτη",
      descriptionEn: "Connected case study",
      impactId: impact.id,
      hazardIds: [flood.id],
      linkedSystemIds: linked.map((item) => item.id),
    });
    expect(created.status).toBe(201);
    const caseStudy = created.body.data.caseStudy;
    await admin.patch(`/api/v1/cases/${caseStudy.id}/phases/phase2`).send({ status: "completed" });
    await admin.patch(`/api/v1/cases/${caseStudy.id}/phases/phase3`).send({ status: "current" });

    const waterImpacts = (await admin.get(`/api/v1/impacts?relatedSystemId=${byKey.water.id}`)).body.data.items;
    expect(waterImpacts.some((item) => item.id === impact.id && item.system_id === byKey.built_environment.id)).toBe(true);
    const waterCatalogueRow = (await admin.get("/api/v1/systems")).body.data.items.find((item) => item.id === byKey.water.id);
    expect(waterCatalogueRow.impact_count).toBe(waterImpacts.length);

    const pathwayCreated = await admin.post(`/api/v1/cases/${caseStudy.id}/pathways`).send({
      titleEl: "Διαδρομή 1",
      titleEn: "Pathway 1",
      timeHorizon: "2040",
    });
    expect(pathwayCreated.status).toBe(201);
    expect(pathwayCreated.body.data.pathway.primary_system_id).toBe(byKey.built_environment.id);
    expect(pathwayCreated.body.data.pathway.relevant_hazards).toEqual(["floods"]);
    expect(pathwayCreated.body.data.pathway.linked_systems.map((item) => item.id).sort()).toEqual(linked.map((item) => item.id).sort());

    const assertSystemHasJourney = async (system, relationship) => {
      const detail = (await admin.get(`/api/v1/systems/${system.id}`)).body.data.system;
      const bucket = relationship === "primary" ? detail.case_studies : detail.linked_case_studies;
      expect(bucket.some((item) => item.id === caseStudy.id)).toBe(true);
      expect(detail.pathways.some((item) => item.case_id === caseStudy.id && item.title_en === "Pathway 1")).toBe(true);
    };
    await assertSystemHasJourney(byKey.built_environment, "primary");
    for (const system of linked) await assertSystemHasJourney(system, "linked");

    const waterDetail = (await admin.get(`/api/v1/systems/${byKey.water.id}`)).body.data.system;
    const enrichedWaterCase = waterDetail.linked_case_studies.find((item) => item.id === caseStudy.id);
    expect(enrichedWaterCase.description_en).toBe("Connected case study");
    expect(enrichedWaterCase.impact_title_en).toBe("Urban Flooding");
    expect(enrichedWaterCase.primary_system_name_en).toBe("Built Environment");
    expect(enrichedWaterCase.member_count).toBe(1);

    const impactDetail = (await admin.get(`/api/v1/impacts/${impact.id}`)).body.data.impact;
    expect(impactDetail.case_studies.some((item) => item.id === caseStudy.id)).toBe(true);
    expect(impactDetail.pathways.some((item) => item.case_id === caseStudy.id)).toBe(true);
    const catalogue = (await admin.get("/api/v1/cases")).body.data.items;
    expect(catalogue.some((item) => item.id === caseStudy.id)).toBe(true);

    const updated = await admin.patch(`/api/v1/cases/${caseStudy.id}`).send({ titleEn: "Flood resilience — updated" });
    expect(updated.status).toBe(200);
    const waterAfterEdit = (await admin.get(`/api/v1/systems/${byKey.water.id}`)).body.data.system;
    expect(waterAfterEdit.linked_case_studies.find((item) => item.id === caseStudy.id).title_en).toContain("updated");

    const deleted = await admin.delete(`/api/v1/cases/${caseStudy.id}`);
    expect(deleted.status).toBe(200);
    for (const system of [byKey.built_environment, ...linked]) {
      const detail = (await admin.get(`/api/v1/systems/${system.id}`)).body.data.system;
      expect([...detail.case_studies, ...detail.linked_case_studies].some((item) => item.id === caseStudy.id)).toBe(false);
      expect(detail.pathways.some((item) => item.case_id === caseStudy.id)).toBe(false);
    }
  });

  it("allows only an Administrator to delete a case study", async () => {
    ctx = await createTestApp();
    await createUser(ctx.db, { email: "admin@test.local", password: "password123", platformRole: "admin" });
    const coordinatorId = await createUser(ctx.db, { email: "coord@test.local", password: "password123", platformRole: "coordinator" });
    const admin = await loginAgent(ctx.app, "admin@test.local", "password123");
    const coordinator = await loginAgent(ctx.app, "coord@test.local", "password123");
    const systems = (await admin.get("/api/v1/systems")).body.data.items;
    const hazard = (await admin.get("/api/v1/hazards")).body.data.items[0];
    const impact = (
      await admin.post("/api/v1/impacts").send({ systemId: systems[0].id, titleEl: "Επίπτωση", titleEn: "Impact", hazardIds: [hazard.id] })
    ).body.data.impact;
    const caseStudy = (
      await admin.post("/api/v1/cases").send({ titleEl: "Μελέτη", titleEn: "Case", impactId: impact.id, hazardIds: [hazard.id] })
    ).body.data.caseStudy;
    await ctx.db.run("insert into case_members (case_id, user_id, role) values (?, ?, 'coordinator')", caseStudy.id, coordinatorId);
    expect((await coordinator.delete(`/api/v1/cases/${caseStudy.id}`)).status).toBe(403);
    expect((await admin.delete(`/api/v1/cases/${caseStudy.id}`)).status).toBe(200);
  });
});
