# Contributing to NvGram

Discuss significant features or refactors in a NvGram feature/enhancement issue before starting work. Use the structured issue forms, provide reproduction evidence for defects, and keep private account data and credentials out of public reports. Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

## Pull requests

Create a feature/fix branch and open a PR against `develop` (or the maintainer-designated protected Stable branch). Describe the problem, affected code paths, solution, compatibility risks, test evidence and release notes. Link related issues. Use `Fixes #123` only when the original reproduction has been verified as resolved; GitHub applies automatic closure only on merge into the default branch.

All required checks and independent human/code-owner review must pass. A failure keeps the PR open: inspect the failed job and retained evidence, fix the code, and push another commit. Checks rerun automatically. Never bypass security validation, approve your own automated security-sensitive fix, or treat unavailable tests as passed.

## Releases

A validated push to `develop` is eligible for an opt-in Bleeding Edge prerelease. Stable requires a deliberate `vMAJOR.MINOR.PATCH` tag and authorized approval. Normal pushes/PRs do not create Stable. See the [automation runbook](Documentation/Repository-automation.md) for setup, signing, channel isolation and recovery.

## License

By contributing, you agree to license your contribution under the project's [GNU General Public License version 3](LICENSE). Preserve upstream and third-party attribution/license notices. New dependencies require provenance, vulnerability and license review.
