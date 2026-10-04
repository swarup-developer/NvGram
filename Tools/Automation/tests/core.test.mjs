import test from 'node:test';
import assert from 'node:assert/strict';
import { versions, previousRelease, changelog, securityFindings, missingIssueFields, relatedIssues, duplicateCandidates, reviewContext } from '../core.mjs';
const sha = 'a'.repeat(40);
test('Stable requires canonical explicit tag and MSIX-compatible components', () => {
  assert.deepEqual(versions('stable', 'v1.2.3', 1, 1, sha), { tag: 'v1.2.3', version: '1.2.3', packageVersion: '1.2.3.0' });
  for (const tag of ['develop', 'v1.2.3-dev', 'v01.2.3', 'v0.1.0', 'v1.2', 'v65536.0.0']) assert.throws(() => versions('stable', tag, 1, 1, sha));
});
test('Development reruns and pushes have unique identifiers and monotonic install versions', () => {
  const one = versions('development', 'develop', 65535, 1, sha);
  const rerun = versions('development', 'develop', 65535, 2, sha);
  const next = versions('development', 'develop', 65536, 1, sha);
  assert.notEqual(one.tag, rerun.tag); assert.notEqual(one.tag, next.tag);
  assert.equal(one.packageVersion, '1.65535.1.0'); assert.equal(next.packageVersion, '2.0.1.0');
  assert.match(one.version, /-dev\./);
  assert.throws(() => versions('development', 'develop', 1, 65536, sha));
});
test('Release history never crosses channels or includes drafts', () => {
  const releases = [
    { tag_name: 'dev-1-1-aaaaaaaaaaaa', prerelease: true, published_at: '2026-01-01', draft: false },
    { tag_name: 'v1.0.0', prerelease: false, published_at: '2026-02-01', draft: false },
    { tag_name: 'dev-2-1-aaaaaaaaaaaa', prerelease: true, published_at: '2026-03-01', draft: true },
    { tag_name: 'v2.0.0-rc1', prerelease: true, published_at: '2026-04-01', draft: false }
  ];
  assert.equal(previousRelease(releases, 'development').tag_name, 'dev-1-1-aaaaaaaaaaaa');
  assert.equal(previousRelease(releases, 'stable').tag_name, 'v1.0.0');
  assert.equal(previousRelease([], 'stable'), null);
});
test('Changelog classifies only supplied commit delta and handles same-commit reruns', () => {
  const text = changelog([{ sha, subject: 'feat!: replace API' }, { sha, subject: 'fix: crash' }], 'dev-1');
  assert.match(text, /Breaking changes/); assert.match(text, /Bug fixes/); assert.doesNotMatch(text, /historical/);
  assert.match(changelog([], 'dev-1'), /No source changes/);
  assert.match(changelog([{ sha, subject: 'initial' }], null), /only the triggering commit/);
});
test('Review requires security evidence, location, severity and high precision; deduplicates', () => {
  const rule = { id: 'injection', properties: { precision: 'high', 'security-severity': '9.1' }, fullDescription: { text: 'Tainted input reaches command execution' } };
  const finding = { ruleId: 'injection', message: { text: 'Unsafe command' }, locations: [{ physicalLocation: { artifactLocation: { uri: 'Telegram/X.cs' }, region: { startLine: 42 } } }] };
  const sarif = { runs: [{ tool: { driver: { name: 'CodeQL', rules: [rule] } }, results: [finding, finding] }] };
  assert.equal(securityFindings(sarif).length, 1);
  assert.equal(securityFindings(sarif)[0].confidence, 'High-confidence potential vulnerability');
  rule.properties.precision = 'medium'; assert.equal(securityFindings(sarif).length, 0);
  rule.properties.precision = 'high'; finding.suppressions = [{ status: 'accepted' }]; assert.equal(securityFindings(sarif).length, 0);
});
test('Security evidence rejects missing runs, failed execution and malformed actionable results', () => {
  assert.throws(() => securityFindings({}), /analyzer runs/);
  assert.throws(() => securityFindings({ runs: [] }), /analyzer runs/);
  const sarif = { runs: [{ tool: { driver: { name: 'CodeQL', rules: [] } }, results: [], invocations: [{ executionSuccessful: false }] }] };
  assert.throws(() => securityFindings(sarif), /execution failed/);
  sarif.runs[0].invocations = [];
  sarif.runs[0].results = [{ ruleId: 'missing' }];
  assert.throws(() => securityFindings(sarif), /unknown rule/);
  sarif.runs[0].tool.driver.rules.push({ id: 'missing', properties: { precision: 'high', 'security-severity': 'NaN' } });
  assert.throws(() => securityFindings(sarif), /severity/);
  sarif.runs[0].tool.driver.rules[0].properties['security-severity'] = '9';
  assert.throws(() => securityFindings(sarif), /location/);
});
test('Security evidence resolves indexed extension rules without ignoring findings', () => {
  const rule = { id: 'extension-rule', properties: { precision: 'high', 'security-severity': '8' } };
  const sarif = { runs: [{ tool: { driver: { name: 'CodeQL', rules: [] }, extensions: [{ rules: [rule] }] }, results: [{ rule: { index: 0, toolComponent: { index: 0 } }, locations: [{ physicalLocation: { artifactLocation: { uri: 'A.cs' } } }] }] }] };
  assert.equal(securityFindings(sarif)[0].rule, 'extension-rule');
});
test('Structured issue validation detects omissions without treating reproduction as proven', () => {
  const body = '### Summary\n\nCrash\n\n### NvGram version\n\nv1.0.0\n\n### Environment\n\nWindows 11 x64\n\n### Details / reproduction\n\n1. Open chat\n';
  assert.deepEqual(missingIssueFields(body), []);
  assert.deepEqual(missingIssueFields(body.replace('Windows 11 x64', '_No response_')), ['Environment']);
});
test('Closing references link issues without any state mutation and duplicate hints remain tentative', () => {
  assert.deepEqual(relatedIssues('Fixes #123\nCloses #123\nResolves #55'), [123, 55]);
  assert.deepEqual(relatedIssues('Fixes foreign/repo#9; Closes owner/NvGram#12', 'owner/NvGram'), [12]);
  assert.deepEqual(duplicateCandidates({ number: 1, title: 'Crash opening large chat' }, [{ number: 2, title: 'Crash opening large chat' }, { number: 3, title: 'New feature' }]).map(x => x.number), [2]);
});
test('Context reviews identify real areas and tests without fabricating findings', () => {
  const context = reviewContext([{ filename: 'Telegram/Views/Chat.xaml' }, { filename: 'Telegram.Native/Calls.cpp' }]);
  assert.deepEqual(context.areas, ['area:client', 'area:native']);
  assert.deepEqual(context.tests, []); assert.match(context.recommendations.join('\n'), /informational/);
});
