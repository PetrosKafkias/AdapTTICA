import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createTestApp, createUser } from "./helpers.js";

async function loginAgent(app, email, password) {
  const agent = request.agent(app);
  await agent.post("/api/v1/auth/login").send({ email, password });
  return agent;
}

describe("regional resilience journey", () => {
  let ctx;
  afterEach(async () => ctx && (await ctx.cleanup()));

  it("keeps Priority System comments persistent and authenticated", async () => {
    ctx = await createTestApp();
    await createUser(ctx.db, {
      email: "participant@test.local",
      password: "password123",
      fullName: "Regional participant",
    });
    const participant = await loginAgent(ctx.app, "participant@test.local", "password123");
    const system = (await participant.get("/api/v1/systems")).body.data.items[0];

    expect((await request(ctx.app).get(`/api/v1/systems/${system.id}/comments`)).status).toBe(401);

    const created = await participant
      .post(`/api/v1/systems/${system.id}/comments`)
      .send({ body: "This baseline needs a newer regional evidence source." });
    expect(created.status).toBe(201);
    expect(created.body.data.comment.author_name).toBe("Regional participant");

    const persisted = await participant.get(`/api/v1/systems/${system.id}/comments`);
    expect(persisted.status).toBe(200);
    expect(persisted.body.data.commentCount).toBe(1);
    expect(persisted.body.data.items[0].body).toContain("newer regional evidence");
  });
});
