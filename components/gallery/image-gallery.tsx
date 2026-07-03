'use client';

import { Globe2, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import {
  siArtstation,
  siBehance,
  siDribbble,
  siFacebook,
  siInstagram,
  siPinterest,
  siTiktok,
  siTwitch,
  siX,
  siYoutube,
} from 'simple-icons';

import { ProtectedImage } from '@/components/protected-image';

import { useGalleryTouchEvents } from './touch-event';

type GalleryItem = {
  id: number;
  imageUrl: string;
  width: number;
  height: number;
};

type GalleryLayout = {
  wrapperClassName: string;
  frameClassName: string;
};

const galleryLayouts: GalleryLayout[] = [
  {
    wrapperClassName: 'col-span-2 row-span-2 md:col-span-1',
    frameClassName: 'aspect-[3/5]',
  },
  {
    wrapperClassName: 'col-span-1 row-span-1',
    frameClassName: 'aspect-square',
  },
  {
    wrapperClassName: 'col-span-2 row-span-1',
    frameClassName: 'aspect-[16/9]',
  },
  {
    wrapperClassName: 'col-span-1 row-span-1',
    frameClassName: 'aspect-[3/4]',
  },
  {
    wrapperClassName: 'col-span-1 row-span-1',
    frameClassName: 'aspect-square',
  },
  {
    wrapperClassName: 'col-span-2 row-span-2 md:col-span-1',
    frameClassName: 'aspect-[2/3]',
  },
  {
    wrapperClassName: 'col-span-1 row-span-1',
    frameClassName: 'aspect-square',
  },
  {
    wrapperClassName: 'col-span-2 row-span-1',
    frameClassName: 'aspect-[16/9]',
  },
  {
    wrapperClassName: 'col-span-1 row-span-1',
    frameClassName: 'aspect-[3/4]',
  },
  {
    wrapperClassName: 'col-span-2 row-span-2 md:col-span-1',
    frameClassName: 'aspect-[9/16]',
  },
  {
    wrapperClassName: 'col-span-1 row-span-1',
    frameClassName: 'aspect-square',
  },
  {
    wrapperClassName: 'col-span-2 row-span-2 md:col-span-1',
    frameClassName: 'aspect-[9/16]',
  },
];

// Replace these image URLs with your own generated media assets.
const galleryItems: GalleryItem[] = [
  {
    id: 1,
    imageUrl:
      'https://imagedelivery.net/ub24fjUytZQ3JbssUo49_w/8d74a98a-86a5-494c-67a0-c5476336c900/600x1000',
    width: 600,
    height: 1000,
  },
  {
    id: 2,
    imageUrl:
      'https://imagedelivery.net/ub24fjUytZQ3JbssUo49_w/5675a179-53f6-40dc-9615-0919bd435b00/800x800',
    width: 800,
    height: 800,
  },
  {
    id: 3,
    imageUrl:
      'https://imagedelivery.net/ub24fjUytZQ3JbssUo49_w/79dddf5d-07ae-42dc-f659-6442e45a0200/1024x576',
    width: 1024,
    height: 576,
  },
  {
    id: 4,
    imageUrl:
      'https://imagedelivery.net/ub24fjUytZQ3JbssUo49_w/1eca326f-f67f-4afd-a215-8aedc9a93900/768x1024',
    width: 768,
    height: 1024,
  },
  {
    id: 5,
    imageUrl:
      'https://imagedelivery.net/ub24fjUytZQ3JbssUo49_w/99650c27-d334-42c4-c205-78153ad49e00/800x800',
    width: 800,
    height: 800,
  },
  {
    id: 6,
    imageUrl:
      'https://imagedelivery.net/ub24fjUytZQ3JbssUo49_w/27d4882a-829a-4e9d-94e8-f002202f5e00/800x1200',
    width: 800,
    height: 1200,
  },
  {
    id: 7,
    imageUrl:
      'https://imagedelivery.net/ub24fjUytZQ3JbssUo49_w/e76bacbf-df83-4097-519e-04df05071f00/800x800',
    width: 800,
    height: 800,
  },
  {
    id: 8,
    imageUrl:
      'https://imagedelivery.net/ub24fjUytZQ3JbssUo49_w/42ef0a74-eb8c-444b-6654-dbb450a84f00/1024x576',
    width: 1024,
    height: 576,
  },
  {
    id: 9,
    imageUrl:
      'https://imagedelivery.net/ub24fjUytZQ3JbssUo49_w/7212c266-3198-464d-eae5-441e6f314000/768x1024',
    width: 768,
    height: 1024,
  },
  {
    id: 10,
    imageUrl:
      'https://imagedelivery.net/ub24fjUytZQ3JbssUo49_w/8f1badec-5746-4d43-a4d2-62a9fb4f5600/576x1024',
    width: 576,
    height: 1024,
  },
  {
    id: 11,
    imageUrl:
      'https://imagedelivery.net/ub24fjUytZQ3JbssUo49_w/ac995e42-03de-40ac-3476-6482d80bd600/800x800',
    width: 800,
    height: 800,
  },
  {
    id: 12,
    imageUrl:
      'https://imagedelivery.net/ub24fjUytZQ3JbssUo49_w/de9e325f-b971-45b1-6fd3-c2c1de475c00/576x1024',
    width: 576,
    height: 1024,
  },
  {
    id: 13,
    imageUrl:
      'https://imagedelivery.net/ub24fjUytZQ3JbssUo49_w/84374b79-f96e-49bc-a29b-c824645f0400/600x1000',
    width: 600,
    height: 1000,
  },
  {
    id: 14,
    imageUrl:
      'https://imagedelivery.net/ub24fjUytZQ3JbssUo49_w/7187918b-6d7a-43f7-c36d-dca2a9967b00/800x800',
    width: 800,
    height: 800,
  },
  {
    id: 15,
    imageUrl:
      'https://imagedelivery.net/ub24fjUytZQ3JbssUo49_w/67cc3373-139e-41aa-7518-13cd70269b00/1024x576',
    width: 1024,
    height: 576,
  },
  {
    id: 16,
    imageUrl:
      'https://imagedelivery.net/ub24fjUytZQ3JbssUo49_w/f7fae846-cb13-402a-0361-e2f1dcc88c00/768x1024',
    width: 768,
    height: 1024,
  },
  {
    id: 17,
    imageUrl:
      'https://imagedelivery.net/ub24fjUytZQ3JbssUo49_w/4c2dafe9-4a62-4570-333d-028acf446c00/800x800',
    width: 800,
    height: 800,
  },
  {
    id: 18,
    imageUrl:
      'https://imagedelivery.net/ub24fjUytZQ3JbssUo49_w/9b08b444-e1a4-427f-be10-cf75244a0300/800x1200',
    width: 800,
    height: 1200,
  },
  {
    id: 19,
    imageUrl:
      'https://imagedelivery.net/ub24fjUytZQ3JbssUo49_w/587dbaae-b23b-4d0f-212b-beb6ac7a6600/800x800',
    width: 800,
    height: 800,
  },
  {
    id: 20,
    imageUrl:
      'https://imagedelivery.net/ub24fjUytZQ3JbssUo49_w/a39539d0-7719-4585-218e-e217e3cb6900/1024x576',
    width: 1024,
    height: 576,
  },
  {
    id: 21,
    imageUrl:
      'https://imagedelivery.net/ub24fjUytZQ3JbssUo49_w/ffa2054c-f19d-4d70-7d4f-ab0bf5375200/768x1024',
    width: 768,
    height: 1024,
  },
  {
    id: 22,
    imageUrl:
      'https://imagedelivery.net/ub24fjUytZQ3JbssUo49_w/8d9da5f6-a109-4da7-2267-41fa028c6200/576x1024',
    width: 576,
    height: 1024,
  },
  {
    id: 23,
    imageUrl:
      'https://imagedelivery.net/ub24fjUytZQ3JbssUo49_w/bd48ece9-8cda-4f02-5715-e91bff9d2400/800x800',
    width: 800,
    height: 800,
  },
  {
    id: 24,
    imageUrl:
      'https://imagedelivery.net/ub24fjUytZQ3JbssUo49_w/5671495e-8da2-446b-7d36-08752d19e500/1280x720',
    width: 1280,
    height: 720,
  },
  {
    id: 25,
    imageUrl:
      'https://imagedelivery.net/ub24fjUytZQ3JbssUo49_w/1357c71f-4c6e-4c23-5418-0b0be9e50800/600x1000',
    width: 600,
    height: 1000,
  },
  {
    id: 26,
    imageUrl:
      'https://imagedelivery.net/ub24fjUytZQ3JbssUo49_w/239247ed-2c94-4dcd-b7de-e8c5216ee900/800x800',
    width: 800,
    height: 800,
  },
  {
    id: 27,
    imageUrl:
      'https://imagedelivery.net/ub24fjUytZQ3JbssUo49_w/d980fa07-cd19-40b5-8fbe-e1b9d3fd1500/1024x576',
    width: 1024,
    height: 576,
  },
  {
    id: 28,
    imageUrl:
      'https://imagedelivery.net/ub24fjUytZQ3JbssUo49_w/af25d1bb-cb88-4798-1ee4-003823332c00/768x1024',
    width: 768,
    height: 1024,
  },
  {
    id: 29,
    imageUrl:
      'https://imagedelivery.net/ub24fjUytZQ3JbssUo49_w/51c10052-05eb-4f95-6dbe-f5400e17fd00/800x800',
    width: 800,
    height: 800,
  },
  {
    id: 30,
    imageUrl:
      'https://imagedelivery.net/ub24fjUytZQ3JbssUo49_w/9e52d067-4d33-49de-00cf-87f3e47c6100/800x1200',
    width: 800,
    height: 1200,
  },
  {
    id: 31,
    imageUrl:
      'https://imagedelivery.net/ub24fjUytZQ3JbssUo49_w/7d83e422-bfbc-414d-24d0-c4d6a5f1d700/800x800',
    width: 800,
    height: 800,
  },
  {
    id: 32,
    imageUrl:
      'https://imagedelivery.net/ub24fjUytZQ3JbssUo49_w/86ffa39e-6b77-4ff1-739c-c0ac076cc600/1024x576',
    width: 1024,
    height: 576,
  },
  {
    id: 33,
    imageUrl:
      'https://imagedelivery.net/ub24fjUytZQ3JbssUo49_w/295c8391-f19a-46ce-18ce-3609fe42f900/768x1024',
    width: 768,
    height: 1024,
  },
  {
    id: 34,
    imageUrl:
      'https://imagedelivery.net/ub24fjUytZQ3JbssUo49_w/dc4e65bf-d693-4933-3f78-e7f33b485e00/576x1024',
    width: 576,
    height: 1024,
  },
  {
    id: 35,
    imageUrl:
      'https://imagedelivery.net/ub24fjUytZQ3JbssUo49_w/6ab62e7b-1cb1-4e94-711d-6c042a405f00/800x800',
    width: 800,
    height: 800,
  },
  {
    id: 36,
    imageUrl:
      'https://imagedelivery.net/ub24fjUytZQ3JbssUo49_w/c4eb0b13-b68c-4657-7427-99d87b8bb400/576x1024',
    width: 576,
    height: 1024,
  },
];

const galleryGroups = [
  galleryItems.slice(0, 12),
  galleryItems.slice(12, 24),
  galleryItems.slice(24, 36),
];

const galleryFinalItem: GalleryItem = {
  id: 37,
  imageUrl:
    'https://imagedelivery.net/ub24fjUytZQ3JbssUo49_w/c24e491c-031a-42ad-149d-fac9a7450000/3822x1841',
  width: 1280,
  height: 720,
};

type SimpleIconDefinition = {
  title: string;
  path: string;
};

// simple-icons dropped LinkedIn's brand icon (removed at LinkedIn's request),
// so the glyph is defined locally and rendered through the same SimpleIcon path.
const siLinkedin: SimpleIconDefinition = {
  title: 'LinkedIn',
  path: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z',
};

const creatorSocialLinks: Array<{
  label: string;
  href: string;
  icon?: SimpleIconDefinition;
  Icon?: LucideIcon;
}> = [
  { label: 'Instagram', href: '/', icon: siInstagram },
  { label: 'X', href: '/', icon: siX },
  { label: 'TikTok', href: '/', icon: siTiktok },
  { label: 'YouTube', href: '/', icon: siYoutube },
  { label: 'Twitch', href: '/', icon: siTwitch },
  { label: 'Behance', href: '/', icon: siBehance },
  { label: 'Dribbble', href: '/', icon: siDribbble },
  { label: 'ArtStation', href: '/', icon: siArtstation },
  { label: 'Pinterest', href: '/', icon: siPinterest },
  { label: 'Facebook', href: '/', icon: siFacebook },
  { label: 'LinkedIn', href: '/', icon: siLinkedin },
  { label: 'Website', href: '/', Icon: Globe2 },
];

export default function ImageGallery() {
  const galleryRef = useGalleryTouchEvents();

  return (
    <section
      ref={galleryRef}
      className="border-y border-[#20263a] bg-slate-950 py-24 sm:py-28 lg:py-32"
    >
      <div className="mx-auto w-full max-w-7xl px-6 sm:px-8 lg:px-10">
        <div className="relative pb-24 pt-4 text-center sm:pb-28 lg:pb-32">
          <h2 className="text-2xl font-semibold tracking-tight text-white md:text-5xl lg:text-6xl">
            <span>Creator</span>
            <span className="mx-4 text-slate-500">×</span>
            <span className="font-normal text-slate-400">Gallery</span>
          </h2>

          <div className="mx-auto mt-16 flex max-w-4xl flex-wrap items-center justify-center gap-3 sm:mt-20 lg:mt-24">
            {creatorSocialLinks.map((item) => {
              const Icon = item.Icon;

              return (
                <Link
                  key={item.label}
                  href={item.href}
                  aria-label={item.label}
                  title={item.label}
                  className="inline-flex size-11 items-center justify-center rounded-full border border-[#20263a] bg-[#0a0f22] text-slate-200 hover:border-[#f0abfc] hover:bg-[#111833] hover:text-white focus:outline-none focus-visible:border-[#f0abfc]"
                >
                  {item.icon ? (
                    <SimpleIcon icon={item.icon} />
                  ) : Icon ? (
                    <Icon className="size-5" aria-hidden="true" />
                  ) : null}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-7xl px-6 sm:px-8 lg:px-10">
        <div className="space-y-8 md:hidden">
          {galleryGroups.map((items, groupIndex) => (
            <div
              key={`mobile-gallery-${groupIndex}`}
              className="grid grid-cols-1 gap-7 sm:grid-cols-2 sm:gap-8"
            >
              {items.map((item) => (
                <GalleryCard
                  key={item.id}
                  item={item}
                  frameClassName="aspect-square"
                />
              ))}
            </div>
          ))}
        </div>

        <div className="hidden space-y-8 md:block">
          {galleryGroups.map((items, groupIndex) => (
            <div
              key={`desktop-gallery-${groupIndex}`}
              className="grid w-full auto-rows-auto grid-cols-4 gap-5 lg:gap-6"
            >
              {items.map((item, itemIndex) => {
                const layout = galleryLayouts[itemIndex]!;

                return (
                  <div key={item.id} className={layout.wrapperClassName}>
                    <GalleryCard
                      item={item}
                      frameClassName={layout.frameClassName}
                    />
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="mt-8">
          <GalleryCard item={galleryFinalItem} frameClassName="aspect-[16/9]" />
        </div>
      </div>
    </section>
  );
}

function SimpleIcon({ icon }: { icon: SimpleIconDefinition }) {
  return (
    <svg
      className="size-5"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d={icon.path} />
    </svg>
  );
}

function GalleryCard({
  item,
  frameClassName,
}: {
  item: GalleryItem;
  frameClassName: string;
}) {
  return (
    <div className="gallery-card group relative h-full overflow-hidden rounded-xl border border-[#20263a] bg-[#050817] shadow-lg shadow-[#0000004d] transition duration-300 hover:-translate-y-1 hover:border-[#f0abfc4d] hover:shadow-[#4a044e4d]">
      <div className={`${frameClassName} h-full w-full overflow-hidden`}>
        <ProtectedImage
          className="block h-full w-full object-cover transition duration-500 ease-out group-hover:scale-110 group-[.touch-active]:scale-110"
          src={item.imageUrl}
          alt={`Private generative media gallery output ${item.id}`}
          width={item.width}
          height={item.height}
          decoding="async"
          loading="lazy"
          sizes="(min-width: 768px) 50vw, (min-width: 640px) 50vw, 100vw"
        />
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-[#ffffff1a] to-[#ffffff0d] opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-[.touch-active]:opacity-100" />
    </div>
  );
}
