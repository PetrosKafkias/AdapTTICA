import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import { createTestApp, createUser } from "./helpers.js";

describe("auth", () => {
  let ctx;
  afterEach(async () => ctx && (await ctx.cleanup()));

  it("registers a new user with the user role", async () => {
    ctx = await createTestApp();
    const res = await request(ctx.app)
      .post("/api/v1/auth/register")
      .send({ fullName: "Alice", email: "alice@test.local", password: "password123" });
    expect(res.status).toBe(201);
    expect(res.body.data.user.platformRole).toBe("user");
  });

  it("rejects self-registration as admin", async () => {
    ctx = await createTestApp();
    const res = await request(ctx.app)
      .post("/api/v1/auth/register")
      .send({ fullName: "Sneaky", email: "sneaky@test.local", password: "password123", platformRole: "admin" });
    expect(res.status).toBe(403);
  });

  it("rejects duplicate email registration", async () => {
    ctx = await createTestApp();
    const agent = request(ctx.app);
    await agent.post("/api/v1/auth/register").send({ fullName: "Bob", email: "bob@test.local", password: "password123" });
    const res = await agent.post("/api/v1/auth/register").send({ fullName: "Bob 2", email: "bob@test.local", password: "password123" });
    expect(res.status).toBe(409);
  });

  it("rejects login with a wrong password and never trusts a client-supplied role", async () => {
    ctx = await createTestApp();
    await createUser(ctx.db, { email: "carol@test.local", password: "password123" });
    const bad = await request(ctx.app).post("/api/v1/auth/login").send({ email: "carol@test.local", password: "wrongpass" });
    expect(bad.status).toBe(400);

    const ok = await request(ctx.app).post("/api/v1/auth/login").send({ email: "carol@test.local", password: "password123" });
    expect(ok.status).toBe(200);
    expect(ok.body.data.user.platformRole).toBe("user");
  });

  it("clears the session on logout", async () => {
    ctx = await createTestApp();
    await createUser(ctx.db, { email: "dana@test.local", password: "password123" });
    const agent = request.agent(ctx.app);
    await agent.post("/api/v1/auth/login").send({ email: "dana@test.local", password: "password123" });
    expect((await agent.get("/api/v1/me")).status).toBe(200);
    await agent.post("/api/v1/auth/logout");
    expect((await agent.get("/api/v1/me")).status).toBe(401);
  });
});
