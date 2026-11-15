import bcrypt from 'bcryptjs';

const pw = process.argv[2];
if (!pw || pw.length < 10) {
  console.error('Usage: npm run hash-password -- "a password of at least 10 characters"');
  process.exit(1);
}
const hash = bcrypt.hashSync(pw, 12);
console.log('\nFor Vercel env vars (paste as-is):\n' + hash);
console.log('\nFor a local .env.local file (each "$" must be escaped):\nADMIN_PASSWORD_HASH=' + hash.replace(/\$/g, '\\$') + '\n');
