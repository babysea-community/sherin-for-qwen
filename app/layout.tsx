import type { Metadata } from 'next';
import '@/styles/globals.css';
import { Toaster } from '@/components/ui/sonner';

const title = 'Sherin';
const description =
  'Private workspace for generative media with own key, domain, and storage.';
const socialImageUrl =
  'https://cdn.babysea.live/assets/oss/sherin-for-qwen-card.png';

export const metadata: Metadata = {
  metadataBase: new URL('https://sherin-for-qwen.babysea.live'),
  applicationName: title,
  title: {
    default: title,
    template: `%s | ${title}`,
  },
  description,
  keywords: [
    'babysea',
    'open-source',
    'ai-infrastructure',
    'control-plane',
    'execution-layer',
    'inference-providers',
    'developer-tools',
    'creative-tools',
    'generative-ai',
    'generative-media',
  ],
  icons: {
    icon: [{ url: '/favicon.ico', type: 'image/x-icon' }],
    shortcut: ['/favicon.ico'],
  },
  openGraph: {
    title,
    description,
    images: [
      {
        alt: title,
        height: 630,
        url: socialImageUrl,
        width: 1200,
      },
    ],
    siteName: title,
    type: 'website',
    url: '/',
  },
  robots: {
    follow: true,
    index: true,
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: [socialImageUrl],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
