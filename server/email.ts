import nodemailer from "nodemailer";

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  return transporter;
}

function getFromAddress(): string {
  return process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@vectormesh.app";
}

function getAppUrl(): string {
  return process.env.APP_URL || `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const transport = getTransporter();

  if (!transport) {
    console.log(`[EMAIL] (dev mode - no SMTP configured)`);
    console.log(`[EMAIL] To: ${to}`);
    console.log(`[EMAIL] Subject: ${subject}`);
    console.log(`[EMAIL] Body:\n${html}\n`);
    return true;
  }

  try {
    await transport.sendMail({
      from: getFromAddress(),
      to,
      subject,
      html,
    });
    console.log(`[EMAIL] Sent to ${to}: ${subject}`);
    return true;
  } catch (error) {
    console.error(`[EMAIL] Failed to send to ${to}:`, error);
    return false;
  }
}

export async function sendWelcomeEmail(
  to: string,
  firstName: string,
  temporaryPassword: string
): Promise<boolean> {
  const appUrl = getAppUrl();
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="color: #1a3a5c; margin: 0;">
          <span style="color: #1a3a5c;">Vector</span><span style="color: #0ea5e9;">Mesh</span>
        </h1>
      </div>
      <h2 style="color: #1a1a1a; margin-bottom: 16px;">Welcome, ${firstName}!</h2>
      <p style="color: #555; line-height: 1.6;">Your VectorMesh account has been created. Use the credentials below to sign in:</p>
      <div style="background: #f4f4f5; border-radius: 8px; padding: 20px; margin: 24px 0;">
        <p style="margin: 0 0 8px; color: #555;"><strong>Email:</strong> ${to}</p>
        <p style="margin: 0; color: #555;"><strong>Temporary Password:</strong> <code style="background: #e4e4e7; padding: 2px 8px; border-radius: 4px;">${temporaryPassword}</code></p>
      </div>
      <p style="color: #555; line-height: 1.6;">You will be asked to change your password on first login.</p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${appUrl}/login" style="background: #0ea5e9; color: white; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: 600;">Sign In</a>
      </div>
      <p style="color: #999; font-size: 12px; margin-top: 40px; border-top: 1px solid #e4e4e7; padding-top: 20px;">This is an automated message from VectorMesh. If you did not expect this email, please disregard it.</p>
    </div>
  `;
  return sendEmail(to, "Welcome to VectorMesh — Your Account Details", html);
}

export async function sendPasswordResetEmail(
  to: string,
  firstName: string,
  resetToken: string
): Promise<boolean> {
  const appUrl = getAppUrl();
  const resetUrl = `${appUrl}/reset-password/${resetToken}`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="color: #1a3a5c; margin: 0;">
          <span style="color: #1a3a5c;">Vector</span><span style="color: #0ea5e9;">Mesh</span>
        </h1>
      </div>
      <h2 style="color: #1a1a1a; margin-bottom: 16px;">Password Reset</h2>
      <p style="color: #555; line-height: 1.6;">Hi ${firstName}, we received a request to reset your password. Click the button below to set a new password:</p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${resetUrl}" style="background: #0ea5e9; color: white; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: 600;">Reset Password</a>
      </div>
      <p style="color: #555; line-height: 1.6;">This link will expire in <strong>1 hour</strong>. If you didn't request this, you can safely ignore this email.</p>
      <p style="color: #999; font-size: 12px; margin-top: 40px; border-top: 1px solid #e4e4e7; padding-top: 20px;">If the button doesn't work, copy this link into your browser:<br/><a href="${resetUrl}" style="color: #0ea5e9;">${resetUrl}</a></p>
    </div>
  `;
  return sendEmail(to, "VectorMesh — Password Reset", html);
}

export async function sendAdminPasswordResetEmail(
  to: string,
  firstName: string,
  temporaryPassword: string
): Promise<boolean> {
  const appUrl = getAppUrl();
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="color: #1a3a5c; margin: 0;">
          <span style="color: #1a3a5c;">Vector</span><span style="color: #0ea5e9;">Mesh</span>
        </h1>
      </div>
      <h2 style="color: #1a1a1a; margin-bottom: 16px;">Your Password Has Been Reset</h2>
      <p style="color: #555; line-height: 1.6;">Hi ${firstName}, an administrator has reset your password. Use the temporary password below to sign in:</p>
      <div style="background: #f4f4f5; border-radius: 8px; padding: 20px; margin: 24px 0;">
        <p style="margin: 0; color: #555;"><strong>Temporary Password:</strong> <code style="background: #e4e4e7; padding: 2px 8px; border-radius: 4px;">${temporaryPassword}</code></p>
      </div>
      <p style="color: #555; line-height: 1.6;">You will be asked to set a new password when you sign in.</p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${appUrl}/login" style="background: #0ea5e9; color: white; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: 600;">Sign In</a>
      </div>
      <p style="color: #999; font-size: 12px; margin-top: 40px; border-top: 1px solid #e4e4e7; padding-top: 20px;">This is an automated message from VectorMesh.</p>
    </div>
  `;
  return sendEmail(to, "VectorMesh — Your Password Has Been Reset", html);
}

