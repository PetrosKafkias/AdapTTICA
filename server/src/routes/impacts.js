import crypto from "node:crypto";
import express from "express";
import { z } from "zod";
import { asyncRoute, fail } from "../lib/errors.js";
import { requireUser, requireRole } from "../lib/auth.js";
import { audit } from "../lib/audit.js";

export const impactsRouter = express.Router();

// A Climate Impact / Resilience Challenge is a fixed, admin-managed
// taxonomy entry under a Priority System — same tier as Hazards. It carries
// no co-creation content of its own (Alternative Futures, Vision, Theory of
// Change and Pathways all live on the Case Study instead); Impacts exist
// purely to organise and filter the System Overview page and to be the
// thing a Case Study picks as its primary focus.
const ADMIN_ONLY = ["admin"];

async function toPublicImpact(db, row) {
  const title = JSON.parse(row.title);
  const description = JSON.parse(row.description || "{}");
  const vulnerabilities = JSON.parse(row.vulnerabilities || "{}");
  const affectedAssets = JSON.parse(row.affected_assets || "{}");
  const hazards = await db.all(
    `select h.id, h.key, h.name from impact_hazards ih join hazards h on h.id = ih.hazard_id where ih.impact_id = ? order by h.sort_order`,
    row.id
  );
  const linkedSystems = await db.all(
    `select s.id, s.key, s.name from impact_linked_systems ils join systems s on s.id = ils.system_id where ils.impact_id = ? order by s.sort_order`,
    row.id
  );
  const caseStudyCount = await db.get(
    "select count(*) as c from case_studies where impact_id = ? and deleted_at is null",
    row.id
  );
  const pathwayCount = await db.get(
    `select count(*) as c from pathways p join case_studies cs on cs.id = p.case_id where cs.impact_id = ? and cs.deleted_at is null`,
    row.id
  );
  return {
    id: row.id,
    system_id: row.system_id,
    system_name_el: row.system_name ? JSON.parse(row.system_name).el : undefined,
    system_name_en: row.system_name ? JSON.parse(row.system_name).en : undefined,
    title_el: title.el,
    title_en: title.en,
    description_el: description.el || "",
    description_en: description.en || "",
    vulnerabilities_el: vulnerabilities.el || "",
    vulnerabilities_en: vulnerabilities.en || "",
    affected_assets_el: affectedAssets.el || "",
    affected_assets_en: affectedAssets.en || "",
    hazards: hazards.map((h) => ({ id: h.id, key: h.key, name_el: JSON.parse(h.name).el, name_en: JSON.parse(h.name).en })),
    linked_systems: linkedSystems.map((s) => ({ id: s.id, key: s.key, name_el: JSON.parse(s.name).el, name_en: JSON.parse(s.name).en })),
    case_study_count: caseStudyCount.c,
    pathway_count: pathwayCount.c,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

impactsRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    const conditions = [];
    const params = [];
    if (req.query.systemId) {
      conditions.push("i.system_id = ?");
      params.push(req.query.systemId);
    }
    if (req.query.relatedSystemId) {
      conditions.push(
        "(i.system_id = ? or exists (select 1 from impact_linked_systems ils where ils.impact_id = i.id and ils.system_id = ?))"
      );
      params.push(req.query.relatedSystemId, req.query.relatedSystemId);
    }
    if (req.query.hazardId) {
      conditions.push("exists (select 1 from impact_hazards ih where ih.impact_id = i.id and ih.hazard_id = ?)");
      params.push(req.query.hazardId);
    }
    const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
    const rows = await req.db.all(
      `select i.*, s.name as system_name from impacts i join systems s on s.id = i.system_id ${where} order by i.updated_at desc`,
      ...params
    );
    const items = await Promise.all(rows.map((row) => toPublicImpact(req.db, row)));
    res.json({ data: { items } });
  })
);

