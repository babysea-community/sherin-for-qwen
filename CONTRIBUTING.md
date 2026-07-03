# Contributing

Thanks for improving this project.

This repository is part of the BabySea OSS family. It may be an SDK, primitive, starter, documentation site, or another standalone project. Good contributions keep the public contract clear, the first-run path reliable, security boundaries explicit, and secrets out of public surfaces.

## Project direction

Use [README.md](README.md) as the source of truth for this project's purpose, supported workflows, runtime boundaries, and validation steps. If this project includes [AGENTS.md](AGENTS.md), follow it for repository-specific development guidance.

Prefer changes that make this project easier to adopt, operate, secure, test, and maintain. Avoid adding features that do not match the documented scope in [README.md](README.md).

## Development flow

1. Install dependencies using the package manager and commands documented in [README.md](README.md) or the project manifest.

   ```bash
   pnpm install --frozen-lockfile
   ```

2. If this project includes an environment template, copy it before running local services.

   ```bash
   cp .env.example .env.local
   ```

3. Configure only the values required by [README.md](README.md) or `.env.example`. Keep all secrets local.

4. Run the local validation commands documented by this project. Common examples include:

   ```bash
   pnpm format
   pnpm lint
   pnpm typecheck
   pnpm test
   pnpm build
   ```

If this project uses npm, Python, Docker, or another toolchain, use the equivalent commands documented in [README.md](README.md).

## Before opening a pull request

Run every relevant check for the files you changed. If a command is not available in this repository, mention the equivalent validation in the pull request.

Common checks include:

```bash
pnpm format
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

For package projects, also run the package dry-run documented in [README.md](README.md). For infrastructure or deployment changes, include the validation command that proves the configuration still loads.

## Contribution guidelines

- Keep the public repo friendly: no secrets, private project ids, local-only URLs, personal generated media, signed URLs, customer data, or private internal references.
- Keep changes inside this project's documented scope. If the scope should change, update [README.md](README.md) and explain the reasoning in the pull request.
- Keep public APIs, schemas, command-line flags, environment variables, deployment behavior, and generated outputs versioned and documented.
- Add or update tests for user-visible behavior, data contracts, security-sensitive paths, and bug fixes.
- Keep adapters thin and business logic testable when this project includes runtime code.
- Validate untrusted input before it reaches storage, network calls, provider SDKs, shell commands, templates, or generated artifacts.
- Do not log secrets, credentials, tokens, prompts, private media, customer data, or signed URLs.
- Keep every secret described in `.env.example` server-side unless that template explicitly marks the value as public.
- Update [README.md](README.md), [CHANGELOG.md](CHANGELOG.md), [SECURITY.md](SECURITY.md), and tests when behavior, configuration, security posture, or operations change.

## Documentation standard

Documentation is part of the release contract. Keep it factual, operator-ready, and tied to behavior that exists in the repository.

- Start from [README.md](README.md): what this project is, what it is not, how to install or deploy it, how to validate it, and how to recover or debug common issues.
- Use `.env.example` as the source of truth for environment variable names when the project has runtime configuration.
- Document validation steps beside operational claims.
- Keep security guidance concrete: where secrets live, which values are browser-visible, how to rotate keys, and what should never be posted publicly.
- Update [CHANGELOG.md](CHANGELOG.md) for user-visible docs, configuration, security, operations, API, schema, or packaging changes.
- Avoid roadmap language in the public contract. New features stay out of README claims until implemented, documented, and validated.

When a change touches these areas, review the matching docs before opening a pull request:

| Change area                                        | Required docs to review                                 |
| :------------------------------------------------- | :------------------------------------------------------ |
| Public API, SDK exports, schemas, or CLI flags     | README, CHANGELOG.md, tests                             |
| Required or optional environment values            | README, `.env.example`, SECURITY.md                     |
| Authentication, authorization, webhooks, or keys   | README, SECURITY.md, tests                              |
| Provider, network, storage, queue, or database use | README, SECURITY.md, deployment docs, tests             |
| Packaging, CI, release, or deployment behavior     | README, CHANGELOG.md, LICENSES.md, workflow files       |
| Documentation-only changes                         | README, CHANGELOG.md, CODE_OF_CONDUCT.md where relevant |

## Issue triage

- `bug` - reproducible defect, with logs, a failing test, or a minimal reproduction.
- `proposal` - scoped design idea with the user problem, implementation sketch, and validation path.
- `good first issue` - small, well-scoped change that can be validated without production credentials.
- `security` - do not open public issues for vulnerabilities; follow [SECURITY.md](SECURITY.md).

## Conduct

See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Be respectful, assume good faith, and keep discussion focused on the work and the people using it.

## Security-sensitive changes

Open security fixes privately through the process in [SECURITY.md](SECURITY.md). Do not include secrets, deployment details, unreleased vulnerability details, private prompts, reference media, generated media, customer data, or signed URLs in public issues, pull requests, test fixtures, logs, or screenshots.

## License compliance

Review [LICENSES.md](LICENSES.md) before adding dependencies or redistributed content. Dependency license changes should be called out in the pull request and reflected in [CHANGELOG.md](CHANGELOG.md) when they affect users.