export async function sendScreenOfflineAlert(
  recipients: string[],
  screenName: string,
  screenLocation: string | null,
  lastSeen: Date | null
): Promise<boolean> {
  const appUrl = getAppUrl();
  const lastSeenStr = lastSeen ? lastSeen.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "Unknown";
  const locationStr = screenLocation ? ` (${screenLocation})` : "";
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="color: #1a3a5c; margin: 0;">
          <span style="color: #1a3a5c;">Vector</span><span style="color: #0ea5e9;">Mesh</span>
        </h1>
      </div>
      <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
        <h2 style="color: #dc2626; margin: 0 0 8px; font-size: 18px;">Screen Offline Alert</h2>
        <p style="color: #555; margin: 0; line-height: 1.6;">The screen <strong>${screenName}</strong>${locationStr} has gone offline.</p>
      </div>
      <div style="background: #f4f4f5; border-radius: 8px; padding: 20px; margin: 24px 0;">
        <p style="margin: 0 0 8px; color: #555;"><strong>Screen:</strong> ${screenName}</p>
        ${screenLocation ? `<p style="margin: 0 0 8px; color: #555;"><strong>Location:</strong> ${screenLocation}</p>` : ""}
        <p style="margin: 0; color: #555;"><strong>Last seen:</strong> ${lastSeenStr}</p>
      </div>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${appUrl}/screens" style="background: #0ea5e9; color: white; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: 600;">View Screens</a>
      </div>
      <p style="color: #999; font-size: 12px; margin-top: 40px; border-top: 1px solid #e4e4e7; padding-top: 20px;">This is an automated alert from VectorMesh. You can manage alert settings in the VectorMesh settings page.</p>
    </div>
  `;

  let allSent = true;
  for (const to of recipients) {
    const sent = await sendEmail(to, `VectorMesh Alert — Screen Offline: ${screenName}`, html);
    if (!sent) allSent = false;
  }
  return allSent;
}

export async function sendScreenOnlineAlert(
  recipients: string[],
  screenName: string,
  screenLocation: string | null,
  downSince: Date | null
): Promise<boolean> {
  const appUrl = getAppUrl();
  const downSinceStr = downSince ? downSince.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "Unknown";
  const locationStr = screenLocation ? ` (${screenLocation})` : "";
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="color: #1a3a5c; margin: 0;">
          <span style="color: #1a3a5c;">Vector</span><span style="color: #0ea5e9;">Mesh</span>
        </h1>
      </div>
      <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
        <h2 style="color: #16a34a; margin: 0 0 8px; font-size: 18px;">Screen Back Online</h2>
        <p style="color: #555; margin: 0; line-height: 1.6;">The screen <strong>${screenName}</strong>${locationStr} is back online.</p>
      </div>
      <div style="background: #f4f4f5; border-radius: 8px; padding: 20px; margin: 24px 0;">
        <p style="margin: 0 0 8px; color: #555;"><strong>Screen:</strong> ${screenName}</p>
        ${screenLocation ? `<p style="margin: 0 0 8px; color: #555;"><strong>Location:</strong> ${screenLocation}</p>` : ""}
        <p style="margin: 0; color: #555;"><strong>Offline since:</strong> ${downSinceStr}</p>
      </div>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${appUrl}/screens" style="background: #0ea5e9; color: white; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: 600;">View Screens</a>
      </div>
      <p style="color: #999; font-size: 12px; margin-top: 40px; border-top: 1px solid #e4e4e7; padding-top: 20px;">This is an automated alert from VectorMesh. You can manage alert settings in the VectorMesh settings page.</p>
    </div>
  `;

  let allSent = true;
  for (const to of recipients) {
    const sent = await sendEmail(to, `VectorMesh Alert — Screen Back Online: ${screenName}`, html);
    if (!sent) allSent = false;
  }
  return allSent;
}

