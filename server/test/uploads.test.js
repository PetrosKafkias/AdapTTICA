import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import request from "supertest";
import { createTestApp, createUser } from "./helpers.js";

describe("uploads", () => {
  let ctx;
  let uploadDir;

  beforeEach(() => {
    uploadDir = path.join(process.cwd(), "server", "test", `tmp-uploads-${Date.now()}`);
    fs.mkdirSync(uploadDir, { recursive: true });
    process.env.UPLOAD_DIR = uploadDir;
  });

  afterEach(async () => {
    if (ctx) await ctx.cleanup();
    delete process.env.UPLOAD_DIR;
    fs.rmSync(uploadDir, { recursive: true, force: true });
  });

  it("stores an allowed file and streams it back to its owner only", async () => {
    ctx = await createTestApp();
    await createUser(ctx.db, { email: "owner@test.local", password: "password123" });
    await createUser(ctx.db, { email: "other@test.local", password: "password123" });

    const owner = request.agent(ctx.app);
    await owner.post("/api/v1/auth/login").send({ email: "owner@test.local", password: "password123" });

    const uploadRes = await owner
      .post("/api/v1/files/upload")
      .attach("file", Buffer.from("hello world"), { filename: "note.txt", contentType: "text/plain" });
    expect(uploadRes.status).toBe(201);
    const fileId = uploadRes.body.data.file.id;

    const download = await owner.get(`/api/v1/files/${fileId}`);
    expect(download.status).toBe(200);
    expect(download.text).toBe("hello world");

    const other = request.agent(ctx.app);
    await other.post("/api/v1/auth/login").send({ email: "other@test.local", password: "password123" });
    const forbidden = await other.get(`/api/v1/files/${fileId}`);
    expect(forbidden.status).toBe(403);
  });

  it("rejects an unsupported file type", async () => {
    ctx = await createTestApp();
    await createUser(ctx.db, { email: "owner2@test.local", password: "password123" });
    const owner = request.agent(ctx.app);
    await owner.post("/api/v1/auth/login").send({ email: "owner2@test.local", password: "password123" });

    const res = await owner
      .post("/api/v1/files/upload")
      .attach("file", Buffer.from("bad"), { filename: "evil.exe", contentType: "application/x-msdownload" });
    expect(res.status).toBe(400);
  });

  // A Possible Future's optional image, and the Theory of Change image, both
  // reuse this same generic uploads store -- case members can view either,
  // an outsider cannot.
  it("lets case members view an image attached to a Possible Future or the Theory of Change, but not an outsider", async () => {
    ctx = await createTestApp();
    await createUser(ctx.db, { email: "admin3@test.local", password: "password123", platformRole: "admin" });
    const memberId = await createUser(ctx.db, { email: "member3@test.local", password: "password123" });
    await createUser(ctx.db, { email: "outsider3@test.local", password: "password123" });
    const admin = request.agent(ctx.app);
    await admin.post("/api/v1/auth/login").send({ email: "admin3@test.local", password: "password123" });
    const member = request.agent(ctx.app);
    await member.post("/api/v1/auth/login").send({ email: "member3@test.local", password: "password123" });
    const outsider = request.agent(ctx.app);
    await outsider.post("/api/v1/auth/login").send({ email: "outsider3@test.local", password: "password123" });

    const systems = await admin.get("/api/v1/systems");
    const hazards = await admin.get("/api/v1/hazards");
    const impact = (
      await admin.post("/api/v1/impacts").send({
        systemId: systems.body.data.items[0].id,
        titleEl: "Ε",
        titleEn: "Impact",
        hazardIds: [hazards.body.data.items[0].id],
      })
    ).body.data.impact;
    const caseStudy = (
      await admin.post("/api/v1/cases").send({ titleEl: "Υ", titleEn: "Case", impactId: impact.id, hazardIds: [hazards.body.data.items[0].id] })
    ).body.data.caseStudy;
    await ctx.db.run("insert into case_members (case_id, user_id, role) values (?, ?, 'user')", caseStudy.id, memberId);

    const futureImage = await admin
      .post("/api/v1/files/upload")
      .attach("file", Buffer.from("future-image"), { filename: "future.png", contentType: "image/png" });
    const future = (
      await admin
        .post(`/api/v1/cases/${caseStudy.id}/futures`)
        .send({ titleEl: "Μ", titleEn: "Future", imageKey: futureImage.body.data.file.key })
    ).body.data.future;
    expect(future.image_url).toBe(`/api/v1/files/${futureImage.body.data.file.key}`);

    const tocImage = await admin
      .post("/api/v1/files/upload")
      .attach("file", Buffer.from("toc-image"), { filename: "toc.png", contentType: "image/png" });
    const toc = (
      await admin.put(`/api/v1/cases/${caseStudy.id}/theory-of-change`).send({ imageKey: tocImage.body.data.file.key })
    ).body.data.theoryOfChange;
    expect(toc.image_url).toBe(`/api/v1/files/${tocImage.body.data.file.key}`);

    for (const key of [futureImage.body.data.file.key, tocImage.body.data.file.key]) {
      expect((await member.get(`/api/v1/files/${key}`)).status).toBe(200);
      expect((await outsider.get(`/api/v1/files/${key}`)).status).toBe(403);
    }
  });
});
