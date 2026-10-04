import { mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { api, gh, git, policy, versions, previousRelease, changelog } from './core.mjs';

const [command, channel] = process.argv.slice(2);
if (!policy.channels[channel]) throw new Error('Unknown release channel');
const repository = process.env.GITHUB_REPOSITORY;
if (!/^[\w.-]+\/[\w.-]+$/.test(repository ?? '')) throw new Error('GITHUB_REPOSITORY is required');
const directory = 'artifacts/release';
mkdirSync(directory, { recursive: true });

if (command === 'prepare') {
  const sha = git('rev-parse', 'HEAD');
  if (sha !== process.env.GITHUB_SHA) throw new Error('Checkout does not match the triggering commit');
  if (channel === 'development' && process.env.GITHUB_REF !== `refs/heads/${policy.developmentBranch}`) throw new Error('Development releases require the development branch');
  if (channel === 'stable' && !process.env.GITHUB_REF?.startsWith('refs/tags/')) throw new Error('Stable releases require an explicit tag');
  const identity = versions(channel, process.env.GITHUB_REF_NAME, Number(process.env.GITHUB_RUN_NUMBER), Number(process.env.GITHUB_RUN_ATTEMPT), sha);
  if (channel === 'stable' && git('rev-parse', `${identity.tag}^{commit}`) !== sha) throw new Error('Tag/commit mismatch');
  const releases = JSON.parse(gh('api', '--paginate', '--slurp', `repos/${repository}/releases?per_page=100`)).flat();
  if (releases.some(r => r.tag_name === identity.tag)) throw new Error('Version already exists; never overwrite a release, including drafts');
  const previous = previousRelease(releases, channel);
  let range = sha;
  if (previous) {
    const baseline = git('rev-parse', `${previous.tag_name}^{commit}`);
    git('merge-base', '--is-ancestor', baseline, sha); // Fail rather than produce an ambiguous history after a force push.
    range = `${baseline}..${sha}`;
  }
  const log = previous ? git('log', '--reverse', '--format=%H%x09%s', range) : git('show', '-s', '--format=%H%x09%s', sha);
  const entries = log ? log.split('\n').map(line => { const [sha, ...subject] = line.split('\t'); return { sha, subject: subject.join('\t') }; }) : [];
  const notes = changelog(entries, previous?.tag_name);
  const metadata = { schemaVersion: 1, ...identity, channel, commit: sha, previousTag: previous?.tag_name ?? null,
    builtAt: new Date().toISOString(), buildId: process.env.GITHUB_RUN_ID, buildAttempt: process.env.GITHUB_RUN_ATTEMPT,
    repository, sourceUrl: `https://github.com/${repository}/tree/${sha}`, runUrl: `https://github.com/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}`,
    packageIdentity: policy.channels[channel].identity, warning: policy.channels[channel].warning,
    environment: { runner: process.env.RUNNER_OS, image: process.env.ImageOS, imageVersion: process.env.ImageVersion }, validation: 'pending' };
  writeFileSync(join(directory, 'release.json'), JSON.stringify(metadata, null, 2) + '\n');
  writeFileSync(join(directory, 'CHANGELOG.md'), notes);
  writeFileSync(join(directory, 'RELEASE.md'), `# NvGram ${identity.version}\n\n**Channel: ${channel === 'development' ? 'Bleeding Edge / Development' : 'Stable'}**\n\n${metadata.warning}\n\n- Commit: ${sha}\n- Build timestamp: ${metadata.builtAt}\n- Build: ${metadata.runUrl}\n- Windows package version: ${identity.packageVersion}\n\n${notes}\n## Installation\n\nDownload the channel-specific ZIP, verify SHA256SUMS, extract it, and install the signed bundle with Add-AppxPackage (or the included Add-AppDevPackage.ps1 if present). Install Windows runtime dependencies from the included Dependencies directory. Verify the certificate publisher before trusting it. Development installs beside Stable; switching channels is explicit. Update metadata is immutable and channel-specific; there is no cross-channel automatic update.\n`);
  if (process.env.GITHUB_OUTPUT) writeFileSync(process.env.GITHUB_OUTPUT, `tag=${identity.tag}\nversion=${identity.version}\n`, { flag: 'a' });
} else if (command === 'publish') {
  const metadata = JSON.parse(readFileSync(join(directory, 'release.json')));
  if (metadata.channel !== channel || metadata.commit !== process.env.GITHUB_SHA || metadata.validation !== 'passed' || metadata.repository !== repository) throw new Error('Release provenance or validation mismatch');
  const expected = versions(channel, process.env.GITHUB_REF_NAME, Number(process.env.GITHUB_RUN_NUMBER), Number(process.env.GITHUB_RUN_ATTEMPT), metadata.commit);
  if (metadata.tag !== expected.tag || metadata.version !== expected.version || metadata.packageVersion !== expected.packageVersion) throw new Error('Release version does not match the triggering build');
  const validation = JSON.parse(readFileSync(join(directory, 'validation.json')));
  const review = JSON.parse(readFileSync(join(directory, 'review.json')));
  if (validation.commit !== metadata.commit || validation.build !== 'passed' || validation.packaging !== 'passed' || validation.requiredGate !== 'passed' || validation.securityReview !== 'passed' || review.commit !== metadata.commit || !Array.isArray(review.findings) || review.findings.length) throw new Error('Release validation evidence is incomplete or inconsistent');
  const assets = readdirSync(directory).filter(name => !['RELEASE.md', 'SHA256SUMS'].includes(name));
  if (!assets.some(name => name.endsWith('.zip')) || !assets.some(name => name.endsWith('.msixbundle')) || !assets.includes('validation.json') || !assets.includes('CHANGELOG.md') || !assets.includes(`${channel}.json`)) throw new Error('Incomplete release assets');
  const sums = (await Promise.all(assets.map(async name => {
    const path = join(directory, name);
    const stat = statSync(path);
    if (!stat.isFile() || !stat.size) throw new Error(`Empty or non-file asset: ${name}`);
    if (stat.size >= 2 * 1024 ** 3) throw new Error(`Asset exceeds GitHub's 2 GiB per-file limit: ${name}`);
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    return `${hash.digest('hex')}  ${name}`;
  }))).join('\n') + '\n';
  writeFileSync(join(directory, 'SHA256SUMS'), sums);
  const totalSize = assets.reduce((sum, name) => sum + statSync(join(directory, name)).size, 0);
  if (totalSize > 10 * 1024 ** 3) throw new Error('Release exceeds the 10 GiB packaging budget');
  // No clobber, no deletion of a previous release. A publication/upload failure leaves only an unpublished draft for investigation.
  gh('release', 'create', metadata.tag, '--repo', repository, '--target', metadata.commit, '--draft', '--title', `NvGram ${channel === 'development' ? 'Bleeding Edge' : 'Stable'} ${metadata.version}`, '--notes-file', join(directory, 'RELEASE.md'), '--latest=false', ...(channel === 'development' ? ['--prerelease'] : []));
  gh('release', 'upload', metadata.tag, ...[...assets, 'SHA256SUMS'].map(name => join(directory, name)), '--repo', repository);
  const release = api(`repos/${repository}/releases/tags/${metadata.tag}`);
  if (release.assets.length !== assets.length + 1 || release.assets.some(asset => asset.state !== 'uploaded' || asset.size !== statSync(join(directory, asset.name)).size)) throw new Error('Uploaded assets failed validation; draft retained');
  gh('release', 'edit', metadata.tag, '--repo', repository, '--draft=false', ...(channel === 'stable' ? ['--latest'] : ['--latest=false']));
} else throw new Error('Expected prepare or publish');
