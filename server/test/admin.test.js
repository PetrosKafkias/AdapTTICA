import { describe, it, expect, afterEach } from "vitest";
import request from "supertest";
import { createTestApp, createUser } from "./helpers.js";

async function loginAgent(app, email, password) {
  const agent = request.agent(app);
  await agent.post("/api/v1/auth/login").send({ email, password });
  return agent;
}

describe("admin", () => {
  let ctx;
  afterEach(async () => ctx && (await ctx.cleanup()));

  it("blocks non-admins from every /admin route", async () => {
    ctx = await createTestApp();
    await createUser(ctx.db, { email: "u@test.local", password: "password123" });
    const user = await loginAgent(ctx.app, "u@test.local", "password123");
    expect((await user.get("/api/v1/admin/users")).status).toBe(403);
    expect((await user.get("/api/v1/admin/audit")).status).toBe(403);
    expect((await user.patch("/api/v1/admin/users/anything").send({ platformRole: "admin" })).status).toBe(403);
  });

  it("lets an admin change a user's role and records it in the audit log", async () => {
    ctx = await createTestApp();
    await createUser(ctx.db, { email: "admin@test.local", password: "password123", platformRole: "admin" });
    const targetId = await createUser(ctx.db, { email: "target@test.local", password: "password123" });
    const admin = await loginAgent(ctx.app, "admin@test.local", "password123");

    const before = await admin.get("/api/v1/admin/users");
    const target = before.body.data.items.find((u) => u.id === targetId);
    expect(target.platform_role).toBe("user");
    expect(target.active).toBe(true);

    const patchRes = await admin.patch(`/api/v1/admin/users/${targetId}`).send({ platformRole: "representative" });
    expect(patchRes.status).toBe(200);

    const after = await admin.get("/api/v1/admin/users");
    expect(after.body.data.items.find((u) => u.id === targetId).platform_role).toBe("representative");

    const audit = await admin.get("/api/v1/admin/audit");
    expect(audit.body.data.items.some((entry) => entry.action === "change_role")).toBe(true);
  });
});
