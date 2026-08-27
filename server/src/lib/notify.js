import crypto from "node:crypto";

// In-app notifications. The `notifications` table has existed since the
// original schema, but nothing in this codebase ever inserted into it —
// this is the first place that does.
export async function notifyUser(db, { userId, eventType, titleEl, titleEn, bodyEl = "", bodyEn = "", targetUrl = null }) {
  await db.run(
    "insert into notifications (id, user_id, event_type, title, body, target_url) values (?, ?, ?, ?, ?, ?)",
    crypto.randomUUID(),
    userId,
    eventType,
    JSON.stringify({ el: titleEl, en: titleEn }),
    JSON.stringify({ el: bodyEl, en: bodyEn }),
    targetUrl
  );
}