impactsRouter.get(
  "/:id",
  asyncRoute(async (req, res) => {
    const row = await req.db.get(
      `select i.*, s.name as system_name from impacts i join systems s on s.id = i.system_id where i.id = ?`,
      req.params.id
    );
    if (!row) return fail(res, "not_found", "Impact not found.");
    const impact = await toPublicImpact(req.db, row);
    const mapCase = (cs) => {
      const title = JSON.parse(cs.title);
      const description = JSON.parse(cs.description || "{}");
      const area = JSON.parse(cs.area || "{}");
      return {
        id: cs.id,
        public_id: cs.slug,
        title_el: title.el,
        title_en: title.en,
        description_el: description.el || "",
        description_en: description.en || "",
        area_el: area.el || "",
        area_en: area.en || "",
        status: cs.status,
        starts_on: cs.starts_on,
        due_on: cs.due_on,
        member_count: Number(cs.member_count || 0),
        organisation_name: cs.organisation_name || "",
      };
    };
    const primaryCases = await req.db.all(
      `select cs.id, cs.slug, cs.title, cs.description, cs.area, cs.status, cs.starts_on, cs.due_on,
              o.name as organisation_name,
              (select count(*) from case_members cm where cm.case_id = cs.id) as member_count
       from case_studies cs
       left join organisations o on o.id = cs.organisation_id
       where cs.impact_id = ? and cs.deleted_at is null order by cs.updated_at desc`,
      req.params.id
    );
    impact.case_studies = primaryCases.map(mapCase);
    // Section 4E's "Linked system" bucket: case studies whose own Primary
    // System is a *different* system, but which reference this impact's
    // system via their own linked-systems tags (case-level or via their
    // impact's typical tags). A case already primary for this system under
    // a different impact is excluded -- it belongs to that impact's view,
    // not this one.
    const linkedCases = await req.db.all(
      `select distinct cs.id, cs.slug, cs.title, cs.description, cs.area, cs.status, cs.starts_on, cs.due_on,
              o.name as organisation_name,
              (select count(*) from case_members cm where cm.case_id = cs.id) as member_count
       from case_studies cs
       join impacts ci on ci.id = cs.impact_id
       left join organisations o on o.id = cs.organisation_id
       left join case_linked_systems cls on cls.case_id = cs.id
       left join impact_linked_systems ils on ils.impact_id = ci.id
       where cs.deleted_at is null and ci.system_id != ? and (cls.system_id = ? or ils.system_id = ?)
       order by cs.updated_at desc`,
      row.system_id,
      row.system_id,
      row.system_id
    );
    impact.linked_case_studies = linkedCases.map(mapCase);
    const caseIds = [...primaryCases.map((c) => c.id), ...linkedCases.map((c) => c.id)];
    impact.pathways = [];
    if (caseIds.length) {
      const placeholders = caseIds.map(() => "?").join(",");
      const pathwayRows = await req.db.all(
        `select p.id, p.title, p.status, p.case_id, cs.title as case_title from pathways p
         join case_studies cs on cs.id = p.case_id where p.case_id in (${placeholders}) order by p.updated_at desc`,
        ...caseIds
      );
      impact.pathways = pathwayRows.map((p) => {
        const title = JSON.parse(p.title);
        const caseTitle = JSON.parse(p.case_title);
        return {
          id: p.id,
          title_el: title.el,
          title_en: title.en,
          status: p.status,
          case_id: p.case_id,
          case_title_el: caseTitle.el,
          case_title_en: caseTitle.en,
        };
      });
    }
    res.json({ data: { impact } });
  })
);

const impactSchema = z.object({
  systemId: z.string().min(1, "A primary system is required."),
  titleEl: z.string().trim().min(1, "Title is required."),
  titleEn: z.string().trim().min(1, "Title is required."),
  descriptionEl: z.string().trim().optional(),
  descriptionEn: z.string().trim().optional(),
  vulnerabilitiesEl: z.string().trim().optional(),
  vulnerabilitiesEn: z.string().trim().optional(),
  affectedAssetsEl: z.string().trim().optional(),
  affectedAssetsEn: z.string().trim().optional(),
  hazardIds: z.array(z.string()).optional(),
  linkedSystemIds: z.array(z.string()).optional(),
});

