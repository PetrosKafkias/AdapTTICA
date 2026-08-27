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
  const memberCount = await db.get("select count(*) as count from case_members where case_id = ?", row.id);
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
