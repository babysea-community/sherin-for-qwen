# License Compliance

This project is distributed under the license in [LICENSE](LICENSE). Dependency license review is part of the public supply-chain posture for the standalone repository.

## Allowed Licenses

The following licenses are acceptable for normal runtime, development, and CI dependencies:

- Apache-2.0
- MIT
- BSD-2-Clause
- BSD-3-Clause
- BSD-0-Clause
- ISC
- MPL-2.0
- CC0-1.0
- BlueOak-1.0.0

## Review Required

The following findings require maintainer review before they are accepted into a release branch:

- Unknown or unclassified license metadata.
- LGPL-3.0-or-later or other weak-copyleft dependencies.
- CC-BY-4.0 or other attribution-focused content licenses.
- Any dependency that bundles native binaries, generated assets, model data, datasets, fonts, media, or redistributed third-party content.
- Any generated file or vendored artifact whose source, license, or generation process is unclear.

## Denied By Default

The following licenses or terms are denied unless maintainers explicitly approve a documented exception:

- AGPL, GPL, SSPL, or network-copyleft runtime dependencies.
- Proprietary, commercial-only, non-redistributable, source-unavailable, or field-of-use restricted dependencies.
- Dependencies that require undisclosed attribution, tracking, telemetry, or data sharing.
- Content or model assets that cannot be redistributed in a public repository.

## Dependency Changes

When adding or updating dependencies:

- Explain why the dependency is needed in the pull request.
- Prefer small, maintained packages with clear license metadata.
- Avoid adding dependencies for behavior that the standard library or existing project tooling already covers.
- Run the package manager audit command documented in [README.md](README.md) or the project workflow.
- Update [CHANGELOG.md](CHANGELOG.md) when dependency changes affect users, security posture, package size, runtime support, or release artifacts.

## Public CI Signals

This project may use GitHub and GitLab security workflows such as CodeQL, SAST, IaC scanning, Dependency Scanning, Secret Detection, Code Quality, package audit, container scanning, DAST, and redacted Gitleaks checks. Not every project type enables every signal.

Treat CI findings as review inputs. If a finding is a false positive, document the reason in the pull request or the relevant security workflow configuration.

## Related documents

- [CONTRIBUTING.md](CONTRIBUTING.md) explains how dependency changes should be proposed.
- [SECURITY.md](SECURITY.md) explains how to handle vulnerabilities and secret exposure.
- [README.md](README.md) defines this project's supported runtime and package contract.
