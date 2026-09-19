"""Lectura de pret/pokefirered: mapas, disenos (layouts) y tilesets.

Lo usan los demas scripts de FRLG; primero hay que correr sync-decomp.py.

Formato del GBA que se reproduce aqui:
- map.bin: un u16 por bloque de 16x16 px; los 10 bits bajos son el metatile.
- Metatile: 8 u16 = 2 capas (abajo, arriba) de 2x2 tiles de 8x8 px. Cada u16
  lleva tile (10 bits), volteo horizontal y vertical, y paleta (4 bits).
- Los indices < 640 (tiles y metatiles) y las paletas < 7 son del tileset
  primario; el resto, del secundario.
"""
import json, os, re
from functools import lru_cache

import numpy as np
from PIL import Image

ROOT = 'data/frlg/pokefirered'
BLOCK = 16


def path(*parts):
    return os.path.join(ROOT, *parts)


def _defines():
    text = open(path('include/fieldmap.h'), encoding='utf-8').read()
    return {k: int(v) for k, v in re.findall(r'#define (NUM_\w+) (\d+)', text)}


_D = _defines()
TILES_PRIMARY = _D['NUM_TILES_IN_PRIMARY']
METATILES_PRIMARY = _D['NUM_METATILES_IN_PRIMARY']
PALS_PRIMARY = _D['NUM_PALS_IN_PRIMARY']


@lru_cache(None)
def tileset_dirs():
    """gTileset_X -> carpetas de sus tiles, paletas y metatiles.

    Algunos tilesets reutilizan graficos de otro (SilphCo usa los tiles y las
    paletas de Condominiums), asi que cada parte se resuelve por separado. Los
    primarios no aparecen en graphics.h: sus tiles y paletas estan junto a los
    metatiles.
    """
    headers = open(path('src/data/tilesets/headers.h'), encoding='utf-8').read()
    graphics = open(path('src/data/tilesets/graphics.h'), encoding='utf-8').read()
    metatiles = open(path('src/data/tilesets/metatiles.h'), encoding='utf-8').read()
    files = {sym: os.path.dirname(p) for sym, p in re.findall(r'(g\w+)\[\] = INCBIN_U\d+\("([^"]+)"\)', graphics + metatiles)}
    files.update({sym: os.path.dirname(p) for sym, p in re.findall(r'(gTilesetPalettes_\w+)\[\]\[16\] =\s*\{\s*INCBIN_U16\("([^"]+)"\)', graphics)})
    out = {}
    for name, body in re.findall(r'const struct Tileset (gTileset_\w+) =\s*\{(.*?)\};', headers, re.S):
        sym = dict(re.findall(r'\.(tiles|palettes|metatiles) = (\w+)', body))
        meta = files[sym['metatiles']]
        out[name] = {
            'tiles': path(files.get(sym['tiles'], meta)),
            # Las paletas se declaran en palettes/NN.gbapal; su carpeta es la del tileset.
            'palettes': path(os.path.dirname(files[sym['palettes']]) if sym['palettes'] in files else meta),
            'metatiles': path(meta),
        }
    return out


def _palette(file):
    lines = open(file, encoding='utf-8').read().split()
    # JASC-PAL: cabecera de 3 lineas y 16 colores "r g b".
    vals = list(map(int, lines[3:3 + 48]))
    return [tuple(vals[i:i + 3]) for i in range(0, 48, 3)]


class Tileset:
    def __init__(self, dirs):
        self.tiles = np.array(Image.open(os.path.join(dirs['tiles'], 'tiles.png')))  # indices 0..15
        self.metatiles = np.fromfile(os.path.join(dirs['metatiles'], 'metatiles.bin'), dtype='<u2').reshape(-1, 8)
        pal_dir = os.path.join(dirs['palettes'], 'palettes')
        self.palettes = [_palette(os.path.join(pal_dir, f'{i:02}.pal')) for i in range(16)]

    def tile(self, index):
        cols = self.tiles.shape[1] // 8
        y, x = divmod(index, cols)
        if (y + 1) * 8 > self.tiles.shape[0]:
            return None
        return self.tiles[y * 8:y * 8 + 8, x * 8:x * 8 + 8]


@lru_cache(None)
def tileset(name):
    return Tileset(tileset_dirs()[name])


@lru_cache(None)
def layouts():
    data = json.load(open(path('data/layouts/layouts.json'), encoding='utf-8'))
    return {l['id']: l for l in data['layouts'] if 'id' in l}


@lru_cache(None)
def maps():
    """MAP_X -> contenido de map.json, con 'dir' (carpeta del mapa)."""
    out = {}
    for d in sorted(os.listdir(path('data/maps'))):
        f = path('data/maps', d, 'map.json')
        if os.path.exists(f):
            m = json.load(open(f, encoding='utf-8'))
            m['dir'] = d
            out[m['id']] = m
    return out


class Renderer:
    """Dibuja metatiles para una pareja de tilesets, con cache."""

    def __init__(self, primary, secondary):
        self.p, self.s = tileset(primary), tileset(secondary)
        pals = self.p.palettes[:PALS_PRIMARY] + self.s.palettes[PALS_PRIMARY:]
        self.pals = np.array(pals, dtype=np.uint8)  # 16 paletas x 16 colores x RGB
        self.backdrop = tuple(self.pals[0][0])
        self.cache = {}

    def _tile(self, entry):
        index, pal = entry & 0x3FF, entry >> 12
        src = self.p.tile(index) if index < TILES_PRIMARY else self.s.tile(index - TILES_PRIMARY)
        if src is None:
            return None
        if entry & 0x400:
            src = src[:, ::-1]
        if entry & 0x800:
            src = src[::-1, :]
        rgba = np.zeros((8, 8, 4), np.uint8)
        rgba[..., :3] = self.pals[pal][src]
        rgba[..., 3] = np.where(src == 0, 0, 255)  # color 0 = transparente
        return rgba

    def metatile(self, mid):
        if mid in self.cache:
            return self.cache[mid]
        table, local = (self.p.metatiles, mid) if mid < METATILES_PRIMARY else (self.s.metatiles, mid - METATILES_PRIMARY)
        out = np.zeros((BLOCK, BLOCK, 4), np.uint8)
        out[..., :3] = self.backdrop
        out[..., 3] = 255
        if local < len(table):
            for layer in range(2):
                for i in range(4):
                    t = self._tile(int(table[local][layer * 4 + i]))
                    if t is None:
                        continue
                    y, x = (i // 2) * 8, (i % 2) * 8
                    region = out[y:y + 8, x:x + 8]
                    mask = t[..., 3:] > 0
                    region[...] = np.where(mask, t, region)
        self.cache[mid] = out
        return out


@lru_cache(None)
def _renderer(primary, secondary):
    return Renderer(primary, secondary)


def blocks(layout_id):
    l = layouts()[layout_id]
    data = np.fromfile(path(l['blockdata_filepath']), dtype='<u2')
    return data.reshape(l['height'], l['width'])


def render_layout(layout_id):
    """Imagen RGBA del diseno completo (ancho*16 x alto*16)."""
    l = layouts()[layout_id]
    r = _renderer(l['primary_tileset'], l['secondary_tileset'])
    grid = blocks(layout_id) & 0x3FF
    h, w = grid.shape
    img = np.zeros((h * BLOCK, w * BLOCK, 4), np.uint8)
    for y in range(h):
        for x in range(w):
            img[y * BLOCK:(y + 1) * BLOCK, x * BLOCK:(x + 1) * BLOCK] = r.metatile(int(grid[y, x]))
    return Image.fromarray(img, 'RGBA')
