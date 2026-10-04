# Secret-detection baseline

Recorded: 2026-10-04 · Owner: repository maintainer (`swarup-developer`) · Review before: 2027-01-04

The `secrets` job of [validation.yml](../.github/workflows/validation.yml) scans with Gitleaks. On a
push, pull request, or merge group it audits only the commits that event introduces (the merge base
of the reported base against `HEAD`); a scheduled or manual run has no such base and audits the full
reachable history. The reviewed baseline below applies in both modes.

Full-history scanning of a fork inevitably reports findings inherited from upstream history, so the
initial whole-history job failed with 32 findings that predate this repository's automation.
Each was reviewed and the exact Gitleaks fingerprint was recorded in `.gitleaksignore`, per the
exception policy in [SECURITY.md](../SECURITY.md). No broad rule, path, or directory allowlist was
added, and a new finding anywhere else still fails the gate — including a new secret in a commit an
event introduces, which fails the step and is retained in the SARIF evidence.

## Reviewed findings

All 32 are `<commit>:<path>:<rule>:<line>` fingerprints. None was introduced by this fork.

| Location | Rule | Classification |
| --- | --- | --- |
| `Telegram/Common/FeatureTokenGenerator.cs:23` | `generic-api-key` | False positive — Microsoft Limited Access Feature tokens, published constants required to call restricted Windows APIs. |
| `Unigram/Unigram/App.xaml` (24 findings, 5 commits) | `generic-api-key` | False positive — `Placeholder*Brush` `x:Key` values and color hex literals. |
| `Unigram/Unigram/Services/TonlibService.cs:116` | `generic-api-key` | False positive — TON lite-server `pub.ed25519` **public** key. |
| `Unigram/Unigram/Constants.cs:18` | `generic-api-key` | Inherited upstream history — retired HockeyApp identifier, file deleted from the current tree. |
| `Unigram/Unigram.Core/Services/LocationService.cs:53` | `generic-api-key` | Inherited upstream history — upstream service identifier in deleted code. |
| `Unigram/Unigram/Strings/en/Android.cs:19007,19029` | `gcp-api-key` | Inherited upstream history — upstream key quoted in XML doc comments, file deleted from the current tree. |

The `Unigram/*` paths do not exist at `develop`: they are inherited upstream history. Removing them
would require rewriting published history, which this repository does not do.

## Removing an entry

An entry may be deleted once its commit is no longer reachable (for example after an intentional
history rewrite) or once the exposed credential is confirmed rotated and its historical commit is
irrelevant. Deleting an entry makes Gitleaks re-report it; that is the intended way to re-review it.
