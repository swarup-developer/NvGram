import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { git, policy } from './core.mjs';
process.chdir(fileURLToPath(new URL('../..', import.meta.url)));
const failures = [];
function check(condition, message) { if (!condition) failures.push(message); }
for (const name of readdirSync('.github/workflows').filter(x => x.endsWith('.yml'))) {
  const path = `.github/workflows/${name}`; const text = readFileSync(path, 'utf8'); const workflow = parse(text);
  check(workflow.permissions && workflow.permissions !== 'write-all', `${path}: least-privilege permissions required`);
  check(!text.includes('continue-on-error:'), `${path}: no swallowed validation failures`);
  for (const [jobName, job] of Object.entries(workflow.jobs)) {
    if (!job.uses) check(job['timeout-minutes'] > 0, `${path}/${jobName}: bounded job required`);
    for (const step of job.steps ?? []) {
      if (step.uses && !step.uses.startsWith('./')) check(/@[a-f0-9]{40}$/.test(step.uses), `${path}: pin action ${step.uses}`);
      if (step.run) check(!/\$\{\{\s*(?:github\.event\.|inputs\.)/.test(step.run), `${path}: event/input content must be passed through env, not injected into commands`);
      if (step.uses?.startsWith('actions/checkout@')) check(step.with?.['persist-credentials'] === false, `${path}: do not persist checkout credentials`);
    }
  }
  if (workflow.on.pull_request_target) check(!text.includes('github.event.pull_request.head') && !text.includes('secrets:'), `${path}: privileged issue workflow must not execute PR head or expose secrets`);
}
const development = parse(readFileSync('.github/workflows/release-development.yml', 'utf8'));
const stable = parse(readFileSync('.github/workflows/release-stable.yml', 'utf8'));
check(JSON.stringify(development.on) === JSON.stringify({ push: { branches: [policy.developmentBranch] } }), 'Development must trigger only on development pushes');
check(Object.keys(stable.on).length === 1 && stable.on.push.tags.includes('v*') && !stable.on.push.branches, 'Stable must trigger only on explicit version tags');
check(development.jobs.release.needs === 'validation' && stable.jobs.release.needs === 'validation', 'Release must depend on validation');
const shared = parse(readFileSync('.github/workflows/validation.yml', 'utf8'));
check(shared.jobs.gate.if === 'always()' && ['quality', 'secrets', 'dependencies', 'build', 'review'].every(name => shared.jobs.gate.needs.includes(name)), 'Gate must fail closed over all validation jobs');
for (const type of policy.issueTypes.filter(x => x !== 'security')) {
  const form = parse(readFileSync(`.github/ISSUE_TEMPLATE/${type}.yml`, 'utf8'));
  check(form.labels.includes(`type:${type}`) && form.labels.includes('status:triage'), `Missing issue taxonomy: ${type}`);
  check(['summary', 'version', 'environment', 'details'].every(id => form.body.some(item => item.id === id && item.validations?.required)), `Missing required issue fields: ${type}`);
}
const contacts = parse(readFileSync('.github/ISSUE_TEMPLATE/config.yml', 'utf8'));
check(contacts.contact_links.some(link => link.url.endsWith('/security/advisories/new')), 'Security reporting must be private, not a public issue form');
const vcpkg = JSON.parse(readFileSync('vcpkg.json'));
check(/^[a-f0-9]{40}$/.test(vcpkg['builtin-baseline']), 'vcpkg must have an immutable baseline');
const submodules = readFileSync('.gitmodules', 'utf8');
check([...submodules.matchAll(/^\s*url\s*=\s*(.+)$/gm)].every(match => match[1].trim().startsWith('https://')), 'Submodule transports must use HTTPS');
// No app-wide whitespace migration; formatting is enforced only for owned automation files.
const paths = [...readdirSync('Tools/Automation').filter(x => /\.(mjs|json|ps1)$/.test(x)).map(x => `Tools/Automation/${x}`), ...readdirSync('.github/workflows').map(x => `.github/workflows/${x}`)];
for (const path of paths) {
  const text = readFileSync(path, 'utf8');
  check(text.endsWith('\n') && !/[ \t]+\r?$/m.test(text), `${path}: require final newline and no trailing whitespace`);
}
check(readFileSync('LICENSE', 'utf8').includes('GNU GENERAL PUBLIC LICENSE'), 'Preserve GPL project license');
if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1; } else console.log('Workflow, channel, issue schema, provenance and automation formatting checks passed.');
