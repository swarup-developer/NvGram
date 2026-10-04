import { api, gh, policy } from './core.mjs';
const [command, channel] = process.argv.slice(2);
if (!policy.channels[channel]) throw new Error('Unknown channel');
const repo = process.env.GITHUB_REPOSITORY;
const ref = `heads/automation-release-lock-${channel}`;
const owner = `${process.env.GITHUB_RUN_ID}:${process.env.GITHUB_RUN_ATTEMPT}`;
if (command === 'acquire') {
  // A unique, immutable Git object identifies this run even when two runs build the same SHA.
  const commit = api(`repos/${repo}/git/commits/${process.env.GITHUB_SHA}`);
  const lock = api(`repos/${repo}/git/commits`, '-f', `message=NvGram release lock ${owner}`, '-f', `tree=${commit.tree.sha}`, '-f', `parents[]=${process.env.GITHUB_SHA}`);
  for (let i = 0; i < 270; i++) {
    if (channel === 'development') {
      const runs = JSON.parse(gh('api', '--paginate', '--slurp', `repos/${repo}/actions/workflows/release-development.yml/runs?branch=${policy.developmentBranch}&per_page=100`)).flatMap(page => page.workflow_runs);
      if (runs.some(run => run.run_number < Number(process.env.GITHUB_RUN_NUMBER) && run.status !== 'completed')) {
        console.log('Waiting for earlier development pushes to finish; preserve channel history and update ordering.');
        await new Promise(resolve => setTimeout(resolve, 20000));
        continue;
      }
    }
    try {
      api(`repos/${repo}/git/refs`, '-f', `ref=refs/${ref}`, '-f', `sha=${lock.sha}`);
      if (process.env.GITHUB_OUTPUT) {
        const { appendFileSync } = await import('node:fs');
        appendFileSync(process.env.GITHUB_OUTPUT, `owner=${lock.sha}\n`);
      }
      console.log(`Acquired ${channel} release transaction lock for ${owner}`);
      process.exit(0);
    } catch (error) {
      // Retry only a confirmed competing lock; authentication/network failures must fail closed.
      if (!String(error.stderr).includes('Reference already exists')) throw error;
      console.log('Another channel release transaction is active; waiting.');
      await new Promise(resolve => setTimeout(resolve, 20000));
    }
  }
  throw new Error('Release lock wait exceeded 90 minutes; investigate active run or stale lock.');
} else if (command === 'release') {
  const current = api(`repos/${repo}/git/ref/${ref}`);
  if (!process.env.LOCK_OWNER || current.object.sha !== process.env.LOCK_OWNER) throw new Error('Refusing to release a lock owned by another run');
  gh('api', `repos/${repo}/git/refs/${ref}`, '--method', 'DELETE');
} else throw new Error('Expected acquire or release');
