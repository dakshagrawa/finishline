import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("CI is read-only and gates pull requests and main pushes on project checks", async () => {
  const workflow = await source(".github/workflows/ci.yml");
  assert.match(workflow, /on:\s*\n\s*push:\s*\n\s*branches:\s*\[main\]\s*\n\s*pull_request:/);
  assert.match(workflow, /permissions:\s*\n\s*contents:\s*read/);
  assert.match(workflow, /runs-on:\s*ubuntu-latest/);
  assert.match(workflow, /actions\/checkout@v4/);
  assert.match(workflow, /actions\/setup-node@v4/);
  assert.match(workflow, /node-version:\s*['"]?24/);
  for (const command of [
    "npm ci", "npm test", "npm run lint", "npx tsc --noEmit --incremental false",
    "npm run build", "npm audit --omit=dev --audit-level=high", "npm audit --audit-level=high",
  ]) assert.ok(workflow.includes(`run: ${command}`), `missing ${command}`);
  assert.doesNotMatch(workflow, /\b(deploy|secrets\.|pull_request_target|write-all)\b/i);
});

test("Dependabot proposes weekly npm and GitHub Actions updates", async () => {
  const config = await source(".github/dependabot.yml");
  assert.match(config, /version:\s*2/);
  assert.match(config, /package-ecosystem:\s*["']?npm/);
  assert.match(config, /package-ecosystem:\s*["']?github-actions/);
  assert.equal((config.match(/interval:\s*["']?weekly/g) ?? []).length, 2);
});

test("maintainer documents identify local-first scope and authorization boundary", async () => {
  const [readme, architecture, contributing, security] = await Promise.all([
    source("README.md"), source("ARCHITECTURE.md"),
    source("CONTRIBUTING.md"), source("SECURITY.md"),
  ]);
  for (const path of ["/grades", "/clubs", "/tools", "/projects", "/settings"]) {
    assert.ok(architecture.includes(`\`${path}\``), `missing architecture route ${path}`);
  }
  assert.match(architecture, /localStorage/);
  assert.match(architecture, /sessionStorage/);
  assert.match(architecture, /SCHOOLOGY_INTEGRATION\.md/);
  assert.match(architecture, /single.instance|single.host/i);
  assert.match(contributing, /npm ci/);
  assert.match(contributing, /npx tsc --noEmit --incremental false/);
  assert.match(contributing, /npm audit --omit=dev --audit-level=high/);
  assert.match(security, /private|privately/i);
  assert.match(security, /mailto:[^)\s]+@[^)\s]+/i, "provide a usable private reporting address");
  assert.match(security, /Schoology.*(disabled|authorization)/i);
  assert.match(readme, /ARCHITECTURE\.md/);
  assert.match(readme, /CONTRIBUTING\.md/);
  assert.match(readme, /SECURITY\.md/);
  assert.match(readme, /unofficial/i);
});

test("maintainer documents enforce durable public-release privacy boundaries", async () => {
  const [readme, security, contributing] = await Promise.all([
    source("README.md"), source("SECURITY.md"), source("CONTRIBUTING.md"),
  ]);
  for (const doc of [readme, security, contributing]) {
    assert.match(doc, /(?:repository|source) visibility is not a security boundary/i);
    assert.match(doc, /before (?:any|each) public release or future change/i);
    assert.match(doc, /(?:audit|review) reachable history and proposed files/i);
    assert.match(doc, /real student data/i);
    assert.match(doc, /tokens?/i);
    assert.match(doc, /secrets?/i);
    assert.match(doc, /private screenshots?/i);
    assert.match(doc, /asset redistribution rights/i);
    assert.match(doc, /(?:issues? and (?:pull requests?|PRs?)|(?:pull requests?|PRs?) and issues?)/i);
    assert.match(doc, /(?:never|do not) (?:put|post|include) (?:student data|tokens?|private screenshots?)[^.]* (?:in|on) issues? (?:and|or) (?:pull requests?|PRs?)/i);
    assert.doesNotMatch(doc, /(?:plan(?:ned)? to publish|before publishing|before publication|after publication|repository is (?:already )?public)/i);
  }
  assert.match(readme, /required checks and branch protection separately/i);
  assert.match(security, /Schoology.*disabled.*(?:FUHSD|district|approved)/i);
  assert.match(contributing, /Schoology remains disabled pending district authorization/i);
  assert.match(security, /mailto:daksh\.agrawal@outlook\.com/i);
});
