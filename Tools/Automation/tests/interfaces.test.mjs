import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../../..', import.meta.url));
const sha = 'a'.repeat(40);
function fixture(t, state = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'nvgram-automation-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const bin = join(directory, 'bin'); mkdirSync(bin);
  const extension = process.platform === 'win32' ? '.exe' : '';
  for (const name of ['gh', 'git']) copyFileSync(process.execPath, join(bin, name + extension));
  const statePath = join(directory, 'state.json'); writeFileSync(statePath, JSON.stringify({ sha, ...state }));
  const event = join(directory, 'event.json'); writeFileSync(event, '{}');
  const env = { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}`, NODE_OPTIONS: `--require "${join(root, 'Tools/Automation/tests/mock-cli.cjs').replaceAll('\\', '/')}"`, NVGRAM_TEST_STATE: statePath, GITHUB_REPOSITORY: 'owner/NvGram', GITHUB_SHA: sha, GITHUB_REF: 'refs/heads/develop', GITHUB_REF_NAME: 'develop', GITHUB_RUN_NUMBER: '4', GITHUB_RUN_ATTEMPT: '1', GITHUB_RUN_ID: '40', GITHUB_EVENT_PATH: event, GITHUB_OUTPUT: join(directory, 'output'), GITHUB_STEP_SUMMARY: join(directory, 'summary') };
  const run = (script, ...args) => spawnSync(process.execPath, [join(root, `Tools/Automation/${script}.mjs`), ...args], { cwd: directory, env, encoding: 'utf8' });
  return { directory, env, event, statePath, run, state: () => JSON.parse(readFileSync(statePath)) };
}
test('Release prepare CLI uses only preceding channel history and rejects existing versions', t => {
  const f = fixture(t, { releases: [{ tag_name: 'dev-3-1-aaaaaaaaaaaa', prerelease: true, draft: false, published_at: '2026-01-01' }, { tag_name: 'v2.0.0', prerelease: false, draft: false, published_at: '2026-02-01' }] });
  const result = f.run('release', 'prepare', 'development'); assert.equal(result.status, 0, result.stderr);
  const metadata = JSON.parse(readFileSync(join(f.directory, 'artifacts/release/release.json')));
  assert.equal(metadata.previousTag, 'dev-3-1-aaaaaaaaaaaa'); assert.equal(metadata.channel, 'development');
  assert.match(readFileSync(join(f.directory, 'artifacts/release/CHANGELOG.md'), 'utf8'), /current release only/);
  const state = f.state(); state.releases.push({ tag_name: metadata.tag, draft: true }); writeFileSync(f.statePath, JSON.stringify(state));
  const duplicate = f.run('release', 'prepare', 'development'); assert.notEqual(duplicate.status, 0); assert.match(duplicate.stderr, /Version already exists/);
});
test('Publication stays draft on asset failure and requires passed provenance', t => {
  const f = fixture(t, { failUpload: true }); assert.equal(f.run('release', 'prepare', 'development').status, 0);
  const release = join(f.directory, 'artifacts/release'); const metadataPath = join(release, 'release.json');
  const metadata = JSON.parse(readFileSync(metadataPath)); metadata.validation = 'passed'; writeFileSync(metadataPath, JSON.stringify(metadata));
  for (const name of ['NvGram.zip', 'NvGram.msixbundle', 'development.json']) writeFileSync(join(release, name), 'test asset');
  writeFileSync(join(release, 'validation.json'), JSON.stringify({ commit: sha, build: 'passed', packaging: 'passed', requiredGate: 'passed', securityReview: 'passed' }));
  writeFileSync(join(release, 'review.json'), JSON.stringify({ commit: sha, findings: [] }));
  writeFileSync(join(release, 'review.json'), JSON.stringify({ commit: sha, findings: [{ severity: 'High' }] }));
  const blocked = f.run('release', 'publish', 'development'); assert.notEqual(blocked.status, 0); assert.match(blocked.stderr, /validation evidence/); assert.notEqual(f.state().createdDraft, true);
  writeFileSync(join(release, 'review.json'), JSON.stringify({ commit: sha, findings: [] }));
  const failed = f.run('release', 'publish', 'development'); assert.notEqual(failed.status, 0); assert.equal(f.state().createdDraft, true); assert.notEqual(f.state().published, true);
  const state = f.state(); state.failUpload = false; writeFileSync(f.statePath, JSON.stringify(state));
  const success = f.run('release', 'publish', 'development'); assert.equal(success.status, 0, success.stderr); assert.equal(f.state().published, true);
  metadata.commit = 'b'.repeat(40); writeFileSync(metadataPath, JSON.stringify(metadata));
  assert.notEqual(f.run('release', 'publish', 'development').status, 0);
});
test('Reopened issue CLI removes terminal labels and never closes the issue', t => {
  const f = fixture(t, { issue: { number: 12, title: 'Crash opening chat', state: 'open', body: '### Summary\nCrash', labels: [{ name: 'type:bug' }, { name: 'status:resolved' }] } });
  writeFileSync(f.event, JSON.stringify({ action: 'reopened', issue: { number: 12 } }));
  f.env.GITHUB_EVENT_NAME = 'issues';
  const result = f.run('issues'); assert.equal(result.status, 0, result.stderr);
  assert.ok(f.state().calls.some(call => call.includes('DELETE') && call.some(arg => arg.includes('status%3Aresolved'))));
  assert.ok(f.state().commentsWritten[0].some(arg => arg.includes('no automatic reclosure')));
  assert.ok(!f.state().calls.some(call => call.some(arg => arg.includes('state=closed'))));
});
test('Review CLI reports actionable evidence and returns failure only for blocking findings', t => {
  const f = fixture(t, { files: [{ filename: 'Telegram/A.cs' }] });
  writeFileSync(f.event, JSON.stringify({ pull_request: { number: 3, head: { ref: 'fix', sha }, base: { ref: 'develop' } } }));
  const directory = join(f.directory, 'artifacts/evidence'); mkdirSync(directory, { recursive: true });
  const sarif = { runs: [{ tool: { driver: { name: 'CodeQL', rules: [{ id: 'unsafe-flow', properties: { precision: 'high', 'security-severity': '8.0' }, fullDescription: { text: 'Untrusted input reaches a dangerous sink' } }] } }, results: [] }] };
  writeFileSync(join(directory, 'csharp.sarif'), JSON.stringify(sarif));
  assert.equal(f.run('review').status, 0);
  sarif.runs[0].results.push({ ruleId: 'unsafe-flow', message: { text: 'Unsafe flow' }, locations: [{ physicalLocation: { artifactLocation: { uri: 'Telegram/A.cs' }, region: { startLine: 9 } } }] });
  writeFileSync(join(directory, 'csharp.sarif'), JSON.stringify(sarif));
  const result = f.run('review'); assert.equal(result.status, 1);
  const report = JSON.parse(readFileSync(join(f.directory, 'artifacts/review/review.json')));
  assert.equal(report.findings[0].line, 9); assert.equal(report.findings[0].severity, 'High');
  assert.equal(report.findings[0].confidence, 'High-confidence potential vulnerability');
});
test('Review CLI fails closed without SARIF evidence', t => {
  const f = fixture(t, { pr: { number: 3 }, files: [{ filename: 'Telegram/A.cs' }] });
  writeFileSync(f.event, JSON.stringify({ pull_request: { number: 3, head: { ref: 'fix', sha }, base: { ref: 'develop' } } }));
  mkdirSync(join(f.directory, 'artifacts/evidence'), { recursive: true });
  const result = f.run('review'); assert.notEqual(result.status, 0); assert.match(result.stderr, /evidence is missing/);
});
