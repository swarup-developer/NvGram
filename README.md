<p align="center">
  <h3 align="center">NvGram</h3>

  <p align="center">
    An independent Windows messaging client based on Unigram.
    <br>
    <br>
    This repository is being prepared for NvGram development.
  </p>
</p>

<br>

## Development

NvGram is an independent Windows client based on Unigram. This fork was modified on October 3, 2026; it is distributed under the GNU General Public License version 3. Upstream and third-party copyright, attribution, and license notices are retained.

Build setup: see [Windows build instructions](Documentation/Build-instructions.md). See [LICENSE](LICENSE) for the full license.

## Repository automation and release channels

See the [CI/CD and repository automation runbook](Documentation/Repository-automation.md) for PR validation, security, issue tracking, administrator activation, and release recovery.

- **Bleeding Edge / Development:** opt-in prereleases from validated `develop` pushes, with a separate Windows package identity. May contain bugs, experimental or unfinished features, regressions, and breaking changes.
- **Stable:** created only by an explicit canonical version tag such as `v1.0.0`, independent validation, and authorized release approval. Never promoted automatically from Development.

Report vulnerabilities through the [private security reporting policy](SECURITY.md), not public issues. Required checks and independent human reviews must pass before merging.
