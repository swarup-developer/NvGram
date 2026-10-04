import { api, gh, policy } from './core.mjs';
const repo = process.env.GITHUB_REPOSITORY;
if (!process.env.GH_TOKEN) throw new Error('ISSUE_FIX_TOKEN must be configured; refuse to fall back to a default credential');
const number = Number(process.env.ISSUE_NUMBER);
const branch = process.env.FIX_BRANCH;
const problem = process.env.FIX_PROBLEM;
const solution = process.env.FIX_SOLUTION;
if (!Number.isSafeInteger(number) || number < 1 || !branch || policy.protectedBranches.includes(branch) || !/^[\w./-]+$/.test(branch) || branch.startsWith('-') || branch.includes('..')) throw new Error('A genuine issue and separate fix branch are required');
if (!problem || !solution || problem.length < 20 || solution.length < 20) throw new Error('Provide evidence for the problem and proposed solution');
const issue = api(`repos/${repo}/issues/${number}`);
if (issue.state !== 'open' || !issue.labels.some(l => l.name === 'status:confirmed')) throw new Error('Only open, maintainer-confirmed issues may receive an automated fix PR');
const compare = api(`repos/${repo}/compare/${policy.developmentBranch}...${encodeURIComponent(branch)}`);
if (!compare.files?.length) throw new Error('The proposed fix branch has no changed files');
const existing = JSON.parse(gh('api', '--paginate', '--slurp', `repos/${repo}/pulls?state=open&head=${repo.split('/')[0]}:${encodeURIComponent(branch)}&per_page=100`)).flat();
if (existing.length) { console.log(`Existing PR #${existing[0].number} must follow normal validation and review`); process.exit(0); }
const files = compare.files.map(f => `- ${f.filename}`).join('\n');
const pr = api(`repos/${repo}/pulls`, '-f', `title=Proposed fix for #${number}: ${issue.title}`, '-f', `head=${branch}`, '-f', `base=${policy.developmentBranch}`, '-F', 'draft=true', '-f', `body=## Identified problem\n${problem}\n\n## Proposed solution\n${solution}\n\n## Affected code\n${files}\n\nRelated issue: #${number}\n\nThis draft was requested by an authorized maintainer. The automation did not generate or execute untrusted fix code, approve this PR, close the issue, or bypass required validation. Before marking ready: verify reproduction, regression tests, security implications and the issue resolution. Use closing keywords only after verification.\n\nAudit run: https://github.com/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}`);
console.log(pr.html_url);
