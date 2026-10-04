# NvGram security policy

## Reporting a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/swarup-developer/NvGram/security/advisories/new). Do **not** put exploit details, credentials, private messages, or account data in public issues. If the private form is unavailable, privately contact the repository maintainer through [their GitHub profile](https://github.com/swarup-developer); do not publish the vulnerability as a fallback. Administrators must enable private reporting before rollout.

Collect privately: summary, affected NvGram version/channel and Windows build, affected file/code path, minimal reproduction, impact, evidence, prerequisites, proposed mitigation, and safe contact details. Never test against systems you do not own or have permission to test. Security reports remain private until coordinated disclosure.

## Support and release channels

The latest Stable version receives priority fixes. Bleeding Edge is opt-in and may be unstable; it is not automatically promoted to Stable. Support expectations for older versions should be agreed with maintainers, not inferred from successful CI.

## Evidence and severity

- **Confirmed vulnerability:** demonstrated reachable exploit or independently verified vulnerable dependency plus applicable exposure.
- **High-confidence potential vulnerability:** analyzer code-flow evidence and a relevant reachable code path; label it potential until confirmed. Critical/high high-precision CodeQL findings block CI.
- **Informational:** incomplete reachability or risk evidence; never claim a confirmed defect or block on unsupported speculation.

CodeQL reports retained SARIF locations, rules and data flow. Dependency review and NuGet audit block known high/critical advisories. Secret detection is redacted; scanners must not echo credential values. Low-confidence cosmetic reports do not block merges. Scan errors or missing evidence are failures, not clean results.

## Exceptions

Only authorized human maintainers may accept a finding, with documented evidence, affected scope, mitigation, owner and expiration. Submit a reviewed policy/query-specific change or exact Gitleaks fingerprint; never add a broad directory allowlist or disable the gate. An exception does not prove safety. Required independent review and protected-branch checks remain mandatory. Automation cannot approve its own security-sensitive changes.

## Trust boundaries

PR code runs without release secrets, signing keys or issue write access. `pull_request_target` is reserved for trusted default-branch issue metadata automation and never checks out/executes a PR head. Release signing keys exist only in guarded, channel-scoped environments after validation. Use a real NvGram certificate; the tracked upstream temporary PFX is not a production signing key. Public binaries necessarily contain Telegram application ID/hash; these are app identifiers, not user account credentials. Never embed account tokens or other privileged credentials.
