import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { git, reviewContext, securityFindings } from './core.mjs';
const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH));
const pr = event.pull_request;
let files;
if (pr) {
  files = JSON.parse((await import('./core.mjs')).gh('api', '--paginate', '--slurp', `repos/${process.env.GITHUB_REPOSITORY}/pulls/${pr.number}/files?per_page=100`)).flat();
} else {
  const base = event.merge_group?.base_sha ?? (event.before && !/^0+$/.test(event.before) ? event.before : null);
  const changed = base ? git('diff', '--name-only', base, 'HEAD') : git('show', '--format=', '--name-only', '--root', 'HEAD');
  files = changed.split('\n').filter(Boolean).map(filename => ({ filename }));
}
function sarifFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? sarifFiles(join(directory, entry.name)) : entry.name.endsWith('.sarif') ? [join(directory, entry.name)] : []);
}
const paths = sarifFiles('artifacts/evidence');
if (!paths.length) throw new Error('CodeQL evidence is missing; cannot claim a clean review');
const findings = paths.flatMap(path => securityFindings(JSON.parse(readFileSync(path))));
const context = reviewContext(files);
const report = { schemaVersion: 1, pr: pr?.number ?? null, sourceBranch: pr?.head.ref ?? process.env.GITHUB_REF_NAME, targetBranch: pr?.base.ref ?? null, commit: process.env.GITHUB_SHA, headCommit: pr?.head.sha ?? process.env.GITHUB_SHA, run: process.env.GITHUB_RUN_ID, context, findings, limitations: ['Deterministic contextual review plus CodeQL data-flow analysis; not a substitute for human review.', 'Performance, accessibility, authentication intent and API compatibility require maintainer scenario validation. No unsupported defects are invented.'] };
mkdirSync('artifacts/review', { recursive: true });
writeFileSync('artifacts/review/review.json', JSON.stringify(report, null, 2) + '\n');
const text = `## Automated engineering review\n\nCommit: ${report.commit}; PR: ${report.pr ?? 'not applicable'}\n\nComponents: ${context.areas.join(', ') || 'other'}\n\n### Actionable findings\n${findings.length ? findings.map(f => `- **${f.severity}** ${f.file}:${f.line} — ${f.problem}\n  - Confidence: ${f.confidence}; rule: ${f.rule}\n  - Evidence: ${f.reasoning ?? 'See retained SARIF code-flow evidence'}\n  - Recommended fix: ${f.fix}`).join('\n') : 'No high-confidence critical/high findings in the analyzed source. This is not a guarantee that no vulnerabilities exist.'}\n\n### Maintainer review context (informational)\n${context.recommendations.map(x => `- ${x}`).join('\n')}\n\nChanged files and test context are retained in review.json; follow SARIF related locations and code-flow evidence before classifying a vulnerability as confirmed. Full analyzer results are retained, including nonblocking recommendations. Required human review is never bypassed.\n`;
writeFileSync('artifacts/review/REVIEW.md', text);
if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, text, { flag: 'a' });
if (findings.length) process.exitCode = 1;
