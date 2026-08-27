import bcrypt from "bcryptjs";
import { ApiError } from "./errors.js";

const SALT_ROUNDS = 10;

export function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

export function toPublicUser(row) {
  if (!row) return null;
  let preferences;
  try {
    preferences = JSON.parse(row.preferences || "{}");
  } catch {
    preferences = {};
  }
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: preferences.phone || "",
    location: preferences.location || "",
    organisationName: row.organisation_name || "",
    platformRole: row.platform_role,
    language: row.locale,
    notificationPreferences: preferences.notificationPreferences || {
      invitations: true,
      comments: true,
      statusChanges: true,
      deadlines: true,
    },
    privacyPreferences: preferences.privacyPreferences || {
      profileVisibility: "participants",
      analytics: false,
    },
  };
}

export async function requireUser(req) {
  const userId = req.session?.userId;
  if (!userId) throw new ApiError("unauthenticated", "Authentication required.");
  const row = await req.db.get(
    `select u.*, o.name as organisation_name from users u
     left join organisations o on o.id = u.organisation_id
     where u.id = ?`,
    userId
  );
  if (!row || row.disabled_at) throw new ApiError("unauthenticated", "Authentication required.");
  return row;
}

export function requireRole(user, ...roles) {
  if (!roles.includes(user.platform_role)) {
    throw new ApiError("forbidden", "You do not have permission to perform this action.");
  }
}
