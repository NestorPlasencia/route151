// Deja en public/vendor/tesseract/ lo que necesita el lector de fichas: el
// worker, el nucleo WASM y el idioma ingles (las fichas del juego estan en
// ingles aunque la app este en espanol).
//
// Se sirve desde el propio dominio, no desde un CDN, para que la PWA lo pueda
// guardar y escanear sin internet. Corre solo en `npm run build` (prebuild) y
// no se guarda en git: sale de node_modules y de una descarga que se cachea.
//
// Uso:  node scripts/build-ocr-assets.mjs
import {createRequire} from 'node:module';
import {mkdir, copyFile, stat, writeFile} from 'node:fs/promises';
import {dirname, join} from 'node:path';

const require = createRequire(import.meta.url);
const OUT = 'public/vendor/tesseract';
// El nucleo con SIMD y solo LSTM es el que usan los moviles de hoy. Lleva el
// WASM dentro del .js: asi no depende de como resuelva rutas el worker.
const CORE = 'tesseract-core-simd-lstm.wasm.js';
const LANG = 'eng.traineddata.gz';
const LANG_URL = `https://tessdata.projectnaptha.com/4.0.0_fast/${LANG}`;

const size = async (path) => { try { return (await stat(path)).size } catch { return 0 } };

const copy = async (from, name) => {
  await copyFile(from, join(OUT, name));
  return `${name} (${Math.round((await size(join(OUT, name))) / 1024)} KB)`;
};

const download = async (url, name) => {
  const out = join(OUT, name);
  if (await size(out) > 0) return `${name} (ya estaba)`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  await writeFile(out, Buffer.from(await res.arrayBuffer()));
  return `${name} (${Math.round((await size(out)) / 1024)} KB, descargado)`;
};

await mkdir(OUT, {recursive: true});
const worker = require.resolve('tesseract.js/dist/worker.min.js');
const core = join(dirname(require.resolve('tesseract.js-core/package.json')), CORE);
const done = [
  await copy(worker, 'worker.min.js'),
  await copy(core, CORE),
  await download(LANG_URL, LANG),
];
console.log(`lector de fichas -> ${OUT}: ${done.join(', ')}`);
