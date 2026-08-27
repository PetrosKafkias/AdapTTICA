import express from "express";
import { asyncRoute } from "../lib/errors.js";
import { requireUser } from "../lib/auth.js";

export const notificationsRouter = express.Router();

function toPublicNotification(row) {
  const title = JSON.parse(row.title);
  const body = JSON.parse(row.body || "{}");
  return {
    id: row.id,
    title_el: title.el,
    title_en: title.en,
    body_el: body.el || "",
    body_en: body.en || "",
    href: row.target_url,
    read_at: row.read_at,
  };
}

notificationsRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    const user = await requireUser(req);
    const rows = await req.db.all(
      "select * from notifications where user_id = ? order by created_at desc",
      user.id
    );
    res.json({ data: { items: rows.map(toPublicNotification) } });
  })
);

notificationsRouter.patch(
  "/",
  asyncRoute(async (req, res) => {
    const user = await requireUser(req);
    await req.db.run(
      "update notifications set read_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where user_id = ? and read_at is null",
      user.id
    );
    const rows = await req.db.all(
      "select * from notifications where user_id = ? order by created_at desc",
      user.id
    );
    res.json({ data: { items: rows.map(toPublicNotification) } });
  })
);

notificationsRouter.patch(
  "/:id",
  asyncRoute(async (req, res) => {
    const user = await requireUser(req);
    await req.db.run(
      "update notifications set read_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = ? and user_id = ?",
      req.params.id,
      user.id
    );
    const row = await req.db.get("select * from notifications where id = ? and user_id = ?", req.params.id, user.id);
    res.json({ data: { notification: row ? toPublicNotification(row) : undefined } });
  })
);
