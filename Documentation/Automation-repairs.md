# Verified repairs — 2026-10-04

Scope: the repository automation and unpackaged-settings checkpoint added in this thread. This is not a claim that every NvGram application bug has been eliminated.

## Repairs

- Build workspace cleanup now restores generated project/manifest inputs and any pre-existing `Constants.Secret.cs` byte-for-byte on exit. An originally absent file stays absent. Generated compile entries are not duplicated, and vcpkg uses a unique temporary checkout instead of colliding with previous invocations.
- Security evidence now rejects absent/empty analyzer runs, absent result arrays, failed analyzer execution, unknown rule references, invalid severity and missing actionable locations. Indexed extension rules are resolved rather than silently discarded. Explicit accepted suppressions still follow the existing reviewed exception policy.
- Review context uses merge-group base SHA when present and handles root/initial commits without assuming `HEAD^` exists.
- Release publication now independently verifies repository/version/build identity, build/packaging/gate/security results and zero-finding review evidence before draft creation. Packaging does not mark release metadata passed before validating its review input.
- Release hashing streams assets rather than reading entire packages into memory. Non-file/empty assets and assets at or above GitHub's 2 GiB per-file limit are rejected before upload. No throughput or performance speedup is claimed.
- File settings enforce a maximum supported container depth so every accepted nesting level can be read back within the JSON parser's limit. A regression test verifies persistence/reload at the boundary and rejection beyond it.

## Executed verification

- Node regression/interface suites: **15/15 passed**, no skips. New coverage includes invalid analyzer evidence, indexed extension rules and release blocking before draft creation for inconsistent review results.
- .NET 10 settings harness: **61 assertions passed** after compiling the actual implementation. This is an executable regression harness, not a claim of full application tests.
- Actual PowerShell Build.ps1 failure-path invocation in an isolated Git/workspace fixture: source mismatch failed as expected; project/manifest inputs and existing API configuration were preserved byte-for-byte; absent secret configuration remained absent.
- Workflow static analysis (actionlint), policy/schema/format checks, PowerShell parsing and tracked whitespace checks passed after affected repairs.

The cleanup regression also runs in the Windows CI job. Tests deliberately use fake API-free fixture files; user-provided credentials were not read, printed or written.

## Remaining limitations

VS2026 and required initialized/buildable native dependencies are unavailable locally. Full NvGram compilation, CodeQL extraction, signing, GitHub publication and UI runtime acceptance have not run. The no-certificate EXE port still requires desktop activation/storage/resources/integration work described in [Unpackaged-desktop.md](Unpackaged-desktop.md). Existing packaged release workflows are unchanged in their signing requirement; no runnable unpackaged distribution is claimed.

No administrator installation, remote protection change, deployment, commit or push was performed. Unrelated local edits remain untouched.
