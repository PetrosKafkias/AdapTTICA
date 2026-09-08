import { ApiError } from "./errors.js";

export function slugify(text) {
  return (
    String(text || "case")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "case"
  );
}

export async function toPublicCase(db, row) {
  const title = JSON.parse(row.title);
  const description = JSON.parse(row.description || "{}");
  const sectors = JSON.parse(row.sectors || "{}");
  const area = JSON.parse(row.area || "{}");
  const [memberCount, impact, hazards, linkedSystems] = await Promise.all([
    db.get("select count(*) as count from case_members where case_id = ?", row.id),
    row.impact_id
      ? db.get(`select i.title, i.system_id, s.name as system_name from impacts i join systems s on s.id = i.system_id where i.id = ?`, row.impact_id)
      : null,
    db.all(
      `select h.id, h.key, h.name from case_hazards ch join hazards h on h.id = ch.hazard_id where ch.case_id = ? order by h.sort_order`,
      row.id
    ),
    db.all(
      `select s.id, s.key, s.name from case_linked_systems cls join systems s on s.id = cls.system_id where cls.case_id = ? order by s.sort_order`,
      row.id
    ),
  ]);
  return {
    id: row.id,
    public_id: row.slug,
    title_el: title.el,
    title_en: title.en,
    description_el: description.el || "",
    description_en: description.en || "",
    organisation_name: row.organisation_name || "",
    sector_name_el: sectors.el || "",
    sector_name_en: sectors.en || "",
    area_el: area.el || "",
    area_en: area.en || "",
    status: row.status,
    member_count: memberCount.count,
    start_date: row.starts_on,
    target_date: row.due_on,
    impact_id: row.impact_id || null,
    impact_title_el: impact ? JSON.parse(impact.title).el : "",
    impact_title_en: impact ? JSON.parse(impact.title).en : "",
    primary_system_id: impact ? impact.system_id : null,
    primary_system_name_el: impact ? JSON.parse(impact.system_name).el : "",
    primary_system_name_en: impact ? JSON.parse(impact.system_name).en : "",
    hazards: hazards.map((h) => ({ id: h.id, key: h.key, name_el: JSON.parse(h.name).el, name_en: JSON.parse(h.name).en })),
    linked_systems: linkedSystems.map((s) => ({ id: s.id, key: s.key, name_el: JSON.parse(s.name).el, name_en: JSON.parse(s.name).en })),
  };
}

export async function requireCaseAccess(req, caseId, roles) {
  const row = await req.db.get("select * from case_studies where id = ? and deleted_at is null", caseId);
  if (!row) throw new ApiError("not_found", "Case study not found.");
  if (roles) {
    const membership = await req.db.get(
      "select role from case_members where case_id = ? and user_id = ?",
      caseId,
      req.user.id
    );
    const effectiveRole = req.user.platform_role === "admin" ? "admin" : membership?.role;
    if (!effectiveRole || !roles.includes(effectiveRole)) {
      throw new ApiError("forbidden", "You do not have permission to perform this action.");
    }
  }
  return row;
}
