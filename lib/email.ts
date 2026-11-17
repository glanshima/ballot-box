import { Resend } from 'resend';
import { getEnv } from './env';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Throws on failure; callers record per-voter status ('sent' / 'failed'). */
export async function sendInvitationEmail(args: {
  to: string;
  name: string | null;
  electionTitle: string;
  link: string;
  closesAt: Date;
}) {
  const env = getEnv();
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    throw new Error('Email is not configured (RESEND_API_KEY / EMAIL_FROM). Use "Export links as CSV" instead.');
  }
  const resend = new Resend(env.RESEND_API_KEY);
  const greeting = args.name ? `Hello ${esc(args.name)},` : 'Hello,';
  const closes = args.closesAt.toUTCString();
  const { error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to: args.to,
    subject: `Your voting link: ${args.electionTitle}`,
    text:
      `${args.name ? `Hello ${args.name},` : 'Hello,'}\n\nYou are invited to vote in "${args.electionTitle}".\n\n` +
      `Your personal link (works once, do not share it):\n${args.link}\n\nVoting closes: ${closes}\n`,
    html:
      `<p>${greeting}</p><p>You are invited to vote in <strong>${esc(args.electionTitle)}</strong>.</p>` +
      `<p><a href="${esc(args.link)}">Open your personal voting link</a></p>` +
      `<p style="color:#555">This link works once. Please do not share it.<br>Voting closes: ${esc(closes)}</p>`,
  });
  if (error) throw new Error('Email provider rejected the message');
}

/** Throws on failure; the caller keeps the public response generic either way. */
export async function sendPasswordResetEmail(args: { to: string; name: string; link: string }) {  const env = getEnv();
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    throw new Error('Email is not configured (RESEND_API_KEY / EMAIL_FROM).');
  }
  const resend = new Resend(env.RESEND_API_KEY);
  const greeting = `Hello ${esc(args.name)},`;
  const { error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to: args.to,
    subject: 'Reset your Ballot Box password',
    text:
      `${args.name ? `Hello ${args.name},` : 'Hello,'}\n\n` +
      `Use this link to set a new password. It expires in 30 minutes and works once:\n${args.link}\n\n` +
      `If you did not request this, you can ignore this email.\n`,
    html:
      `<p>${greeting}</p><p>Use the link below to set a new password.</p>` +
      `<p><a href="${esc(args.link)}">Set a new password</a></p>` +
      `<p style="color:#555">This link expires in 30 minutes and works once. If you did not request it, ignore this email.</p>`,
  });
  if (error) throw new Error('Email provider rejected the message');
}

/** One-time code proving the recipient is on an election's voter roll. Throws on failure. */
export async function sendNominationOtpEmail(args: {
  to: string;
  name: string | null;
  electionTitle: string;
  code: string;
  minutes: number;
}) {
  const env = getEnv();
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    throw new Error('Email is not configured (RESEND_API_KEY / EMAIL_FROM).');
  }
  const resend = new Resend(env.RESEND_API_KEY);
  const greeting = args.name ? `Hello ${esc(args.name)},` : 'Hello,';
  const { error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to: args.to,
    subject: `Your nomination code: ${args.electionTitle}`,
    text:
      `${args.name ? `Hello ${args.name},` : 'Hello,'}\n\n` +
      `Your code to nominate in "${args.electionTitle}" is:\n\n${args.code}\n\n` +
      `It expires in ${args.minutes} minutes and can be used once.\n` +
      `If you did not request this, you can ignore this email.\n`,
    html:
      `<p>${greeting}</p><p>Your code to nominate in <strong>${esc(args.electionTitle)}</strong> is:</p>` +
      `<p style="font-size:28px;letter-spacing:6px;font-weight:700">${esc(args.code)}</p>` +
      `<p style="color:#555">It expires in ${args.minutes} minutes and can be used once. ` +
      `If you did not request it, ignore this email.</p>`,
  });
  if (error) throw new Error('Email provider rejected the message');
}