impactsRouter.post(
  "/",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    requireRole(req.user, ...ADMIN_ONLY);
    const parsed = impactSchema.safeParse(req.body || {});
    if (!parsed.success) {
      const fields = {};
      for (const issue of parsed.error.issues) fields[issue.path[0]] = issue.message;
      return fail(res, "validation_error", "Please correct the highlighted fields.", fields);
    }
    const body = parsed.data;
    const id = crypto.randomUUID();
    await req.db.run(
      `insert into impacts (id, system_id, title, description, vulnerabilities, affected_assets, created_by)
       values (?, ?, ?, ?, ?, ?, ?)`,
      id,
      body.systemId,
      JSON.stringify({ el: body.titleEl, en: body.titleEn }),
      JSON.stringify({ el: body.descriptionEl || "", en: body.descriptionEn || "" }),
      JSON.stringify({ el: body.vulnerabilitiesEl || "", en: body.vulnerabilitiesEn || "" }),
      JSON.stringify({ el: body.affectedAssetsEl || "", en: body.affectedAssetsEn || "" }),
      req.user.id
    );
    for (const hazardId of body.hazardIds || []) {
      await req.db.run("insert into impact_hazards (impact_id, hazard_id) values (?, ?)", id, hazardId);
    }
    for (const systemId of body.linkedSystemIds || []) {
      if (systemId === body.systemId) continue;
      await req.db.run("insert into impact_linked_systems (impact_id, system_id) values (?, ?)", id, systemId);
    }
    await audit(req.db, { actorId: req.user.id, action: "create_impact", entityType: "impact", entityId: id });
    const row = await req.db.get(`select i.*, s.name as system_name from impacts i join systems s on s.id = i.system_id where i.id = ?`, id);
    res.status(201).json({ data: { impact: await toPublicImpact(req.db, row) } });
  })
);

const impactPatchSchema = impactSchema.partial();

impactsRouter.patch(
  "/:id",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    requireRole(req.user, ...ADMIN_ONLY);
    const existing = await req.db.get("select * from impacts where id = ?", req.params.id);
    if (!existing) return fail(res, "not_found", "Impact not found.");
    const parsed = impactPatchSchema.safeParse(req.body || {});
    if (!parsed.success) return fail(res, "validation_error", "Please correct the highlighted fields.");
    const body = parsed.data;
    const title = JSON.parse(existing.title);
    const description = JSON.parse(existing.description || "{}");
    const vulnerabilities = JSON.parse(existing.vulnerabilities || "{}");
    const affectedAssets = JSON.parse(existing.affected_assets || "{}");
    if (body.titleEl !== undefined) title.el = body.titleEl;
    if (body.titleEn !== undefined) title.en = body.titleEn;
    if (body.descriptionEl !== undefined) description.el = body.descriptionEl;
    if (body.descriptionEn !== undefined) description.en = body.descriptionEn;
    if (body.vulnerabilitiesEl !== undefined) vulnerabilities.el = body.vulnerabilitiesEl;
    if (body.vulnerabilitiesEn !== undefined) vulnerabilities.en = body.vulnerabilitiesEn;
    if (body.affectedAssetsEl !== undefined) affectedAssets.el = body.affectedAssetsEl;
    if (body.affectedAssetsEn !== undefined) affectedAssets.en = body.affectedAssetsEn;
    await req.db.run(
      `update impacts set system_id = coalesce(?, system_id), title = ?, description = ?,
         vulnerabilities = ?, affected_assets = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') where id = ?`,
      body.systemId ?? null,
      JSON.stringify(title),
      JSON.stringify(description),
      JSON.stringify(vulnerabilities),
      JSON.stringify(affectedAssets),
      req.params.id
    );
    if (body.hazardIds !== undefined) {
      await req.db.run("delete from impact_hazards where impact_id = ?", req.params.id);
      for (const hazardId of body.hazardIds) {
        await req.db.run("insert into impact_hazards (impact_id, hazard_id) values (?, ?)", req.params.id, hazardId);
      }
    }
    if (body.linkedSystemIds !== undefined) {
      await req.db.run("delete from impact_linked_systems where impact_id = ?", req.params.id);
      for (const systemId of body.linkedSystemIds) {
        await req.db.run("insert into impact_linked_systems (impact_id, system_id) values (?, ?)", req.params.id, systemId);
      }
    }
    await audit(req.db, { actorId: req.user.id, action: "update_impact", entityType: "impact", entityId: req.params.id });
    const row = await req.db.get(
      `select i.*, s.name as system_name from impacts i join systems s on s.id = i.system_id where i.id = ?`,
      req.params.id
    );
    res.json({ data: { impact: await toPublicImpact(req.db, row) } });
  })
);
