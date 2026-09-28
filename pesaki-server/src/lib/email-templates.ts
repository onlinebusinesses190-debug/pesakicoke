/**
 * Email template utilities for PESAKI backend.
 *
 * Provides reusable HTML templates with required compliance elements:
 *   - Unsubscribe link
 *   - Physical address
 *   - Company registration details
 *
 * Currently no email provider is configured. This module is ready to wire up
 * when a transport (SendGrid, SMTP, etc.) is added.
 */

const APP_URL = process.env.APP_URL || "https://pesaki.co.ke";
const SUPPORT_EMAIL = "support@pesaki.co.ke";
const COMPANY_NAME = "Pesaki Marketing";
const COMPANY_ADDRESS = "Nairobi, Kenya";

interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

function footerBlock(unsubscribeToken?: string): string {
  const unsub = unsubscribeToken
    ? `<p style="margin:12px 0;font-size:12px;color:#888;">
        <a href="${APP_URL}/unsubscribe?token=${unsubscribeToken}" style="color:#0a3b2e;">Unsubscribe</a>
       </p>`
    : `<p style="margin:12px 0;font-size:12px;color:#888;">
        <a href="${APP_URL}/unsubscribe" style="color:#0a3b2e;">Unsubscribe</a>
       </p>`;

  return `
    <hr style="border:none;border-top:1px solid #e0e0e0;margin:24px 0;" />
    <p style="font-size:12px;color:#888;line-height:1.5;">
      ${COMPANY_NAME}<br />
      ${COMPANY_ADDRESS}<br />
      Support: <a href="mailto:${SUPPORT_EMAIL}" style="color:#0a3b2e;">${SUPPORT_EMAIL}</a>
    </p>
    ${unsub}
    <p style="font-size:11px;color:#aaa;">
      You received this email because you have an account with PESAKI. This is a transactional email.
    </p>`;
}

export function welcomeEmail(name: string, unsubscribeToken?: string): EmailTemplate {
  return {
    subject: `Welcome to PESAKI, ${name}`,
    html: `
      <div style="font-family:DM Sans,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <h2 style="color:#0a3b2e;">Welcome to PESAKI</h2>
        <p>Hi ${name},</p>
        <p>Your account has been created. We're glad to have you.</p>
        <p>Get started by logging in to your dashboard.</p>
        ${footerBlock(unsubscribeToken)}
      </div>
    `,
    text: `Welcome to PESAKI, ${name}. Your account has been created. Log in at ${APP_URL}.`,
  };
}

export function passwordResetEmail(name: string, resetLink: string, unsubscribeToken?: string): EmailTemplate {
  return {
    subject: "Reset your PESAKI password",
    html: `
      <div style="font-family:DM Sans,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <h2 style="color:#0a3b2e;">Reset your password</h2>
        <p>Hi ${name},</p>
        <p>Click the link below to reset your password. It expires in 1 hour.</p>
        <p><a href="${resetLink}" style="display:inline-block;padding:12px 24px;background:#0a3b2e;color:#fff;border-radius:8px;text-decoration:none;">Reset Password</a></p>
        ${footerBlock(unsubscribeToken)}
      </div>
    `,
    text: `Reset your password: ${resetLink}`,
  };
}

export function transactionAlertEmail(
  name: string,
  txDescription: string,
  amount: string,
  unsubscribeToken?: string
): EmailTemplate {
  return {
    subject: "PESAKI Transaction Alert",
    html: `
      <div style="font-family:DM Sans,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <h2 style="color:#0a3b2e;">Transaction Alert</h2>
        <p>Hi ${name},</p>
        <p>A new transaction occurred on your account:</p>
        <ul>
          <li><strong>Description:</strong> ${txDescription}</li>
          <li><strong>Amount:</strong> ${amount}</li>
        </ul>
        ${footerBlock(unsubscribeToken)}
      </div>
    `,
    text: `Transaction alert for ${name}: ${txDescription} — ${amount}`,
  };
}

export function marketingEmail(
  subject: string,
  htmlBody: string,
  unsubscribeToken: string
): EmailTemplate {
  return {
    subject,
    html: `
      <div style="font-family:DM Sans,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        ${htmlBody}
        ${footerBlock(unsubscribeToken)}
      </div>
    `,
    text: subject,
  };
}

/**
 * Generate a deterministic unsubscribe token for a user.
 * In production, store this in the database and validate on click.
 */
export function generateUnsubscribeToken(userId: string): string {
  // Simple token: base64 of userId with a signature-like suffix
  // In production, use HMAC for integrity
  return Buffer.from(userId).toString("base64url");
}