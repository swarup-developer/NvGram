import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { api, gh, policy, missingIssueFields, duplicateCandidates, relatedIssues, reviewContext } from './core.mjs';
const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH));
const repo = process.env.GITHUB_REPOSITORY;
const marker = '<!-- nvgram-triage -->';
function pages(path) { return JSON.parse(gh('api', '--paginate', '--slurp', path)).flat(); }
function comment(number, body, idMarker = marker) {
  const existing = pages(`repos/${repo}/issues/${number}/comments?per_page=100`).find(c => c.user.type === 'Bot' && c.body.includes(idMarker));
  if (existing) api(`repos/${repo}/issues/comments/${existing.id}`, '--method', 'PATCH', '-f', `body=${body}`);
  else api(`repos/${repo}/issues/${number}/comments`, '-f', `body=${body}`);
}
const audit = { event: process.env.GITHUB_EVENT_NAME, action: event.action, runId: process.env.GITHUB_RUN_ID, timestamp: new Date().toISOString() };
if (event.issue && !event.issue.pull_request) {
  const issue = api(`repos/${repo}/issues/${event.issue.number}`);
  // Do not re-open or close issues. All automation status changes are additive and conservative.
  const types = issue.labels.map(l => l.name).filter(n => n.startsWith('type:'));
  const missing = missingIssueFields(issue.body ?? '', types[0]?.slice(5));
  const labels = [];
  if (!types.length) labels.push('type:general');
  if (event.action === 'reopened' || !issue.labels.some(l => l.name.startsWith('status:'))) labels.push('status:triage');
  if (event.action === 'reopened') {
    for (const label of issue.labels.filter(l => ['status:resolved', 'status:duplicate', 'status:invalid'].includes(l.name))) gh('api', `repos/${repo}/issues/${issue.number}/labels/${encodeURIComponent(label.name)}`, '--method', 'DELETE');
  }
  const duplicates = duplicateCandidates(issue, pages(`repos/${repo}/issues?state=all&per_page=100`));
  const sections = (await import('./core.mjs')).issueSections(issue.body ?? '');
  const mentionedAreas = Object.keys(policy.components).filter(area => (sections['Additional context'] ?? '').includes(area));
  labels.push(...mentionedAreas.filter(area => !issue.labels.some(label => label.name === area)));
  if (labels.length) api(`repos/${repo}/issues/${issue.number}/labels`, '--method', 'POST', ...labels.flatMap(l => ['-f', `labels[]=${l}`]));
  const text = `${marker}\n## NvGram triage\n\n- Classification: ${types.join(', ') || 'type:general'}\n- Required information: ${missing.length ? `please provide **${missing.join(', ')}**` : 'present'}\n- Reproducibility: **not verified**; reproduction steps are evidence to investigate, not proof.\n- Possible duplicates: ${duplicates.length ? duplicates.map(d => `#${d.number} (title similarity only; maintainer confirmation required)`).join(', ') : 'none identified by title similarity'}\n- Status: ${event.action === 'reopened' ? 'reopened; original resolution must be re-evaluated; no automatic reclosure' : issue.state}\n\nNo issue is automatically closed or marked invalid based on this report. Maintainers verify reproduction, priority, components, duplicates and resolutions. For sensitive findings use private security reporting, never public logs.\n\nAudit: [run ${audit.runId}](https://github.com/${repo}/actions/runs/${audit.runId}); event ${event.action}; ${audit.timestamp}. Earlier edits and actions remain in the GitHub issue timeline/comment edit history.\n`;
  comment(issue.number, text);
  Object.assign(audit, { issue: issue.number, missing, duplicates, labels });
} else if (event.pull_request) {
  const pr = api(`repos/${repo}/pulls/${event.pull_request.number}`);
  const files = pages(`repos/${repo}/pulls/${pr.number}/files?per_page=100`);
  const context = reviewContext(files);
  if (context.areas.length) api(`repos/${repo}/issues/${pr.number}/labels`, '--method', 'POST', ...context.areas.flatMap(l => ['-f', `labels[]=${l}`]));
  const issues = relatedIssues(pr.body ?? '', repo);
  for (const number of issues) {
    const issue = api(`repos/${repo}/issues/${number}`);
    if (issue.pull_request) continue;
    const merged = pr.merged === true;
    const state = merged ? `merged at commit ${pr.merge_commit_sha}. Maintainers must verify that the reported scenario is resolved.` : pr.state === 'closed' ? 'closed without merge; this issue is not resolved by that PR' : 'open; validation and maintainer review are still required';
    comment(number, `<!-- nvgram-link-${pr.number} -->\nRelated PR #${pr.number} is ${state}. This automation never closes issues. GitHub closing keywords apply only when merged into the default branch; maintainers must satisfy the documented verified-resolution policy. [Audit run](https://github.com/${repo}/actions/runs/${audit.runId}).`, `<!-- nvgram-link-${pr.number} -->`);
  }
  Object.assign(audit, { pr: pr.number, commit: pr.head.sha, merged: pr.merged, relatedIssues: issues, areas: context.areas });
}
mkdirSync('artifacts/issues', { recursive: true });
writeFileSync('artifacts/issues/audit.json', JSON.stringify(audit, null, 2) + '\n');
