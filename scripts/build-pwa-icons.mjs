// Genera los iconos PNG de la PWA a partir de public/favicon.svg.
// Usa sharp, que ya viene instalado con Next.js.
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';

const svg = await readFile(new URL('../public/favicon.svg', import.meta.url));
const out = (name) =>
  new URL(`../public/icons/${name}`, import.meta.url).pathname.replace(
    /^\/(\w:)/,
    '$1',
  );
const NAVY = '#11182a';

// Icono sobre fondo navy; `inset` es el margen para la zona segura de "maskable".
async function icon(name, size, inset) {
  const inner = Math.round(size * (1 - inset * 2));
  const logo = await sharp(svg, { density: 1024 })
    .resize(inner, inner)
    .png()
    .toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 4, background: NAVY },
  })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(out(name));
}

await icon('pwa-192.png', 192, 0.1);
await icon('pwa-512.png', 512, 0.1);
await icon('pwa-maskable-512.png', 512, 0.2);
await icon('apple-touch-icon.png', 180, 0.1);
console.log('Iconos PWA generados en public/icons/');
