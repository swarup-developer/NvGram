# NvGram repository automation runbook

## Architecture and guarantees

All workflows share [policy.json](../.github/automation/policy.json), the reusable [validation workflow](../.github/workflows/validation.yml), and the [release workflow](../.github/workflows/release.yml). Application sources remain unchanged in Git; generated constants, manifests and embedded provenance are created only inside disposable build workspaces.

| Entry point | Trigger | Result |
| --- | --- | --- |
| Pull request validation | Open, edit, synchronize, reopen, ready-for-review; merge queue | Build, analyzers, security, dependencies, policy tests, contextual review, fail-closed gate |
| Bleeding Edge release | Completed push to `develop` | Validation, exact SHA clean build, unique Development version, signed prerelease |
| Stable release | Explicit `vMAJOR.MINOR.PATCH` push | Tag policy, independent validation/build, signed Stable release |
| Scheduled security | Weekly/manual | Full validation, no release |
| Issue tracking | Issue events; trusted PR metadata events | Structured-field checks, tentative duplicate hints, labels, links, audit; no closure |
| Propose verified issue fix | Maintainer dispatch + environment approval | Draft PR from an existing candidate fix branch; normal PR validation and human review |

Normal pushes/PRs cannot publish Stable. No promotion workflow exists. Stable uses `NvGram.Desktop.Bundle`; Development uses `NvGram.Desktop.Development`, its own execution alias, and no `tg`/`tonsite` protocol capture. Development never becomes GitHub's latest Stable release. Update records are immutable assets, not a mutable cross-channel feed. No in-app updater integration is claimed.

## Administrator activation (required before production use)

These files alone do not activate GitHub settings. No remote settings were modified while implementing them.

1. Review and merge the automation through an authorized maintainer. Do not publish a Stable tag during setup. The first development release fails safely until environment configuration exists.
2. Ensure the intended protected branches exist. Current policy names `develop` and `main`; remove/replace `main` if your Stable branch has another name. Confirm CODEOWNERS users have write access. At least two accountable human maintainers are needed for independent reviews and non-self-approved releases.
3. Install the pinned validator dependencies: `npm ci --prefix Tools/Automation --ignore-scripts`. Preview settings with `node Tools/Automation/setup.mjs`. After explicit administrator authorization, set `NVGRAM_REVIEWER_ID` to an independent authorized GitHub user's numeric ID and execute `node Tools/Automation/setup.mjs --apply` with an administrator `GH_TOKEN` and correct `GITHUB_REPOSITORY`.
4. The setup creates labels, strict protected-branch requirements, stale-review dismissal, code-owner review, last-push independent approval, conversation resolution, no force pushes/deletions, private vulnerability reporting, guarded environments and immutable Stable tags. Confirm settings in GitHub after application. Existing policies are not silently deleted. Verify the actual reusable check name is **Validation gate** in a real PR before enforcing it; select the exact observed check context if GitHub namespaces it. Enable “do not allow bypassing” for environment protections and restrict version-tag **creation** to authorized release maintainers with an organization ruleset. The immutable-tag ruleset blocks updates/deletion, not initial tag creation.
5. Enable GitHub dependency graph, Dependabot alerts/security updates, secret scanning/push protection and code security availability. Public repositories can use CodeQL; private repositories may require licensing. This implementation consumes CodeQL SARIF locally for reliable gating rather than assuming a successful SARIF upload blocks vulnerabilities. Missing scanner support is a failure, not a pass.
6. Populate **each** channel environment independently:
   - Secrets: `NVGRAM_API_ID`, `NVGRAM_API_HASH`, `NVGRAM_SIGNING_PFX` (base64 PFX), `NVGRAM_SIGNING_PASSWORD`.
   - Variables: `NVGRAM_PUBLISHER` (exact certificate subject starting `CN=`), `NVGRAM_APP_CHANNEL` (channel-specific Telegram username or empty).
   - Use a trusted production code-signing certificate with code-signing EKU and a private key; never the repository's temporary upstream certificate. The Stable and Development publisher may be the same, but identities and configuration remain separate.
   - Stable and issue-fix environments require independent human approval; Development permits automatic protected-branch releases.
