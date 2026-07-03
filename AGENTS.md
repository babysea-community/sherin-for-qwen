# Sherin Agent Guide

Sherin is a standalone BabySea OSS starter for a self-hosted private generative media workspace. It is owner-only, supports own-key inference, own-domain deployment, and user-controlled storage, and keeps provider credentials server-side.

## Scope

Use this guide for changes inside the Sherin starter, especially owner auth, inference providers, storage providers, dashboard workflows, public homepage/gallery surfaces, deploy configuration, and starter documentation.

## Working Rules

- State assumptions before changing owner auth, inference providers, storage providers, generation processing, or deployment behavior.
- Keep changes surgical. Do not refactor dashboard flows, storage adapters, or database contracts unless the requested behavior requires it.
- Prefer the smallest implementation that preserves the owner-only workspace boundary.
- Update only docs, env examples, doctor checks, tests, or changelog entries that are directly affected by the change.
- Verify with the narrowest useful command first, then broaden when shared behavior is touched.

## Layout

| Path                                   | Purpose                                                                                 |
| -------------------------------------- | --------------------------------------------------------------------------------------- |
| `app/page.tsx`                         | Public Sherin homepage                                                                  |
| `components/gallery`                   | Public homepage gallery                                                                 |
| `components/protected-image.tsx`       | Plain protected image renderer used by homepage and gallery assets                      |
| `app/access`                           | Owner Google OAuth entry point                                                          |
| `app/auth/callback/route.ts`           | Supabase auth callback                                                                  |
| `app/dashboard/studio`                 | Prompt form, provider fields, uploads, and generation start flow                        |
| `app/dashboard/gallery`                | Completed, failed, unavailable, and in-flight generation records                        |
| `app/dashboard/references`             | Uploaded and URL-based reference images                                                 |
| `app/dashboard/usage`                  | Provider, storage, queue, and quota state                                               |
| `app/dashboard/profile`                | Owner and deployment settings                                                           |
| `app/api/generations/process/route.ts` | Owner/cron generation recovery endpoint                                                 |
| `lib/auth/owner.ts`                    | Owner email authorization                                                               |
| `lib/inference`                        | Alibaba Cloud and BabySea inference adapters                                            |
| `lib/storage`                          | Supabase Storage, AWS S3, Backblaze B2, Cloudflare R2, and Vercel Blob storage adapters |
| `lib/security/csp.ts`                  | CSP and remote image/script allowlists                                                  |
| `supabase/migrations`                  | Owner workspace schema, storage metadata, references, and generation records            |
| `scripts/doctor.mjs`                   | Deployment wiring validator                                                             |

## Conventions

- Sherin is owner-only. The owner allowlist configured in `.env.example` gates dashboard access after Supabase Google OAuth.
- `INFERENCE_PROVIDER=alibaba-cloud` uses direct Alibaba Cloud execution; `INFERENCE_PROVIDER=babysea` uses the BabySea SDK.
- Keep every secret described in `.env.example` server-side unless the template explicitly marks it as public.
- Storage provider choices are `aws-s3`, `backblaze-b2`, `cloudflare-r2`, `supabase-storage`, and `vercel-blob`; Supabase Storage is the default and fallback path.
- Use `ProtectedImage` for public homepage, dashboard screenshot, icon, and gallery image rendering. Do not reintroduce `next/image` for those assets unless explicitly requested.
- On the public homepage, prefer solid paint for compact mobile cards, icon buttons, and link surfaces. Avoid stacking translucent backgrounds, rings, shadows, backdrop blur, transforms, or transitions on Android-sensitive surfaces.
- Generation records, prompts, statuses, provider metadata, storage URLs, references, and profile state persist in Supabase behind RLS.
- `/api/generations/process` can be called by owner-triggered dashboard flows or cron with the configured worker bearer secret from `.env.example`.
- `pnpm run doctor` must validate wiring without printing secrets.

## Verification

- `pnpm run doctor`
- `pnpm format`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test:run`
- `pnpm build`
