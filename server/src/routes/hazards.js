import express from "express";
import { asyncRoute } from "../lib/errors.js";

export const hazardsRouter = express.Router();

function toPublicHazard(row) {
  const name = JSON.parse(row.name);
  return { id: row.id, key: row.key, name_el: name.el, name_en: name.en };
}

// Hazards are a fixed taxonomy seeded by the migration — used as tags on
// Challenges/Pathways rather than a top-level category, per the Pentsiou
// review comments. Browsing is public.
hazardsRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    const rows = await req.db.all("select * from hazards order by sort_order");
    res.json({ data: { items: rows.map(toPublicHazard) } });
  })
);
