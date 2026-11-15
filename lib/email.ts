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
