import crypto from "node:crypto";
import express from "express";
import { z } from "zod";
import { asyncRoute, fail } from "../lib/errors.js";
import { requireUser, requireRole } from "../lib/auth.js";
import { audit } from "../lib/audit.js";

export const systemsRouter = express.Router();

function toPublicSystem(row) {
  const name = JSON.parse(row.name);
  const description = row.description ? JSON.parse(row.description) : {};
  const vulnerabilities = row.key_vulnerabilities ? JSON.parse(row.key_vulnerabilities) : {};
  const priorities = row.rccap_priorities ? JSON.parse(row.rccap_priorities) : {};
  return {
    id: row.id,
    key: row.key,
    name_el: name.el,
    name_en: name.en,
    icon_key: row.icon_key,
    is_horizontal: Boolean(row.is_horizontal),
    description_el: description.el || "",
    description_en: description.en || "",
    key_vulnerabilities_el: vulnerabilities.el || "",
    key_vulnerabilities_en: vulnerabilities.en || "",
    rccap_priorities_el: priorities.el || "",
    rccap_priorities_en: priorities.en || "",
    impact_count: row.impact_count || 0,
    case_study_count: row.case_study_count || 0,
    pathway_count: row.pathway_count || 0,
  };
}

const STATS_SQL = `
  (select count(distinct i.id) from impacts i
     left join impact_linked_systems ils on ils.impact_id = i.id
     where i.system_id = s.id or ils.system_id = s.id
  ) as impact_count,
  (select count(distinct cs.id) from case_studies cs
     join impacts i on i.id = cs.impact_id
     left join case_linked_systems cls on cls.case_id = cs.id
     left join impact_linked_systems ils on ils.impact_id = i.id
     where cs.deleted_at is null and (i.system_id = s.id or cls.system_id = s.id or ils.system_id = s.id)
  ) as case_study_count,
  (select count(distinct p.id) from pathways p
     join case_studies cs on cs.id = p.case_id
     join impacts i on i.id = cs.impact_id
     left join case_linked_systems cls on cls.case_id = cs.id
     left join impact_linked_systems ils on ils.impact_id = i.id
     left join pathway_linked_systems pls on pls.pathway_id = p.id
     where cs.deleted_at is null and
       (i.system_id = s.id or cls.system_id = s.id or ils.system_id = s.id or pls.system_id = s.id)
  ) as pathway_count
`;

// Systems are a fixed taxonomy seeded by the migration — no create
// endpoint, browsing is fully public (this is the platform's primary
// navigation entry point). Only Administrators may edit the "Where Are We
// Now?" contextual text (description/vulnerabilities/RCCAP priorities).
systemsRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    const rows = await req.db.all(`select s.*, ${STATS_SQL} from systems s order by s.sort_order`);
    res.json({ data: { items: rows.map(toPublicSystem) } });
  })
);

systemsRouter.get(
  "/:id",
  asyncRoute(async (req, res) => {
    const row = await req.db.get(`select s.*, ${STATS_SQL} from systems s where s.id = ?`, req.params.id);
    if (!row) return fail(res, "not_found", "System not found.");
    const hazards = await req.db.all(
      `select distinct h.id, h.key, h.name, h.sort_order
       from hazards h
       where h.id in (
         select ih.hazard_id from impact_hazards ih
         join impacts i on i.id = ih.impact_id
         left join impact_linked_systems ils on ils.impact_id = i.id
         where i.system_id = ? or ils.system_id = ?
         union
         select ch.hazard_id from case_hazards ch
         join case_studies cs on cs.id = ch.case_id and cs.deleted_at is null
         join impacts i on i.id = cs.impact_id
         left join case_linked_systems cls on cls.case_id = cs.id
         where i.system_id = ? or cls.system_id = ?
       ) order by h.sort_order`,
      req.params.id,
      req.params.id,
      req.params.id,
      req.params.id
    );
    const system = toPublicSystem(row);
    system.hazards = hazards.map((h) => ({ id: h.id, key: h.key, name_el: JSON.parse(h.name).el, name_en: JSON.parse(h.name).en }));

    const mapCase = (cs) => {
      const title = JSON.parse(cs.title);
      const description = JSON.parse(cs.description || "{}");
      const area = JSON.parse(cs.area || "{}");
      const impactTitle = JSON.parse(cs.impact_title || "{}");
      const primarySystemName = JSON.parse(cs.primary_system_name || "{}");
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
        impact_id: cs.impact_id,
        impact_title_el: impactTitle.el || "",
        impact_title_en: impactTitle.en || "",
        primary_system_id: cs.primary_system_id,
        primary_system_name_el: primarySystemName.el || "",
        primary_system_name_en: primarySystemName.en || "",
      };
    };
    // Related Case Studies, directly at the system level (not gated behind
    // picking one of the system's Impacts first) -- a case's own Linked
    // Systems (case_linked_systems) connect it to a system even when that
    // system has no Impacts of its own yet.
    const primaryCases = await req.db.all(
      `select cs.id, cs.slug, cs.title, cs.description, cs.area, cs.status, cs.starts_on, cs.due_on,
              cs.impact_id, i.title as impact_title, i.system_id as primary_system_id,
              ps.name as primary_system_name, o.name as organisation_name,
              (select count(*) from case_members cm where cm.case_id = cs.id) as member_count
       from case_studies cs
       join impacts i on i.id = cs.impact_id
       join systems ps on ps.id = i.system_id
       left join organisations o on o.id = cs.organisation_id
       where cs.deleted_at is null and i.system_id = ? order by cs.updated_at desc`,
      req.params.id
    );
    const linkedCases = await req.db.all(
      `select distinct cs.id, cs.slug, cs.title, cs.description, cs.area, cs.status, cs.starts_on, cs.due_on,
              cs.impact_id, i.title as impact_title, i.system_id as primary_system_id,
              ps.name as primary_system_name, o.name as organisation_name,
              (select count(*) from case_members cm where cm.case_id = cs.id) as member_count
       from case_studies cs
       join impacts i on i.id = cs.impact_id
       join systems ps on ps.id = i.system_id
       left join organisations o on o.id = cs.organisation_id
       left join case_linked_systems cls on cls.case_id = cs.id
       left join impact_linked_systems ils on ils.impact_id = i.id
       where cs.deleted_at is null and i.system_id != ? and (cls.system_id = ? or ils.system_id = ?)
       order by cs.updated_at desc`,
      req.params.id,
      req.params.id,
      req.params.id
    );
    system.case_studies = primaryCases.map(mapCase);
    system.linked_case_studies = linkedCases.map(mapCase);

    const caseIds = [...primaryCases.map((c) => c.id), ...linkedCases.map((c) => c.id)];
    system.pathways = [];
    if (caseIds.length) {
      const placeholders = caseIds.map(() => "?").join(",");
      const pathwayRows = await req.db.all(
        `select p.id, p.title, p.status, p.case_id, cs.title as case_title from pathways p
         join case_studies cs on cs.id = p.case_id where p.case_id in (${placeholders}) order by p.updated_at desc`,
        ...caseIds
      );
      system.pathways = pathwayRows.map((p) => {
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
    res.json({ data: { system } });
  })
);

systemsRouter.get(
  "/:id/comments",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    const system = await req.db.get("select id from systems where id = ?", req.params.id);
    if (!system) return fail(res, "not_found", "System not found.");
    const rows = await req.db.all(
      `select c.id, c.body, c.created_at, u.id as author_id, u.full_name as author_name,
              o.name as author_org
         from regional_system_comments c
         join users u on u.id = c.author_id
         left join organisations o on o.id = u.organisation_id
        where c.system_id = ? order by c.created_at`,
      req.params.id
    );
    res.json({ data: { items: rows, commentCount: rows.length } });
  })
);