export async function sendAgendaFeedFailingAlert(
  recipients: string[],
  feedName: string,
  errorMessage: string | null,
  failureCount: number,
  lastErrorAt: Date | null
): Promise<boolean> {
  const appUrl = getAppUrl();
  const lastErrorStr = lastErrorAt ? lastErrorAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "Unknown";
  const errorStr = errorMessage || "Unknown error";
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="color: #1a3a5c; margin: 0;">
          <span style="color: #1a3a5c;">Vector</span><span style="color: #0ea5e9;">Mesh</span>
        </h1>
      </div>
      <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
        <h2 style="color: #dc2626; margin: 0 0 8px; font-size: 18px;">Agenda Feed Failing</h2>
        <p style="color: #555; margin: 0; line-height: 1.6;">The agenda feed <strong>${feedName}</strong> has failed to sync <strong>${failureCount}</strong> times in a row. Scheduled sessions may be out of date on your displays.</p>
      </div>
      <div style="background: #f4f4f5; border-radius: 8px; padding: 20px; margin: 24px 0;">
        <p style="margin: 0 0 8px; color: #555;"><strong>Feed:</strong> ${feedName}</p>
        <p style="margin: 0 0 8px; color: #555;"><strong>Consecutive failures:</strong> ${failureCount}</p>
        <p style="margin: 0 0 8px; color: #555;"><strong>Last error:</strong> ${errorStr}</p>
        <p style="margin: 0; color: #555;"><strong>Last attempt:</strong> ${lastErrorStr}</p>
      </div>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${appUrl}/agenda" style="background: #0ea5e9; color: white; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: 600;">View Agenda</a>
      </div>
      <p style="color: #999; font-size: 12px; margin-top: 40px; border-top: 1px solid #e4e4e7; padding-top: 20px;">This is an automated alert from VectorMesh. You can manage alert settings in the VectorMesh settings page.</p>
    </div>
  `;

  let allSent = true;
  for (const to of recipients) {
    const sent = await sendEmail(to, `VectorMesh Alert — Agenda Feed Failing: ${feedName}`, html);
    if (!sent) allSent = false;
  }
  return allSent;
}

export async function sendAgendaFeedRecoveredAlert(
  recipients: string[],
  feedName: string
): Promise<boolean> {
  const appUrl = getAppUrl();
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="color: #1a3a5c; margin: 0;">
          <span style="color: #1a3a5c;">Vector</span><span style="color: #0ea5e9;">Mesh</span>
        </h1>
      </div>
      <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
        <h2 style="color: #16a34a; margin: 0 0 8px; font-size: 18px;">Agenda Feed Recovered</h2>
        <p style="color: #555; margin: 0; line-height: 1.6;">The agenda feed <strong>${feedName}</strong> has synced successfully and is back to normal.</p>
      </div>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${appUrl}/agenda" style="background: #0ea5e9; color: white; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: 600;">View Agenda</a>
      </div>
      <p style="color: #999; font-size: 12px; margin-top: 40px; border-top: 1px solid #e4e4e7; padding-top: 20px;">This is an automated alert from VectorMesh. You can manage alert settings in the VectorMesh settings page.</p>
    </div>
  `;

  let allSent = true;
  for (const to of recipients) {
    const sent = await sendEmail(to, `VectorMesh Alert — Agenda Feed Recovered: ${feedName}`, html);
    if (!sent) allSent = false;
  }
  return allSent;
}

export async function sendTestAlert(
  recipients: string[]
): Promise<boolean> {
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="color: #1a3a5c; margin: 0;">
          <span style="color: #1a3a5c;">Vector</span><span style="color: #0ea5e9;">Mesh</span>
        </h1>
      </div>
      <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
        <h2 style="color: #16a34a; margin: 0 0 8px; font-size: 18px;">Test Alert</h2>
        <p style="color: #555; margin: 0; line-height: 1.6;">This is a test alert from VectorMesh. If you received this, your alert settings are configured correctly.</p>
      </div>
      <p style="color: #999; font-size: 12px; margin-top: 40px; border-top: 1px solid #e4e4e7; padding-top: 20px;">This is an automated message from VectorMesh.</p>
    </div>
  `;

  let allSent = true;
  for (const to of recipients) {
    const sent = await sendEmail(to, "VectorMesh — Test Alert", html);
    if (!sent) allSent = false;
  }
  return allSent;
}

export async function sendPasswordChangedEmail(
  to: string,
  firstName: string
): Promise<boolean> {
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="color: #1a3a5c; margin: 0;">
          <span style="color: #1a3a5c;">Vector</span><span style="color: #0ea5e9;">Mesh</span>
        </h1>
      </div>
      <h2 style="color: #1a1a1a; margin-bottom: 16px;">Password Changed</h2>
      <p style="color: #555; line-height: 1.6;">Hi ${firstName}, your VectorMesh password has been changed successfully.</p>
      <p style="color: #555; line-height: 1.6;">If you did not make this change, please contact your administrator immediately.</p>
      <p style="color: #999; font-size: 12px; margin-top: 40px; border-top: 1px solid #e4e4e7; padding-top: 20px;">This is an automated message from VectorMesh.</p>
    </div>
  `;
  return sendEmail(to, "VectorMesh — Password Changed", html);
}
