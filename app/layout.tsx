import type { Metadata, Viewport } from 'next';
import { ServiceWorker } from './service-worker';
import './globals.css';

export const metadata: Metadata = {
  title: 'Route 151 — Pokémon Companion',
  description: 'Interactive map, checklist and Pokédex for Pokémon Yellow, FireRed and LeafGreen.',
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
  // Instalada en iOS, la app ocupa toda la pantalla (barra de estado translucida):
  // con 'cover' el navegador da las zonas seguras (env(safe-area-inset-*)).
  viewportFit: 'cover',
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