7. Optional issue fix automation requires `ISSUE_FIX_TOKEN` in `issue-fix`: a narrowly scoped GitHub App installation token or fine-grained automation token with repository contents read and PR write. Prefer an App with short-lived installation tokens managed by your organization. Never use `GITHUB_TOKEN` for PR creation: it suppresses ordinary PR-triggered workflows. Set the token only when this feature is needed.
8. Run an ordinary fork PR and a repository PR before enabling release publication. Verify all gate constituents execute and no fork receives secrets. GitHub approval for first-time fork workflows may be required.

The setup is explicitly opt-in because protection changes can lock out a single-maintainer repository or fail when a named branch is absent. Apply settings only after reviewing the dry-run plan.

## Build environment and reproducibility

`windows-2025-vs2026` is the explicit GitHub-hosted Visual Studio 2026 image. Builds require UWP, C++, .NET Native, MSIX tooling, Windows SDK `10.0.26100.0`, .NET 10, CMake 4.4+, PHP and Git. Preflight rejects unsupported hosts. The local checkout has VS2022, not VS2026, and uninitialized submodules; a full app build cannot be validated locally without installing the correct toolchain.

Checkout is exact SHA with full history and recursive pinned submodules. vcpkg is freshly cloned and detached at the repository's immutable baseline. Existing overlay ports verify prebuilt archive SHA512. Managed dependencies use explicit project versions; `npm ci` uses the committed lock. Clean workspaces avoid stale bundle discovery. Deterministic compilation and CI properties are enabled. Runner image/MSBuild/.NET/vcpkg/submodule versions are retained. Hosted image servicing, transitive NuGet resolution without committed application lockfiles, and timestamped signatures mean **bit-for-bit reproducibility is not guaranteed**; add audited application NuGet lockfiles from the real Windows restore before claiming it.

The shipping UWP x64 flavor is validated and released. Modern NativeAOT, Win32 and ARM64 builds are not claimed as tested/released. The build script supports ARM64 validation invocation, but its workflow expansion requires real architecture-specific qualification. Benchmarks are not unit tests. Explicit VSTest projects are discovered and run when present; currently no dedicated application test suite exists, so the report honestly records `applicationTests: not-configured`. Automation has independent unit and CLI interface regression tests.

## Release contract

Release assets are under `artifacts/release/` during a run:

- `NvGram-<channel>-<tag>-x64.msixbundle`: signed, signature-verified app; embedded `NvGramRelease/release.json` and `CHANGELOG.md` identify the exact version/channel/SHA.
- `NvGram-<channel>-<tag>-x64.zip`: installation layout including dependency directory/scripts produced by MSBuild, license, changelog, release and update records.
- `release.json`: full version, MSIX version, channel, SHA, source/run URLs, timestamp, runner image, publisher, certificate fingerprint and validation state.
- `validation.json`: source/platform, build/packaging/test availability, toolchain and submodule evidence.
- `CHANGELOG.md`: only the delta against the immediately preceding published release **in that channel**; first release lists only its triggering commit. Force-push/divergent channel history fails instead of guessing a baseline.
- `development.json` or `stable.json`: isolated identity/version/publisher/download/checksum record; automatic channel switching is false.
- `SHA256SUMS`: hashes of downloadable assets. ZIP includes release metadata; do not confuse a checksum with publisher authenticity.

Development tag: `dev-<run_number>-<attempt>-<short_sha>`; display version: `0.0.0-dev.<run_number>.<attempt>+<short_sha>`. MSIX requires four numeric 16-bit components; the Development mapping is monotonic and independent of Stable SemVer. Stable uses canonical `v1.2.3` and package `1.2.3.0`, with each numeric part in the Windows range. Existing versions (even failed drafts) cannot be overwritten. A Stable rerun cannot reuse a draft/published tag without deliberate maintainer recovery.

All stages must succeed before a release is published. Assets upload to a draft, then uploaded size/state/count are verified before publication. Failed uploads preserve an unpublished draft and logs, never replace the previous release. Build transcripts avoid signing credentials and credential-bearing MSBuild binary logs. Build evidence retention is 30 days; release/audit diagnostics 90 days, subject to repository retention limits. Published assets persist with releases. Enterprise archival beyond GitHub retention requires an organization retention policy.

## Channel transaction lock and recovery

