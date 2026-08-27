import nodemailer from "nodemailer";

// No SMTP provider is configured by default in this environment — every
// env var below ships as a placeholder (see .env.example). Sending is
// designed to fail gracefully rather than throw: a placeholder-credentialed
// or unreachable transport should never crash the request that triggered
// the notification, it should just log and move on. Wire in real
// credentials via SMTP_HOST/SMTP_USER/SMTP_PASSWORD when available.
let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST) return null;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: String(process.env.SMTP_SECURE).toLowerCase() === "true",
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
  });
  return transporter;
}

export async function sendMail({ to, subject, html, text }) {
  const client = getTransporter();
  if (!client) {
    console.warn(`[mailer] SMTP not configured — skipping email to ${to}: ${subject}`);
    return undefined;
  }
  try {
    return await client.sendMail({
      from: process.env.MAIL_FROM || "notifications@adapttica.local",
      to,
      subject,
      html,
      text,
    });
  } catch (error) {
    console.error(`[mailer] failed to send "${subject}" to ${to}:`, error instanceof Error ? error.message : error);
    return undefined;
  }
}

// Builds one bilingual email (both EL and EN blocks) since several
// recipients here have no known locale preference yet — e.g. a case
// invitee who doesn't have an account, or DREVEN's shared moderation inbox.
export function notifyByEmail({ to, titleEl, titleEn, bodyEl, bodyEn, targetPath }) {
  const base = process.env.APP_BASE_URL || "";
  const link = targetPath ? `${base}${targetPath}` : null;
  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto">
      <div style="margin-bottom:20px">
        <h2 style="margin:0 0 8px;color:#0b3158">${titleEl}</h2>
        <p style="margin:0;color:#334">${bodyEl}</p>
      </div>
      <div style="margin-bottom:20px;padding-top:16px;border-top:1px solid #d7e3e8">
        <h2 style="margin:0 0 8px;color:#0b3158">${titleEn}</h2>
        <p style="margin:0;color:#334">${bodyEn}</p>
      </div>
      ${link ? `<a href="${link}" style="display:inline-block;padding:10px 18px;background:#0b3158;color:#fff;border-radius:8px;text-decoration:none">Open / Άνοιγμα</a>` : ""}
    </div>`;
  const text = `${titleEl}\n${bodyEl}\n\n${titleEn}\n${bodyEn}${link ? `\n\n${link}` : ""}`;
  // Fire-and-forget: sendMail() already never throws/rejects unexpectedly,
  // and with placeholder credentials awaiting would only add latency to
  // the caller's request for a send that isn't going to succeed yet.
  return sendMail({ to, subject: `${titleEl} / ${titleEn}`, html, text }).catch(() => {});
}
