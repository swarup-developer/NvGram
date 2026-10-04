import { api, gh, policy } from './core.mjs';
const apply = process.argv.includes('--apply');
const repo = process.env.GITHUB_REPOSITORY ?? 'swarup-developer/NvGram';
const reviewer = Number(process.env.NVGRAM_REVIEWER_ID);
const changes = [];
for (const type of policy.issueTypes) changes.push({ method: 'POST', path: `repos/${repo}/labels`, body: { name: `type:${type}`, color: '1d76db', description: `NvGram ${type} issue` } });
for (const status of policy.statuses) changes.push({ method: 'POST', path: `repos/${repo}/labels`, body: { name: `status:${status}`, color: 'c5def5', description: `Maintainer-controlled ${status} status` } });
for (const priority of policy.priorities) changes.push({ method: 'POST', path: `repos/${repo}/labels`, body: { name: `priority:${priority}`, color: priority === 'critical' ? 'b60205' : 'fbca04', description: `Maintainer-assigned ${priority} priority` } });
for (const name of Object.keys(policy.components)) changes.push({ method: 'POST', path: `repos/${repo}/labels`, body: { name, color: '5319e7', description: `NvGram ${name.slice(5)} component` } });
for (const branch of policy.protectedBranches) changes.push({ method: 'PUT', path: `repos/${repo}/branches/${branch}/protection`, body: {
  required_status_checks: { strict: true, contexts: policy.requiredChecks }, enforce_admins: true,
  required_pull_request_reviews: { dismiss_stale_reviews: true, require_code_owner_reviews: true, required_approving_review_count: policy.minimumApprovals, require_last_push_approval: true },
  restrictions: null, required_linear_history: true, allow_force_pushes: false, allow_deletions: false, required_conversation_resolution: true
} });
changes.push({ method: 'PUT', path: `repos/${repo}/private-vulnerability-reporting`, body: {} });
for (const name of ['release-development', 'release-stable', 'issue-fix']) changes.push({ method: 'PUT', path: `repos/${repo}/environments/${name}`, body: {
  prevent_self_review: true,
  ...(name === 'release-development' ? {} : { reviewers: [{ type: 'User', id: reviewer || '<NVGRAM_REVIEWER_ID>' }] }),
  deployment_branch_policy: { protected_branches: false, custom_branch_policies: true }
} });
changes.push({ method: 'POST', path: `repos/${repo}/environments/release-development/deployment-branch-policies`, body: { name: policy.developmentBranch, type: 'branch' } });
changes.push({ method: 'POST', path: `repos/${repo}/environments/release-stable/deployment-branch-policies`, body: { name: 'v*', type: 'tag' } });
changes.push({ method: 'POST', path: `repos/${repo}/environments/issue-fix/deployment-branch-policies`, body: { name: policy.developmentBranch, type: 'branch' } });
changes.push({ method: 'POST', path: `repos/${repo}/rulesets`, body: { name: 'Stable version tags are immutable', target: 'tag', enforcement: 'active', conditions: { ref_name: { include: ['refs/tags/v*'], exclude: [] } }, rules: [{ type: 'deletion' }, { type: 'update' }], bypass_actors: [] } });
if (!apply) {
  console.log(JSON.stringify({ dryRun: true, repository: repo, changes }, null, 2));
  console.log('No settings changed. Activate only after workflows exist remotely and protected branches exist. --apply requires administrator authorization and NVGRAM_REVIEWER_ID.');
} else {
  if (!Number.isSafeInteger(reviewer) || reviewer < 1) throw new Error('NVGRAM_REVIEWER_ID must name an authorized human release reviewer');
  const remote = api(`repos/${repo}`);
  if (!remote.permissions?.admin) throw new Error('Repository admin permission required');
  const labels = new Set(JSON.parse(gh('api', '--paginate', '--slurp', `repos/${repo}/labels?per_page=100`)).flat().map(x => x.name));
  const existingRules = api(`repos/${repo}/rulesets`);
  for (const change of changes) {
    if (change.path.endsWith('/labels') && labels.has(change.body.name)) continue;
    if (change.path.endsWith('/rulesets') && existingRules.some(r => r.name === change.body.name)) continue;
    if (change.path.endsWith('/deployment-branch-policies')) {
      const policies = api(change.path).branch_policies;
      if (policies.some(p => p.name === change.body.name && p.type === change.body.type)) continue;
    }
    console.log(`${change.method} ${change.path}`);
    // Direct JSON stdin avoids shell interpolation, arbitrary credentials, or broad git changes.
    const { execFileSync } = await import('node:child_process');
    execFileSync('gh', ['api', change.path, '--method', change.method, '--input', '-'], { input: JSON.stringify(change.body), stdio: ['pipe', 'inherit', 'inherit'] });
  }
}
