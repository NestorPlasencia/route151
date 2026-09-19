import type { Metadata, Viewport } from 'next';
import { ServiceWorker } from './service-worker';
import './globals.css';

export const metadata: Metadata = {
  title: 'Route 151 — Pokémon Yellow Companion',
  description: 'Interactive map, checklist and Pokédex for Pokémon Yellow.',
  applicationName: 'Route 151',
  icons: { icon: '/favicon.svg', apple: '/icons/apple-touch-icon.png' },
  appleWebApp: {
    capable: true,
    title: 'Route 151',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  themeColor: '#11182a',
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
        <ServiceWorker />
      </body>
    </html>
  );
}
