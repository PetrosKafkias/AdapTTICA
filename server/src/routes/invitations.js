import crypto from "node:crypto";
import express from "express";
import { asyncRoute, ApiError } from "../lib/errors.js";
import { requireUser } from "../lib/auth.js";
import { audit } from "../lib/audit.js";

export const invitationsRouter = express.Router();

async function requireValidInvitation(db, token) {
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const row = await db.get(
    `select i.*, cs.title as case_title from invitations i
     join case_studies cs on cs.id = i.case_id
     where i.token_hash = ?`,
    tokenHash
  );
  if (!row) throw new ApiError("not_found", "Invitation not found.");
  if (row.status !== "pending") throw new ApiError("conflict", "This invitation has already been used.");
  if (new Date(row.expires_at) < new Date()) throw new ApiError("conflict", "This invitation has expired.");
  return row;
}

// Public: lets the accept-invite page show what the invite is for before
// the visitor has logged in or registered.
invitationsRouter.get(
  "/:token",
  asyncRoute(async (req, res) => {
    const invitation = await requireValidInvitation(req.db, req.params.token);
    const title = JSON.parse(invitation.case_title);
    res.json({
      data: {
        invitation: {
          caseId: invitation.case_id,
          caseTitleEl: title.el,
          caseTitleEn: title.en,
          email: invitation.email,
          role: invitation.case_role,
        },
      },
    });
  })
);

// This is the actual "user added as a case participant" moment for the
// invite flow — POST /cases/:id/invitations only ever creates a pending
// token; nothing previously turned that into a real case_members row.
invitationsRouter.post(
  "/:token/accept",
  asyncRoute(async (req, res) => {
    req.user = await requireUser(req);
    const invitation = await requireValidInvitation(req.db, req.params.token);
    if (req.user.email.toLowerCase() !== invitation.email.toLowerCase()) {
      throw new ApiError(
        "forbidden",
        "This invitation was sent to a different email address. Please sign in with the invited address."
      );
    }
    await req.db.run(
      `insert into case_members (case_id, user_id, role) values (?, ?, ?)
       on conflict(case_id, user_id) do update set role = excluded.role`,
      invitation.case_id,
      req.user.id,
      invitation.case_role
    );
    await req.db.run(
      "update invitations set status = 'accepted', accepted_by = ? where id = ?",
      req.user.id,
      invitation.id
    );
    await audit(req.db, {
      actorId: req.user.id,
      action: "accept_invitation",
      entityType: "case_study",
      entityId: invitation.case_id,
      metadata: { invitationId: invitation.id },
    });
    res.json({ data: { caseId: invitation.case_id } });
  })
);
