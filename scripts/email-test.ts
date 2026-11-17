/**
 * Sends a probe email with the same RESEND_API_KEY / EMAIL_FROM the app uses,
 * so a verified domain can be checked without going through a real election.
 * Run:  npm run email:test -- recipient@example.com
 */
import { config } from 'dotenv';

config({ path: ['.env.local', '.env'] });

async function main() {
  const to = process.argv[2];
  if (!to) throw new Error('Usage: npm run email:test -- recipient@example.com');
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) throw new Error('RESEND_API_KEY and EMAIL_FROM must be set.');

  const { Resend } = await import('resend');
  const { data, error } = await new Resend(key).emails.send({
    from,
    to,
    subject: 'Ballot Box email test',
    text: `Resend is configured for Ballot Box.\nSender: ${from}\nSent: ${new Date().toISOString()}\n`,
  });
  if (error) throw new Error(`Resend rejected the message: ${error.name}: ${error.message}`);
  console.log(`Sent ${data?.id ?? '(no id returned)'} from ${from} to ${to}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
