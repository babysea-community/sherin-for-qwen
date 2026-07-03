import {
  ExternalLink,
  GitCompareArrows,
  HeartHandshake,
  KeyRound,
  Rocket,
  Scale,
  ShieldCheck,
} from 'lucide-react';
import Link from 'next/link';
import type { ComponentType, SVGProps } from 'react';

import {
  InlineDigitalOcean,
  InlineNetlifyLight,
  InlineRailwayLight,
  InlineRenderLight,
  InlineVercelLight,
} from '@/components/icons/inline-host';
import {
  InlineHappyHorseLight,
  InlineQwen,
  InlineWan,
  InlineZImage,
} from '@/components/icons/inline-model';
import { InlineGitHub } from '@/components/icons/inline-git';
import {
  InlineAwsS3,
  InlineBackblazeB2,
  InlineCloudflareR2,
  InlineSupabaseStorage,
  InlineVercelBlob,
} from '@/components/icons/inline-storage';
import { ClientGallery } from '@/components/gallery/client';
import { DeployDropdown } from '@/components/deploy-dropdown';
import { InlineNetlify as InlineNetlifySponsor } from '@/components/icons/inline-sponsor';
import { ProtectedImage } from '@/components/protected-image';
import { MODEL_OPTIONS } from '@/lib/app-config';

const repositoryUrl = 'https://github.com/babysea-community/sherin-for-qwen';

const communityLinks = [
  {
    href: repositoryUrl,
    label: 'Source code',
    description: 'Project source code, issues, releases, and docs.',
    Icon: InlineGitHub,
  },
  {
    href: `${repositoryUrl}/blob/main/CODE_OF_CONDUCT.md`,
    label: 'Code of Conduct',
    description: 'Community standards for issues, pull requests, and support.',
    Icon: HeartHandshake,
  },
  {
    href: `${repositoryUrl}/blob/main/LICENSE`,
    label: 'License',
    description: 'OSI-approved Apache-2.0 License for reuse and forks.',
    Icon: Scale,
  },
] as const;

const shipCta =
  'Sherin runs on your own inference API key, your own domain, and your own storage. There is no paid plan inside Sherin.';

const pageContainerClass = 'mx-auto w-full max-w-7xl px-6 sm:px-8 lg:px-10';
const sectionTitleClassName =
  'text-2xl font-semibold tracking-tight text-white md:text-5xl lg:text-6xl';

type StackItem = {
  ariaLabel: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  label?: string;
};

function modelVendorIcon(modelId: string) {
  if (modelId.startsWith('happyhorse/')) {
    return InlineHappyHorseLight;
  }

  if (modelId.startsWith('qwen/')) {
    return InlineQwen;
  }

  if (modelId.startsWith('wan/')) {
    return InlineWan;
  }

  if (modelId.startsWith('z/')) {
    return InlineZImage;
  }

  return InlineQwen;
}

const supportedModels = MODEL_OPTIONS.map((model) => ({
  ariaLabel: model.label,
  Icon: modelVendorIcon(model.id),
  label: model.label,
})) satisfies StackItem[];

const storageOptions = [
  {
    ariaLabel: 'AWS S3',
    Icon: InlineAwsS3,
  },
  {
    ariaLabel: 'Backblaze B2',
    Icon: InlineBackblazeB2,
  },
  {
    ariaLabel: 'Cloudflare R2',
    Icon: InlineCloudflareR2,
  },
  {
    ariaLabel: 'Supabase Storage',
    Icon: InlineSupabaseStorage,
  },
  {
    ariaLabel: 'Vercel Blob',
    Icon: InlineVercelBlob,
  },
] satisfies StackItem[];

