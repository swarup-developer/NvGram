const fs = require('node:fs');
const path = require('node:path');
const name = path.basename(process.execPath).replace(/\.exe$/i, '');
if (['gh', 'git'].includes(name)) {
  const args = process.argv.slice(1);
  // Node treats the first CLI operand as a script path before the preload intercepts it.
  args[0] = path.basename(args[0]);
  const statePath = process.env.NVGRAM_TEST_STATE;
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  function done(value) { if (value !== undefined) process.stdout.write(typeof value === 'string' ? value : JSON.stringify(value)); process.exit(0); }
  function fail(message) { process.stderr.write(message); process.exit(1); }
  function save() { fs.writeFileSync(statePath, JSON.stringify(state)); }
  if (name === 'git') {
    if (args[0] === 'rev-parse') done(state.sha);
    if (args[0] === 'merge-base') done('');
    if (args[0] === 'log' || args[0] === 'show') done(`${state.sha}\tfix: current release only`);
    fail(`Unexpected git call: ${args.join(' ')}`);
  }
  state.calls ??= []; state.calls.push(args); save();
  if (args[0] === 'api') {
    const endpoint = args.find(x => x.startsWith('repos/'));
    if (endpoint.includes('/releases/tags/')) {
      const directory = path.join(process.cwd(), 'artifacts/release');
      done({ assets: fs.readdirSync(directory).filter(n => n !== 'RELEASE.md').map(n => ({ name: n, state: 'uploaded', size: fs.statSync(path.join(directory, n)).size })) });
    }
    if (endpoint.includes('/releases?')) done([state.releases ?? []]);
    if (endpoint.includes('/comments') && !args.includes('-f')) done([state.comments ?? []]);
    if (endpoint.endsWith('/labels') || endpoint.includes('/labels/')) done({});
    if (endpoint.includes('/comments')) { state.commentsWritten ??= []; state.commentsWritten.push(args); save(); done({}); }
    if (/\/issues\?/.test(endpoint)) done([state.others ?? []]);
    if (/\/issues\/\d+$/.test(endpoint)) done(state.issue);
    if (/\/pulls\/\d+$/.test(endpoint)) done(state.pr);
    if (endpoint.endsWith('/files?per_page=100')) done([state.files ?? []]);
    fail(`Unexpected api call: ${args.join(' ')}`);
  }
  if (args[0] === 'release') {
    if (args[1] === 'create') { state.createdDraft = args.includes('--draft'); save(); done(''); }
    if (args[1] === 'upload') { if (state.failUpload) fail('Simulated asset upload failure'); done(''); }
    if (args[1] === 'edit') { state.published = true; save(); done(''); }
  }
  fail(`Unexpected gh call: ${args.join(' ')}`);
}
