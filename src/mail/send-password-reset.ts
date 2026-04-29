import nodemailer from "nodemailer";
import { env } from "../env";

function stripOuterQuotes(s: string): string {
  const t = s.trim();
  if (t.length >= 2 && ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'")))) {
    return t.slice(1, -1).trim();
  }
  return t;
}

export function isSmtpConfigured(): boolean {
  return Boolean(env.SMTP_HOST?.trim() && env.SMTP_USER?.trim() && env.SMTP_PASS !== undefined && env.SMTP_PASS !== "");
}

export function getPasswordResetClientBaseUrl(): string {
  const explicit = env.PASSWORD_RESET_CLIENT_URL?.trim();
  if (explicit) return stripOuterQuotes(explicit).replace(/\/$/, "");
  const raw = env.CLIENT_ORIGIN?.split(",")[0]?.trim();
  if (raw) return stripOuterQuotes(raw).replace(/\/$/, "");
  return "http://localhost:5173";
}

function smtpSecure(): boolean {
  const port = env.SMTP_PORT ?? 587;
  const flag = String(env.SMTP_SECURE || "").toLowerCase();
  return flag === "true" || flag === "1" || port === 465;
}

export async function sendPasswordResetEmail(toEmail: string, resetUrl: string): Promise<void> {
  if (!isSmtpConfigured()) {
    throw new Error("SMTP is not configured");
  }

  const port = env.SMTP_PORT ?? 587;
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST!.trim(),
    port,
    secure: smtpSecure(),
    auth: {
      user: env.SMTP_USER!.trim(),
      pass: env.SMTP_PASS,
    },
  });

  const from = (env.EMAIL_FROM?.trim() || env.SMTP_USER!.trim()).replace(/^"|"$/g, "");

  await transporter.sendMail({
    from,
    to: toEmail,
    subject: "Reset your Nice Cafe password",
    text: `You requested a password reset.\n\nOpen this link to choose a new password (valid for 1 hour):\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`,
    html: `<p>You requested a password reset.</p><p><a href="${resetUrl}">Reset your password</a> (link valid for 1 hour).</p><p>If you did not request this, you can ignore this email.</p>`,
  });
}
