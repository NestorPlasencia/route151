import './globals.css';

export const metadata = {
  title: 'Route 151 — Pokémon Yellow Companion',
  description: 'Interactive map, checklist and Pokédex for Pokémon Yellow.',
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
