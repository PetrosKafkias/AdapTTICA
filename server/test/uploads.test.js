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
});
