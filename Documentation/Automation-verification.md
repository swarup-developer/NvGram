# Automation verification — 2026-10-04

## Executed successfully

- Clean automation dependency install via `npm ci --prefix Tools/Automation --ignore-scripts --no-fund`.
- **13/13** Node unit/interface regression tests, no skips.
- Workflow/channel/issue-schema/provenance/format policy validation.
- All workflow syntax/static analysis via actionlint **1.7.7**. The downloaded executable archive matched its published SHA256 before extraction. The older validator's verified VS2026 hosted runner label is declared explicitly.
- `npm audit --prefix Tools/Automation --audit-level=moderate`: **0 vulnerabilities** after upgrading the YAML validator to 2.9.1.
- JavaScript syntax checks for automation modules and test fixtures.
- PowerShell AST parsing for build/package scripts: no parse errors.
- `git diff --check` for tracked changes. Automation formatting is also validated directly, including untracked workflow files.
- Administrator setup dry-run generated successfully; no remote settings applied.

Interface tests invoke the actual CLI entry points against isolated fake Git/GitHub executables. They verify channel-specific changelog selection, duplicate-version rejection, failed uploads remaining unpublished drafts, successful asset publication sequencing, provenance mismatch rejection, reopened issue handling, actionable security evidence/severity, and missing-SARIF failure. Unit tests additionally verify canonical Stable tags, Development version uniqueness, precision thresholds, cross-repository issue reference isolation, duplicate hints and review context.

## Not executed / not claimed

- Actual NvGram compilation/typechecking, TDLib/vcpkg restoration and CodeQL extraction. The local host has VS2022 instead of the required VS2026, and required submodules are uninitialized.
- Actual Gitleaks full-history scanning, GitHub dependency review, production signing or timestamping.
- Real Development/Stable publication, simultaneous push ordering, Windows install/update/signature trust tests.
- Live branch protections, labels, guarded environments, private reporting or tag rules. These require reviewed administrator activation after the workflows are present remotely.
- Application unit/integration/UI regression suites: no dedicated suites are configured; discovery records this honestly instead of marking nonexistent coverage passed.
- Full native dependency composition analysis/license compatibility, bit-identical reproducibility, Modern/Win32/ARM64 qualification or a general-purpose AI reviewer.

The first actionlint download was interrupted and failed checksum/extraction; it was redownloaded and verified before use. Initial CLI fixtures exposed Windows path handling errors; those were repaired and all tests rerun. Dependency audit found a moderate YAML parsing vulnerability; the pinned dependency and lockfile were upgraded and the final clean audit rerun.

## Delivery state

Changes are local and uncommitted. No push, PR, release, production issue modification or administrator setting change was performed. Existing `.freebuff` and Instant View editor changes were left untouched. See [the runbook](Repository-automation.md) for activation and production acceptance scenarios; repository automation is implemented, but production rollout remains pending those checks.
