# Security policy

This project is a public BabySea OSS repository. Its security boundary, runtime model, supported deployment mode, and expected validation steps are defined in [README.md](README.md).

## Reporting vulnerabilities

Please report vulnerabilities privately through GitHub's **Report a vulnerability** flow on this project's public repository. If that flow is unavailable, contact the maintainers at `dev@babysea.ai`.

Do not open public issues for suspected vulnerabilities or exposed secrets.

Useful reports include the affected route, package, workflow, file, command, schema, or deployment mode; reproduction steps; expected impact; and whether any secret, private data, prompt, generated media, or signed URL may have been exposed. Do not include real API keys, private prompts, reference media, generated media, customer data, signed URLs, or exploit payloads in public spaces.

## What to report

Please report issues such as:

- Authentication, authorization, tenancy, or scope bypass.
- Exposure of provider credentials, platform tokens, database secrets, webhook secrets, callback secrets, npm tokens, GitHub or GitLab tokens, signing keys, or other deployment secrets.
- Webhook signature bypass, replay, or delivery deduplication failures.
- Unsafe callback signing, callback payload tampering, or untrusted redirect behavior.
- Cross-user disclosure of prompts, reference media, generated media, request metadata, logs, account data, or private operational details.
- Server-side request forgery, unsafe URL handling, path traversal, command injection, template injection, or unsafe file handling.
- Provider-mode, region, endpoint, or adapter confusion that could send data to the wrong external service or leak raw provider parameters.
- Supply-chain issues involving dependencies, generated artifacts, CI workflows, release scripts, or package contents.

## Secret handling

- Use `.env.example` as the source of truth for runtime, build, CI, provider, webhook, callback, cron, rate-limit, analytics, and monitoring variables when this project has environment configuration.
- Keep every secret server-side unless `.env.example` explicitly marks the value as public.
- Keep provider keys, deployment tokens, database credentials, webhook secrets, signed URLs, private prompts, private media, and customer data out of logs, screenshots, chats, issues, pull requests, fixtures, generated files, and package artifacts.
- Treat provider region, base URL, model routing, storage, queue, and integration settings as deployment configuration unless [README.md](README.md) intentionally documents them as public behavior.
- Rotate any key that appears in logs, screenshots, chats, issues, pull requests, deployment output, CI artifacts, or generated package contents.

## Runtime boundary

This file is intentionally project-neutral. The exact runtime boundary depends on the project type:

| Project type | Security focus                                                                                   |
| :----------- | :----------------------------------------------------------------------------------------------- |
| SDK          | Package contents, exported API contract, dependency surface, local data handling, and examples.  |
| Primitive    | Infrastructure boundary, data contracts, operational credentials, storage, queues, and services. |
| Starter      | Application auth, route handlers, public environment values, webhooks, callbacks, and deploys.   |
| Docs         | Public content, examples, links, generated artifacts, and secret-free publishing workflows.      |

Follow [README.md](README.md), [CONTRIBUTING.md](CONTRIBUTING.md), and any project-specific [AGENTS.md](AGENTS.md) for the concrete boundary.

## Public disclosure rules

- Do not post vulnerability details publicly until maintainers have confirmed a fix or disclosure plan.
- Do not include exploit payloads that could be immediately reused against public deployments.
- Do not include real secrets, private URLs, private prompts, private reference media, generated media, customer data, or logs containing personal data.
- Use private maintainer channels when a reproduction requires sensitive material.

## Operational hardening

- Run the validation commands documented in [README.md](README.md) before deploys, releases, and security-sensitive changes.
- Keep public environment variables limited to values that are safe for browsers or public clients.
- Prefer scoped credentials, least-privilege tokens, short-lived keys, and separate credentials per environment.
- Validate untrusted input before storage, network calls, provider SDKs, shell commands, template rendering, or generated artifacts.
- Keep CI logs, package previews, and release artifacts free of secrets and private data.
- Review [LICENSES.md](LICENSES.md) when dependencies or redistributed content change.

## Related documents

- [CONTRIBUTING.md](CONTRIBUTING.md) explains how to propose safe changes.
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) explains expected community behavior.
- [LICENSES.md](LICENSES.md) explains dependency license review.
- [CHANGELOG.md](CHANGELOG.md) records user-visible security and behavior changes.
