import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

export const policy = JSON.parse(readFileSync(new URL('../../.github/automation/policy.json', import.meta.url)));
export function git(...args) { return execFileSync('git', args, { encoding: 'utf8' }).trim(); }
export function gh(...args) { return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
export function api(path, ...args) { return JSON.parse(gh('api', path, ...args)); }
export function versions(channel, ref, run, attempt, sha) {
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('A full commit SHA is required');
  if (channel === 'stable') {
    const match = ref.match(new RegExp(policy.stableTagPattern));
    if (!match || match.slice(1).some(x => Number(x) > 65535)) throw new Error('Stable tags must be vMAJOR.MINOR.PATCH with MSIX-compatible components');
    return { tag: ref, version: ref.slice(1), packageVersion: `${ref.slice(1)}.0` };
  }
  if (channel !== 'development' || !Number.isSafeInteger(run) || run < 1 || !Number.isSafeInteger(attempt) || attempt < 1 || attempt > 65535) throw new Error('Invalid development build identity');
  const major = 1 + Math.floor(run / 65536);
  if (major > 65535) throw new Error('Development MSIX version space exhausted');
  const version = `0.0.0-dev.${run}.${attempt}+${sha.slice(0, 12)}`;
  return { tag: `dev-${run}-${attempt}-${sha.slice(0, 12)}`, version, packageVersion: `${major}.${run % 65536}.${attempt}.0` };
}
export function previousRelease(releases, channel) {
  return releases.filter(r => !r.draft && (channel === 'development' ? r.prerelease && /^dev-\d+-\d+-[a-f0-9]{12}$/.test(r.tag_name) : !r.prerelease && new RegExp(policy.stableTagPattern).test(r.tag_name)))
    .sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at))[0] ?? null;
}
export function changelog(commits, baseline) {
  const groups = new Map();
  for (const { sha, subject } of commits) {
    const kind = /^([a-z]+)(?:\([^)]*\))?(!)?:/.exec(subject);
    const category = kind?.[2] || /BREAKING CHANGE/.test(subject) ? 'Breaking changes' : ({ feat: 'New features', fix: 'Bug fixes', perf: 'Performance improvements', refactor: 'Changed functionality', revert: 'Removed / reverted functionality', docs: 'Documentation', build: 'Build and dependencies', ci: 'Automation', test: 'Tests' }[kind?.[1]] ?? 'Other development changes');
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(`- ${subject.replace(/[\r\n]/g, ' ')} (${sha.slice(0, 12)})`);
  }
  return `${baseline ? `Changes since ${baseline}.` : 'First channel release: only the triggering commit is listed; no historical changelog is copied.'}\n\n${groups.size ? [...groups].map(([name, lines]) => `### ${name}\n${lines.join('\n')}`).join('\n\n') : 'No source changes since the preceding release (build rerun).'}\n`;
}
export function securityFindings(sarif) {
  if (!Array.isArray(sarif.runs) || !sarif.runs.length) throw new Error('Security evidence must contain analyzer runs');
  const findings = new Map();
  for (const run of sarif.runs) {
    if (!run.tool?.driver?.name || !Array.isArray(run.results)) throw new Error('Incomplete analyzer evidence: tool and results are required');
    if (run.invocations?.some(invocation => invocation.executionSuccessful === false || invocation.toolExecutionNotifications?.some(notification => notification.level === 'error'))) throw new Error('Analyzer execution failed; findings cannot establish a clean result');
    const components = [run.tool.driver, ...(run.tool.extensions ?? [])];
    const rules = new Map(components.flatMap(component => component.rules ?? []).map(r => [r.id, r]));
    for (const result of run.results) {
      if (result.suppressions?.some(s => s.status === 'accepted')) continue;
      const componentIndex = result.rule?.toolComponent?.index;
      const component = componentIndex === undefined ? run.tool.driver : run.tool.extensions?.[componentIndex];
      const rule = rules.get(result.ruleId ?? result.rule?.id) ?? component?.rules?.[result.ruleIndex ?? result.rule?.index];
      if (!rule) throw new Error('Security result references an unknown rule');
      const precision = rule.properties?.precision;
      const score = Number(rule.properties?.['security-severity'] ?? 0);
      if (!Number.isFinite(score) || score < 0 || score > 10) throw new Error('Invalid analyzer severity');
      const loc = result.locations?.[0]?.physicalLocation;
      if (!['high', 'very-high'].includes(precision) || score < 7) continue;
      if (!loc?.artifactLocation?.uri) throw new Error('Blocking security result is missing its evidence location');
      const finding = { file: loc.artifactLocation.uri, line: loc.region?.startLine ?? 1, severity: score >= 9 ? 'Critical' : 'High', confidence: 'High-confidence potential vulnerability', rule: rule.id, problem: result.message?.text ?? result.message?.markdown ?? 'See SARIF evidence', reasoning: rule.fullDescription?.text ?? rule.shortDescription?.text, fix: rule.help?.text ?? 'Follow the linked CodeQL rule guidance; validate the reachable code path before claiming a confirmed vulnerability.' };
      findings.set(`${finding.file}:${finding.line}:${finding.rule}`, finding);
    }
  }
  return [...findings.values()];
}
export function issueSections(body) {
  return Object.fromEntries([...body.matchAll(/^### (.+)\r?\n+([\s\S]*?)(?=^### |$(?![\s\S]))/gm)].map(m => [m[1], m[2].trim()]));
}
export function missingIssueFields(body, type = 'general') {
  const sections = issueSections(body);
  const required = ['Summary', 'NvGram version', 'Environment', 'Details / reproduction', ...(['bug', 'regression', 'accessibility', 'performance'].includes(type) ? ['Expected behavior', 'Actual behavior'] : [])];
  return required.filter(key => !sections[key] || /^(_No response_|N\/A|unknown|todo)$/i.test(sections[key]));
}
export function relatedIssues(body, repository) {
  return [...new Set([...body.matchAll(/\b(?:fix(?:es|ed)?|close[sd]?|resolve[sd]?)\s+(?:([\w.-]+\/[\w.-]+))?#([1-9]\d*)/gi)]
    .filter(match => !match[1] || match[1].toLowerCase() === repository?.toLowerCase()).map(match => Number(match[2])))];
}
export function duplicateCandidates(issue, others) {
  const words = value => new Set(value.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);
  const title = words(issue.title);
  return others.filter(x => x.number !== issue.number && !x.pull_request).map(x => {
    const candidate = words(x.title); const union = new Set([...title, ...candidate]);
    const score = [...title].filter(x => candidate.has(x)).length / (union.size || 1);
    return { number: x.number, score };
  }).filter(x => x.score >= 0.8).sort((a, b) => b.score - a.score).slice(0, 3);
}
export function reviewContext(files) {
  const paths = files.map(f => f.filename);
  const areas = Object.entries(policy.components).filter(([, prefixes]) => paths.some(path => prefixes.some(prefix => path.startsWith(prefix)))).map(([area]) => area);
  const tests = paths.filter(p => /test|spec/i.test(p));
  return { areas, files: paths, tests, recommendations: [
    ...(paths.some(p => /\.(cs|h|idl)$/.test(p)) ? ['Inspect public API and serialization compatibility in related callers; compiler success alone does not prove compatibility.'] : []),
    ...(areas.includes('area:client') ? ['Review UI accessibility, error paths, threading, and performance with representative scenarios.'] : []),
    ...(areas.includes('area:automation') || areas.includes('area:dependencies') ? ['A maintainer must review permissions, dependency provenance, licenses, and secret boundaries.'] : []),
    ...(tests.length === 0 ? ['No changed tests detected; maintainers should decide whether regression coverage is required. This is informational, not a fabricated defect.'] : [])
  ] };
}