GitHub `concurrency` cancels older pending runs and therefore cannot guarantee every successful push is released. Publication uses atomic Git ref locks: `automation-release-lock-development` and `automation-release-lock-stable`. The lock's unique Git commit identifies run/attempt ownership; cleanup refuses another run's lock. Development waits for earlier development runs so changelogs and package update ordering stay coherent. Waits are bounded at 90 minutes; queue overload fails explicitly rather than silently cancelling a push.

A killed job can leave a stale lock. A maintainer must inspect the lock commit's run/attempt, verify the owning workflow is completed/not active, inspect drafts, then deliberately delete **only that lock ref** through GitHub. Never delete an active lock or a release tag. Rerun the failed workflow afterward. Monitor high-volume push queues; very expensive TDLib/vcpkg builds may require larger hosted runners and a durable organization queue for throughput. Do not use persistent shared self-hosted runners for arbitrary fork code.

## Security, reviews and issue policy

The gate depends on policy/workflow checks, Gitleaks, dependency/license review, actual Windows build/static analysis/CodeQL, and evidence-based contextual review. Critical/high high-precision CodeQL findings block; evidence is retained, not labeled confirmed without verification. Gitleaks scans full committed history with redaction and no broad exclusions. Existing historical findings must be remediated or documented with exact reviewed false-positive fingerprints, not suppressed wholesale.

Dependency review checks changed supported dependencies and denied SPDX licenses; NuGet audit blocks known high/critical advisories during restores. Native vendored/overlay libraries and packages.config dependencies do not have complete vulnerability/license coverage through GitHub dependency review. Changes to those inputs require human provenance, advisory and license review. This is **not** a claim of complete software-composition analysis for bundled native binaries. Preserve third-party notices and add a resolved native SBOM/advisory service only after selecting and validating one.

The reviewer inspects changed paths, component/test/API context and CodeQL data-flow findings. It produces `review.json`, `REVIEW.md`, and job summaries without comment spam. It does not pretend to be a general-purpose AI reviewer: performance, accessibility, authentication intent, compatibility and maintainability still need human code-owner review. No stylistic preference blocks a PR beyond configured automation formatting rules. SARIF suppressions require the SECURITY.md exception process.

Nine public structured forms cover bugs, features, enhancements, performance, documentation, accessibility, CI, regressions and general issues; the tenth category, security, has a private reporting entry instead of an unsafe public form. Issue forms collect version/environment/reproduction plus logs, media and context. Automation identifies omitted fields, hints at duplicates by title, associates explicitly named component labels and PR components, and never asserts reproduction from text alone. Priorities and confirmed/terminal statuses are human-controlled.

Automation never closes issues or PRs. GitHub native `Fixes #123` closes an issue only when the PR merges into the default branch; maintainers must verify the reported scenario before including a closing keyword. PRs opened/failed/abandoned do not resolve issues. Cross-repository issue references are not accidentally interpreted as local issues. Reopened issues return to triage without immediate reclosure. GitHub timeline, comment history and run audit records retain classification/link/closure/reopening history. Draft fix PRs are created only for maintainer-confirmed open issues and existing candidate-fix branches; no speculative code synthesis or production modifications occur.

## Verification commands and rollout acceptance

```bash
npm ci --prefix Tools/Automation --ignore-scripts --no-fund
node --test Tools/Automation/tests/*.test.mjs
node Tools/Automation/check.mjs
node Tools/Automation/setup.mjs
# With the pinned actionlint installed:
actionlint -shellcheck=''
```

Local checks cover YAML/policy invariants, issue schemas, channel history/versioning, security evidence thresholds, duplicate handling, release prepare/publish CLI behavior, failed-upload draft isolation, missing-SARIF failure, and reopened-issue behavior using isolated fake Git/GitHub executables. They do not publish remotely or mutate production issues.

Before production acceptance, execute on GitHub: valid/invalid PRs, a failed build, a secret test fixture (not a real secret), a high-confidence scanner fixture, a Development release, a deliberately failed packaging run, two queued development pushes, a manual Stable tag with approval, and an opt-in Windows install/update beside Stable. Verify expected assets, embedded metadata, signature trust, required runtime dependencies and exact check context. Actual builds, signing, CodeQL extraction, remote branch protection and Windows installation were **not** end-to-end executed during local implementation; do not describe them as passed until those rollout checks complete.