const hostingOptions = [
  {
    ariaLabel: 'DigitalOcean',
    Icon: InlineDigitalOcean,
  },
  {
    ariaLabel: 'Netlify',
    Icon: InlineNetlifyLight,
  },
  {
    ariaLabel: 'Railway',
    Icon: InlineRailwayLight,
  },
  {
    ariaLabel: 'Render',
    Icon: InlineRenderLight,
  },
  {
    ariaLabel: 'Vercel',
    Icon: InlineVercelLight,
  },
] satisfies StackItem[];

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-slate-950 text-white">
      <section
        className={`${pageContainerClass} relative flex min-h-screen flex-col py-8`}
      >
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 -z-10 h-96 bg-[radial-gradient(circle_at_top_left,rgba(217,70,239,0.22),transparent_38rem),radial-gradient(circle_at_top_right,rgba(45,212,191,0.16),transparent_32rem)]"
        />

        <nav className="flex items-center justify-between gap-4 text-sm">
          <a
            href={repositoryUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-3 font-semibold text-white transition hover:text-fuchsia-100"
          >
            <ProtectedImage
              src="/icon.png"
              alt="Sherin"
              width={36}
              height={36}
              className="size-9 rounded-xl"
              decoding="async"
              fetchPriority="high"
              loading="eager"
            />
            <span>Sherin for Qwen</span>
          </a>
          <Link
            href="/access"
            className="inline-flex items-center gap-2 rounded-full bg-fuchsia-300 px-4 py-2 font-semibold text-slate-950 shadow-lg shadow-[#4a044e66] transition hover:bg-fuchsia-200"
          >
            <KeyRound className="size-4" aria-hidden="true" />
            Owner access
          </Link>
        </nav>

        <div className="grid flex-1 items-center gap-12 py-16 lg:grid-cols-[minmax(0,0.88fr)_minmax(26rem,1.12fr)] lg:py-20">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-[#f0abfc33] bg-[#f0abfc1a] px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-fuchsia-100">
              <ShieldCheck className="size-4" aria-hidden="true" />
              Self-hosted private workspace
            </p>

            <h1 className="mt-7 max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-6xl">
              <span className="block">Own key.</span>
              <span className="block">Own domain.</span>
              <span className="block">Own storage.</span>
            </h1>

            <p className="mt-6 max-w-2xl text-base leading-8 text-slate-300 sm:text-lg">
              Sherin is a self-hosted private workspace for generative media,
              built for creators, artists, and developers who want more
              ownership over their creative workflow.
            </p>

            <div className="mt-10 flex flex-row flex-nowrap items-center gap-2 sm:gap-3">
              <a
                href={repositoryUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-fuchsia-300 px-4 py-3 text-xs font-semibold text-slate-950 shadow-lg shadow-[#4a044e66] transition hover:bg-fuchsia-200 sm:px-6 sm:text-sm"
              >
                <InlineGitHub className="size-4" aria-hidden="true" />
                View source
              </a>
              <DeployDropdown />
            </div>
          </div>

          <div className="rounded-[2rem] border border-[#20263a] bg-[#070b1a] p-5">
            <div className="rounded-[1.4rem] border border-[#20263a] bg-[#050817] p-5">
              <div className="flex items-center justify-between gap-3 border-b border-[#20263a] pb-4">
                <p className="text-base font-semibold text-white">
                  Project surface
                </p>
                <GitCompareArrows
                  className="size-5 text-fuchsia-200"
                  aria-hidden="true"
                />
              </div>

              <div className="mt-5 grid gap-3">
                {communityLinks.map((item) => {
                  const Icon = item.Icon;

                  return (
                    <a
                      key={item.href}
                      href={item.href}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="rounded-2xl border border-[#20263a] bg-[#0a0f22] p-4 hover:border-[#f0abfc] hover:bg-[#111833]"
                    >
                      <div className="flex items-start gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#25163f] text-fuchsia-100">
                          <Icon className="size-4" aria-hidden="true" />
                        </span>
                        <span className="min-w-0">
                          <span className="flex items-center gap-2 text-sm font-semibold text-white">
                            {item.label}
                            <ExternalLink
                              className="size-3.5 text-slate-500"
                              aria-hidden="true"
                            />
                          </span>
                          <span className="mt-1 block text-sm leading-6 text-slate-400">
                            {item.description}
                          </span>
                        </span>
                      </div>
                    </a>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      <SupportedModelsSection />

      <StorageHostingSection />

      <SponsorSection />

      <section className="border-t border-[#20263a] bg-[#000416]">
        <div className={`${pageContainerClass} py-28 sm:py-36`}>
          <div className="mx-auto flex max-w-6xl flex-col items-center gap-14 text-center sm:gap-16 lg:gap-20">
            <p className="max-w-4xl text-xl font-semibold leading-8 tracking-tight text-white sm:text-2xl sm:leading-9 lg:text-3xl lg:leading-10">
              {shipCta}
            </p>
            <a
              href={repositoryUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-2 rounded-full bg-fuchsia-300 px-6 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-[#4a044e66] transition hover:bg-fuchsia-200"
            >
              <Rocket className="size-4" aria-hidden="true" />
              Ship your own Sherin
            </a>
            <ProtectedImage
              src="/dashboard.png"
              alt="Sherin dashboard"
              width={1000}
              height={525}
              decoding="async"
              loading="lazy"
              sizes="(min-width: 1280px) 72rem, calc(100vw - 3rem)"
              className="w-full rounded-2xl border border-[#20263a] shadow-2xl shadow-[#00000066]"
            />
          </div>
        </div>
      </section>

      <ClientGallery />

      <footer
        className={`${pageContainerClass} flex flex-col gap-3 py-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between`}
      >
        <a
          href="https://www.netlify.com"
          target="_blank"
          rel="noreferrer noopener"
          className="font-medium text-[#05BDBA] underline decoration-[#05BDBA66] underline-offset-4 transition hover:text-white hover:decoration-white"
        >
          This site is powered by Netlify
        </a>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <a
            href={`${repositoryUrl}/blob/main/LICENSE`}
            target="_blank"
            rel="noreferrer noopener"
            className="text-fuchsia-100 transition hover:text-white"
          >
            Apache-2.0 License
          </a>
          <a
            href={`${repositoryUrl}/blob/main/CODE_OF_CONDUCT.md`}
            target="_blank"
            rel="noreferrer noopener"
            className="text-fuchsia-100 transition hover:text-white"
          >
            Code of Conduct
          </a>
        </div>
      </footer>
    </main>
  );
}

function SupportedModelsSection() {
  return (
    <section className="border-t border-[#20263a] bg-[#000416]">
      <div className={`${pageContainerClass} py-28 sm:py-36`}>
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-14 text-center sm:gap-16 lg:gap-20">
          <div className="max-w-4xl">
            <h2 className={sectionTitleClassName}>
              <span>Alibaba Cloud</span>
              <span className="mx-4 text-slate-500">×</span>
              <span className="font-normal text-slate-400">models</span>
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-400 sm:text-lg sm:leading-8">
              Powered by Alibaba Cloud models inside one private studio
            </p>
          </div>

          <div className="flex max-w-5xl flex-wrap items-center justify-center gap-3 sm:gap-4">
            {supportedModels.map((item) => {
              const Icon = item.Icon;

              return (
                <span
                  key={item.ariaLabel}
                  className="inline-flex items-center gap-2 rounded-full border border-[#f0abfc4d] bg-[#f0abfc14] px-3.5 py-2 text-xs font-semibold text-fuchsia-50 sm:text-sm"
                  title={item.ariaLabel}
                >
                  <Icon
                    className="h-4 w-auto shrink-0 text-fuchsia-100"
                    aria-hidden="true"
                  />
                  <span>{item.label}</span>
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function SponsorSection() {
  return (
    <section className="border-t border-[#20263a] bg-[#000416]">
      <div className={`${pageContainerClass} py-28 sm:py-36`}>
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-14 text-center sm:gap-16 lg:gap-20">
          <div className="max-w-4xl">
            <h2 className={sectionTitleClassName}>
              <span>Sponsor</span>
              <span className="mx-4 text-slate-500">×</span>
              <span className="font-normal text-slate-400">Sherin</span>
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-400 sm:text-lg sm:leading-8">
              Sponsors keep Sherin free and open-source for everyone
            </p>
            <a
              href="https://github.com/sponsors/babysea-community"
              target="_blank"
              rel="noreferrer noopener"
              className="mt-8 inline-flex items-center gap-2 rounded-full bg-fuchsia-300 px-6 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-[#4a044e66] transition hover:bg-fuchsia-200"
            >
              <HeartHandshake className="size-4" aria-hidden="true" />
              Sponsor us
            </a>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-8">
            <a
              href="https://www.netlify.com"
              target="_blank"
              rel="noreferrer noopener"
              aria-label="Netlify"
              title="Netlify"
              className="inline-flex items-center justify-center rounded-2xl border border-[#20263a] bg-[#0a0f22] px-8 py-5 transition hover:scale-105 hover:border-[#f0abfc33] hover:bg-[#111833]"
            >
              <InlineNetlifySponsor
                className="h-10 w-auto"
                aria-hidden="true"
              />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function StorageHostingSection() {
  return (
    <section className="border-t border-[#20263a] bg-[#000416]">
      <div className={`${pageContainerClass} py-28 sm:py-36`}>
        <div className="mx-auto grid max-w-6xl gap-14 text-center sm:gap-16 lg:grid-cols-2 lg:gap-20">
          <IconColumn
            title="Storage"
            subtitle="Generated media lands in storage you control"
            items={storageOptions}
          />
          <IconColumn
            title="Hosting"
            subtitle="Deploy private workspace on your preferred host"
            items={hostingOptions}
          />
        </div>
      </div>
    </section>
  );
}

function IconColumn({
  items,
  subtitle,
  title,
}: {
  items: readonly StackItem[];
  subtitle: string;
  title: string;
}) {
  return (
    <section className="text-center">
      <h2 className={sectionTitleClassName}>{title}</h2>
      <p className="mt-4 text-base leading-7 text-slate-400 sm:text-lg sm:leading-8">
        {subtitle}
      </p>

      <div className="mt-14 flex flex-wrap items-center justify-center gap-4 sm:mt-10 sm:gap-4 lg:mt-10">
        {items.map((item) => {
          const Icon = item.Icon;

          return (
            <span
              key={item.ariaLabel}
              aria-label={item.ariaLabel}
              role="img"
              title={item.ariaLabel}
              className="inline-flex size-12 items-center justify-center rounded-lg border border-[#20263a] bg-[#0a0f22] transition hover:scale-105 hover:border-[#f0abfc33] hover:bg-[#111833] sm:size-14"
            >
              <Icon
                aria-hidden="true"
                className="h-6 w-auto shrink-0 text-fuchsia-100 sm:h-8"
              />
            </span>
          );
        })}
      </div>
    </section>
  );
}
