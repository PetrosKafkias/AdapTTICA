import { describe, it, expect, afterEach, vi } from "vitest";
import request from "supertest";
import { createTestApp, createUser } from "./helpers.js";

async function loginAgent(app, email, password) {
  const agent = request.agent(app);
  await agent.post("/api/v1/auth/login").send({ email, password });
  return agent;
}

// The raw invitation token is only ever exposed via the (intentional)
// console.log breadcrumb — it's never returned in the API response and
// only the SHA-256 hash is stored — so tests recover it the same way a
// developer would in an environment with no real email provider wired up.
function extractInviteToken(logSpy) {
  const line = logSpy.mock.calls.map((args) => args.join(" ")).find((text) => text.includes("token="));
  return line?.match(/token=([\w-]+)/)?.[1];
}

describe("invitations", () => {
  let ctx;
  afterEach(async () => ctx && (await ctx.cleanup()));

  it("lets an invited existing user accept an invitation into real case membership", async () => {
    ctx = await createTestApp();
    await createUser(ctx.db, { email: "coordinator@test.local", password: "password123", platformRole: "admin" });
    await createUser(ctx.db, { email: "invitee@test.local", password: "password123" });

    const coordinator = await loginAgent(ctx.app, "coordinator@test.local", "password123");
    const caseRes = await coordinator.post("/api/v1/cases").send({ titleEl: "Δ", titleEn: "Invite case" });
    const caseId = caseRes.body.data.caseStudy.id;

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const inviteRes = await coordinator
      .post(`/api/v1/cases/${caseId}/invitations`)
      .send({ email: "invitee@test.local", role: "representative" });
    expect(inviteRes.status).toBe(201);
    expect(inviteRes.body.data.existingUser).toBe(true);
    const token = extractInviteToken(logSpy);
    logSpy.mockRestore();
    expect(token).toBeTruthy();

    const lookup = await request(ctx.app).get(`/api/v1/invitations/${token}`);
    expect(lookup.status).toBe(200);
    expect(lookup.body.data.invitation.caseTitleEn).toBe("Invite case");
    expect(lookup.body.data.invitation.role).toBe("representative");

    // Wrong account can't redeem someone else's invitation.
    await createUser(ctx.db, { email: "someone-else@test.local", password: "password123" });
    const wrongUser = await loginAgent(ctx.app, "someone-else@test.local", "password123");
    const wrongAttempt = await wrongUser.post(`/api/v1/invitations/${token}/accept`);
    expect(wrongAttempt.status).toBe(403);

    const invitee = await loginAgent(ctx.app, "invitee@test.local", "password123");
    const accept = await invitee.post(`/api/v1/invitations/${token}/accept`);
    expect(accept.status).toBe(200);
    expect(accept.body.data.caseId).toBe(caseId);

    const members = await coordinator.get(`/api/v1/cases/${caseId}/members`);
    const membership = members.body.data.items.find((m) => m.email === "invitee@test.local");
    expect(membership?.role).toBe("representative");

    // The token is single-use.
    const secondAttempt = await invitee.post(`/api/v1/invitations/${token}/accept`);
    expect(secondAttempt.status).toBe(409);
  });
});
