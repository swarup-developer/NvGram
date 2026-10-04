import { writeFileSync, mkdirSync } from 'node:fs';
const directory = '.github/ISSUE_TEMPLATE';
mkdirSync(directory, { recursive: true });
const types = [
  ['bug', 'Bug report', 'Report a reproducible defect', 'Expected behavior, actual behavior, and numbered reproduction steps.'],
  ['feature', 'Feature request', 'Propose a new capability', 'User problem, use cases, proposed behavior, alternatives, and acceptance criteria.'],
  ['enhancement', 'Enhancement', 'Improve existing functionality', 'Current behavior, proposed improvement, affected feature, and acceptance criteria.'],
  ['performance', 'Performance issue', 'Report measured performance problems', 'Representative workload, measured timings/resource use, expected baseline, profiling evidence, and reproduction steps.'],
  ['documentation', 'Documentation issue', 'Report missing or incorrect documentation', 'Documentation link, incorrect text, expected correction, and reader impact.'],
  ['accessibility', 'Accessibility issue', 'Report accessibility barriers', 'Affected screen/control, assistive technology and version, keyboard/screen-reader steps, expected behavior, and accessibility impact.'],
  ['ci', 'Build / CI failure', 'Report build, packaging or automation failures', 'Failed workflow/job/run URL, commit SHA, toolchain versions, exact command, failed stage, error output, and reproduction steps.'],
  ['regression', 'Regression report', 'Report previously working behavior', 'Last working version/commit, first failing version/commit, expected and actual behavior, numbered reproduction steps, and any bisect evidence.'],
  ['general', 'General issue', 'Track work not covered by another category', 'Problem, impact, supporting evidence, and desired outcome.']
];
const scalar = value => JSON.stringify(value);
for (const [type, name, description, guidance] of types) {
  const content = `name: ${scalar(name)}
description: ${scalar(description)}
title: ${scalar(`[${type}] `)}
labels: ["type:${type}", "status:triage"]
body:
  - type: markdown
    attributes:
      value: "Do not include API keys, account tokens, passwords, private messages, or unredacted personal data. Report vulnerabilities through the private Security reporting link."
  - type: input
    id: summary
    attributes:
      label: Summary
      description: Concise description of the problem or request.
    validations:
      required: true
  - type: input
    id: version
    attributes:
      label: NvGram version
      description: Exact version, Stable or Bleeding Edge channel, and commit SHA if available (use not applicable for documentation-only requests).
    validations:
      required: true
  - type: textarea
    id: environment
    attributes:
      label: Environment
      description: Windows version/build, x64 or ARM64, installation channel, hardware and relevant runtime/tool versions.
    validations:
      required: true
  - type: textarea
    id: details
    attributes:
      label: Details / reproduction
      description: ${scalar(guidance)}
    validations:
      required: true
  - type: textarea
    id: expected
    attributes:
      label: Expected behavior
    validations:
      required: ${['bug', 'regression', 'accessibility', 'performance'].includes(type)}
  - type: textarea
    id: actual
    attributes:
      label: Actual behavior
    validations:
      required: ${['bug', 'regression', 'accessibility', 'performance'].includes(type)}
  - type: textarea
    id: regression
    attributes:
      label: Regression information
      description: Last working version and first failing version, or state that this is unknown.
  - type: textarea
    id: logs
    attributes:
      label: Logs
      description: Relevant error output with credentials and personal data removed.
      render: text
  - type: textarea
    id: media
    attributes:
      label: Screenshots or recordings
      description: Attach evidence with private data redacted.
  - type: textarea
    id: context
    attributes:
      label: Additional context
      description: Related issues/PRs, affected components, workarounds, and supporting evidence.
`;
  writeFileSync(`${directory}/${type}.yml`, content);
}
writeFileSync(`${directory}/config.yml`, `blank_issues_enabled: false
contact_links:
  - name: Security vulnerability (private reporting)
    url: https://github.com/swarup-developer/NvGram/security/advisories/new
    about: Privately report affected versions, reproduction, impact, evidence and remediation. Never disclose exploit details in public issues. See SECURITY.md; if private reporting is unavailable, contact the maintainer privately through their GitHub profile.
`);
