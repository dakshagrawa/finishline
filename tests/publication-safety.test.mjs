import assert from 'node:assert/strict';
import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const excluded = [
  '.hermes',
  'design-review',
  'AGENTS.md',
  'CLAUDE.md',
  'CAC_READINESS.md',
  'GRADE_MERGE_PLAN.md',
  'MVHS_DASHBOARD_CONTRACT.md',
  'public/monta-vista-logo.png',
];
const ignoredDirectories = new Set([
  '.git', '.next', 'node_modules', '.hermes', 'coverage', 'dist', 'build',
  '.turbo', '.cache', 'test-results', 'playwright-report',
]);
const sourceAndDocExtensions = new Set([
  '.md', '.mdx', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.json', '.yaml', '.yml', '.html', '.css', '.scss', '.sh', '.txt',
]);
const secretNames = new Set([
  'SCHOOLOGY_CONSUMER_KEY', 'SCHOOLOGY_CONSUMER_SECRET',
  'SESSION_SECRET', 'TOKEN_ENCRYPTION_KEY',
]);
const personalHomePath = /\/(?:home|Users)\/[^\s/\\]+\//;

function personalHomePathsIn(text) {
  return personalHomePath.test(text);
}

function populatedExampleSecrets(text) {
  const names = [];
  for (const line of text.split(/\r?\n/)) {
    const assignment = line.match(/^\s*(?:export\s+)?([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (!assignment || !secretNames.has(assignment[1])) continue;
    const value = assignment[2].replace(/\s+#.*$/, '').trim();
    if (value !== '' && value !== '""' && value !== "''") names.push(assignment[1]);
  }
  return names;
}

async function present(relative) {
  try {
    await lstat(path.join(root, relative));
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function* publishedTextFiles(directory = root) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const location = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) yield* publishedTextFiles(location);
    } else if (entry.isFile() && sourceAndDocExtensions.has(path.extname(entry.name))) {
      // Mutant fixtures below deliberately contain suspicious examples; never scan this test itself.
      if (location !== fileURLToPath(import.meta.url)) yield location;
    }
  }
}

test('excluded private files and directories remain absent from the release tree', async () => {
  const found = [];
  for (const relative of excluded) if (await present(relative)) found.push(relative);
  assert.deepEqual(found, [], `Excluded release paths reappeared: ${found.join(', ')}`);
});

test('published source and docs have no absolute personal home paths', async () => {
  const offendingFiles = [];
  for await (const location of publishedTextFiles()) {
    if (personalHomePathsIn(await readFile(location, 'utf8'))) {
      offendingFiles.push(path.relative(root, location));
    }
  }
  assert.deepEqual(offendingFiles, [], `Personal home paths found in: ${offendingFiles.join(', ')}`);
});

test('example Schoology and session secrets are blank', async () => {
  const found = populatedExampleSecrets(await readFile(path.join(root, '.env.example'), 'utf8'));
  assert.deepEqual(found, [], `Nonempty example secrets: ${found.join(', ')}`);
});

test('personal path detector catches both home layouts without flagging generic server paths', () => {
  const username = 'release-fixture';
  assert.equal(personalHomePathsIn(`/home/${username}/private/notes.md`), true);
  assert.equal(personalHomePathsIn(`/Users/${username}/Desktop/notes.md`), true);
  assert.equal(personalHomePathsIn('/var/lib/finishline/schoology-store.json'), false);
  assert.equal(personalHomePathsIn('APP_URL=https://grades.example.org'), false);
});

test('example secret detector rejects populated keys and session/encryption secrets', () => {
  for (const name of secretNames) {
    assert.deepEqual(populatedExampleSecrets(`${name}=fixture-value`), [name]);
    assert.deepEqual(populatedExampleSecrets(`export ${name}="fixture-value"`), [name]);
  }
  assert.deepEqual(populatedExampleSecrets(`SCHOOLOGY_CONSUMER_KEY=\nSESSION_SECRET=""\nTOKEN_ENCRYPTION_KEY=''\nAPP_URL=https://grades.example.org\nSCHOOLOGY_STORE_PATH=/var/lib/finishline/store.json`), []);
});
