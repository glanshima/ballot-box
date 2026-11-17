#!/usr/bin/env node
/**
 * Provisions an isolated Neon branch and an empty database for the integration
 * tests, then writes TEST_DATABASE_URL to .env.test. Never reads or writes the
 * production database; it only uses the Neon control-plane API.
 *
 * Usage: NEON_API_KEY=... node scripts/test-db.mjs [--recreate]
 */

import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

const ENV_TEST = '.env.test';
const BRANCH_NAME = 'integration-test';
const DATABASE_NAME = 'ballotbox_test';
const API = 'https://console.neon.tech/api/v2';

function readEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

function upsertEnvFile(path, key, value) {
  const lines = existsSync(path) ? readFileSync(path, 'utf8').split(/\r?\n/) : [];
  const next = lines.filter((l) => !l.startsWith(`${key}=`) && l.trim() !== '');
  next.push(`${key}=${value}`);
  writeFileSync(path, `${next.join('\n')}\n`);
}

async function api(key, method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : {};
}

const local = readEnvFile(ENV_TEST);
const apiKey = process.env.NEON_API_KEY || local.NEON_API_KEY;
if (!apiKey) {
  console.error('NEON_API_KEY is missing. Add it to .env.test (git-ignored) or export it in the shell.');
  process.exit(1);
}

const projects = (await api(apiKey, 'GET', '/projects')).projects ?? [];
let projectId = process.env.NEON_PROJECT_ID || local.NEON_PROJECT_ID;
if (!projectId) {
  const named = projects.filter((p) => /ballot/i.test(p.name));
  if (projects.length === 1) projectId = projects[0].id;
  else if (named.length === 1) projectId = named[0].id;
}
const project = projects.find((p) => p.id === projectId);
if (!project) {
  console.error(
    `Could not pick a Neon project. Set NEON_PROJECT_ID. Available: ${projects.map((p) => p.name).join(', ') || 'none'}`,
  );
  process.exit(1);
}

const branches = (await api(apiKey, 'GET', `/projects/${project.id}/branches`)).branches ?? [];
const parent = branches.find((b) => b.default) ?? branches.find((b) => b.primary);
if (!parent) throw new Error('No default branch found in the Neon project.');

const recreate = process.argv.includes('--recreate');
let testBranch = branches.find((b) => b.name === BRANCH_NAME);
if (testBranch && recreate) {
  await api(apiKey, 'DELETE', `/projects/${project.id}/branches/${testBranch.id}`);
  testBranch = undefined;
}
if (!testBranch) {
  const created = await api(apiKey, 'POST', `/projects/${project.id}/branches`, {
    branch: { name: BRANCH_NAME, parent_id: parent.id },
  });
  testBranch = created.branch;
  console.log(`Created branch ${BRANCH_NAME} (${testBranch.id}) from ${parent.name}.`);
} else {
  console.log(`Reusing branch ${BRANCH_NAME} (${testBranch.id}).`);
}

const roles = (await api(apiKey, 'GET', `/projects/${project.id}/branches/${parent.id}/roles`)).roles ?? [];
const role = roles.find((r) => r.name.endsWith('_owner')) ?? roles[0];
if (!role) throw new Error('No role found on the default branch.');

const databases = (await api(apiKey, 'GET', `/projects/${project.id}/branches/${testBranch.id}/databases`)).databases ?? [];
if (!databases.some((d) => d.name === DATABASE_NAME)) {
  await api(apiKey, 'POST', `/projects/${project.id}/databases`, {
    database: { name: DATABASE_NAME, owner_name: role.name, branch_id: testBranch.id },
  });
  console.log(`Created empty database ${DATABASE_NAME} owned by ${role.name}.`);
} else {
  console.log(`Reusing database ${DATABASE_NAME}.`);
}

const params = new URLSearchParams({
  branch_id: testBranch.id,
  database_name: DATABASE_NAME,
  role_name: role.name,
  pooled: 'true',
});
const { uri } = await api(apiKey, 'GET', `/projects/${project.id}/connection_uri?${params}`);
if (!uri || !uri.includes('-pooler')) throw new Error('Neon returned a non-pooled connection string.');

const prodHost = (() => {
  try {
    return new URL(readEnvFile('.env.local').DATABASE_URL ?? '').hostname;
  } catch {
    return '';
  }
})();
if (prodHost && new URL(uri).hostname === prodHost) {
  console.error('Refusing to continue: the test connection string resolves to the production endpoint.');
  process.exit(1);
}

upsertEnvFile(ENV_TEST, 'TEST_DATABASE_URL', uri);
upsertEnvFile(ENV_TEST, 'NEON_PROJECT_ID', project.id);
if (existsSync(ENV_TEST) && !readFileSync(ENV_TEST, 'utf8').endsWith('\n')) appendFileSync(ENV_TEST, '\n');

console.log(`Wrote TEST_DATABASE_URL to ${ENV_TEST} (db ${DATABASE_NAME} on branch ${testBranch.id}).`);
console.log('Next: npm run db:test:migrate && npm test');