systemsRouter.post(
  "/:id/comments",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    const system = await req.db.get("select id from systems where id = ?", req.params.id);
    if (!system) return fail(res, "not_found", "System not found.");
    const parsed = z.object({ body: z.string().trim().min(1).max(4000) }).safeParse(req.body || {});
    if (!parsed.success) return fail(res, "validation_error", "A comment needs some text.");
    const id = crypto.randomUUID();
    await req.db.run(
      "insert into regional_system_comments (id, system_id, author_id, body) values (?, ?, ?, ?)",
      id,
      req.params.id,
      req.user.id,
      parsed.data.body
    );
    await audit(req.db, { actorId: req.user.id, action: "comment_priority_system", entityType: "system", entityId: req.params.id });
    const comment = await req.db.get(
      `select c.id, c.body, c.created_at, u.id as author_id, u.full_name as author_name,
              o.name as author_org
         from regional_system_comments c
         join users u on u.id = c.author_id
         left join organisations o on o.id = u.organisation_id where c.id = ?`,
      id
    );
    res.status(201).json({ data: { comment } });
  })
);

const systemPatchSchema = z.object({
  descriptionEl: z.string().trim().optional(),
  descriptionEn: z.string().trim().optional(),
  keyVulnerabilitiesEl: z.string().trim().optional(),
  keyVulnerabilitiesEn: z.string().trim().optional(),
  rccapPrioritiesEl: z.string().trim().optional(),
  rccapPrioritiesEn: z.string().trim().optional(),
});

systemsRouter.patch(
  "/:id",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    requireRole(req.user, "admin");
    const existing = await req.db.get("select * from systems where id = ?", req.params.id);
    if (!existing) return fail(res, "not_found", "System not found.");
    const parsed = systemPatchSchema.safeParse(req.body || {});
    if (!parsed.success) return fail(res, "validation_error", "Please correct the highlighted fields.");
    const body = parsed.data;
    const merge = (col, elKey, enKey) => {
      const current = existing[col] ? JSON.parse(existing[col]) : {};
      return JSON.stringify({ el: body[elKey] ?? current.el ?? "", en: body[enKey] ?? current.en ?? "" });
    };
    await req.db.run(
      `update systems set description = ?, key_vulnerabilities = ?, rccap_priorities = ? where id = ?`,
      merge("description", "descriptionEl", "descriptionEn"),
      merge("key_vulnerabilities", "keyVulnerabilitiesEl", "keyVulnerabilitiesEn"),
      merge("rccap_priorities", "rccapPrioritiesEl", "rccapPrioritiesEn"),
      req.params.id
    );
    await audit(req.db, { actorId: req.user.id, action: "update_system", entityType: "system", entityId: req.params.id });
    const row = await req.db.get(`select s.*, ${STATS_SQL} from systems s where s.id = ?`, req.params.id);
    res.json({ data: { system: toPublicSystem(row) } });
  })
);
