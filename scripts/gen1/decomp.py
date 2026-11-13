"""Lectura de las decompilaciones de la Gen 1 (pret/pokeyellow, pret/pokered):
mapas, tilesets, conexiones y paletas.

Lo usan los demas scripts de scripts/gen1; primero hay que correr sync-decomp.py.
Cada script recibe el juego ('yellow' o 'rb') y llama a use(); Red y Blue salen
de la misma decompilacion, con la version elegida en use_version() (las ramas
IF DEF(_RED) / IF DEF(_BLUE) del codigo).

Formato de la Game Boy que se reproduce aqui:
- maps/X.blk: un byte por bloque de 32x32 px, fila a fila.
- Bloque (blockset .bst): 16 bytes, los tiles de 8x8 px en 4x4, fila a fila.
- Tileset: PNG en grises de 4 tonos, 16 tiles por fila.
- Color: el de Super Game Boy, una paleta de cuatro colores por mapa
  (engine/gfx/palettes.asm, SetPal_Overworld).
"""
import os, re, sys
from functools import lru_cache

import numpy as np
from PIL import Image

BLOCK = 32
TILE = 8

# Cada juego: su decompilacion (commit fijo), carpeta de salida en public/,
# versiones (cada una con su progreso, encuentros y Pokedex) y nombre.
GAMES = {
    'yellow': {'repo': 'https://github.com/pret/pokeyellow', 'commit': 'e89ead154b9968aa50eed9328ff2b38b6c194382',
               'root': 'data/yellow/pokeyellow', 'out': 'yellow', 'versions': ['yellow'], 'name': 'Yellow',
               'uid': 'yellow:'},
    'rb': {'repo': 'https://github.com/pret/pokered', 'commit': 'a7b6c19e3b5c2d169abeacfe0e28047993872342',
           'root': 'data/rb/pokered', 'out': 'rb', 'versions': ['red', 'blue'], 'name': 'Red and Blue',
           'uid': 'rb:'},
}
NAMES = {'yellow': 'Yellow', 'red': 'Red', 'blue': 'Blue'}
GAME = None
ROOT = None
OUT = None
VERSION = None
_CACHED = []


def cached(fn):
    """lru_cache que se vacia al cambiar de juego o de version."""
    fn = lru_cache(None)(fn)
    _CACHED.append(fn)
    return fn


def use(game=None):
    """Elige el juego: el argumento dado o el primero de la linea de comandos."""
    global GAME, ROOT, OUT
    game = game or next((a for a in sys.argv[1:] if a in GAMES), None)
    if game not in GAMES:
        sys.exit(f'uso: {os.path.basename(sys.argv[0])} {"|".join(GAMES)}')
    GAME, ROOT, OUT = GAMES[game], GAMES[game]['root'], GAMES[game]['out']
    use_version(GAME['versions'][0])
    return GAME


def use_version(version):
    global VERSION
    VERSION = version
    for fn in _CACHED:
        fn.cache_clear()


def path(*parts):
    return os.path.join(ROOT, *parts)


def read(*parts):
    """Un archivo del juego tal como entra en la version elegida: sin los bloques
    IF DEF(_DEBUG) (en el 2F de la casa de Red hay cuatro puertas de depuracion a
    Mt. Moon, el Escondite, la Torre y Silph), con su ELSE si lo tienen, y solo
    con la rama de esta version en IF DEF(_RED) / IF DEF(_BLUE)."""
    return release(open(path(*parts), encoding='utf-8').read(), VERSION)


FLAGS = ('_DEBUG', '_RED', '_BLUE', '_GREEN', '_YELLOW')


def release(text, version=None):
    """Evalua IF DEF(_X) con las banderas del juego (solo la de la version
    definida; _DEBUG nunca) y deja su rama; los demas IF/ELSE/ENDC (condiciones
    que aqui no se evaluan) pasan tal cual."""
    defined = {f'_{version.upper()}'} if version else set()
    out, stack = [], []  # por cada IF abierto: 'off' (rama que no entra), 'on' u 'other'
    for line in text.splitlines(keepends=True):
        word = line.split(';')[0].strip()
        if word.startswith('IF '):
            flag = re.fullmatch(r'IF DEF\((\w+)\)', word)
            if flag and flag[1] in FLAGS:
                stack.append('on' if flag[1] in defined else 'off')
            else:
                stack.append('other')
                if 'off' not in stack:
                    out.append(line)
            continue
        if word in ('ELSE', 'ENDC') and stack:
            frame = stack[-1] if word == 'ELSE' else stack.pop()
            if word == 'ELSE' and frame != 'other':
                stack[-1] = 'on' if frame == 'off' else 'off'
            elif frame == 'other' and 'off' not in stack:
                out.append(line)
            continue
        if 'off' not in stack:
            out.append(line)
    return ''.join(out)


@cached
def map_consts():
    """Mapas en orden: constante, indice, ancho y alto en bloques, y el pueblo o
    ruta al que pertenece si es interior (end_indoor_group)."""
    out, pending, index = [], [], 0
    first_indoor = None
    for line in read('constants/map_constants.asm').splitlines():
        found = re.match(r'\s*map_const (\w+),\s*(\d+),\s*(\d+)', line)
        if found:
            m = {'const': found[1], 'index': index, 'width': int(found[2]), 'height': int(found[3]), 'outside': None}
            out.append(m)
            if first_indoor is not None:
                pending.append(m)
            index += 1
        elif 'DEF FIRST_INDOOR_MAP' in line:
            first_indoor = index
        elif (group := re.match(r'\s*end_indoor_group (\w+)', line)):
            for m in pending:
                m['outside'] = group[1]
            pending = []
    for m in out:
        m['indoor'] = first_indoor is not None and m['index'] >= first_indoor
    return out


@cached
def maps():
    """Constante -> mapa con su nombre en el codigo (Route1), tileset, archivo de
    bloques, bloque de borde y conexiones [(direccion, constante, desplazamiento)]."""
    # Varias casas comparten diseno: etiquetas seguidas antes de un solo INCBIN.
    blocks, pending = {}, []
    for label, file in re.findall(r'^(\w+)_Blocks:(?:\s*INCBIN "(maps/[^"]+)")?', read('maps.asm'), re.M):
        pending.append(label)
        if file:
            blocks.update({p: file for p in pending})
            pending = []
    out = {}
    for name in sorted(os.listdir(path('data/maps/headers'))):
        text = read('data/maps/headers', name)
        head = re.search(r'map_header (\w+), (\w+), (\w+)', text)
        if not head:
            continue
        label, const, tileset = head.groups()
        # UndergroundPathRoute7Copy repite la constante del mapa real: sin usar.
        if label.endswith('Copy') or const in out:
            continue
        conns = [(d, c, int(o)) for d, _, c, o in re.findall(r'connection (\w+), (\w+), (\w+), (-?\d+)', text)]
        objects = read('data/maps/objects', f'{label}.asm') if os.path.exists(path('data/maps/objects', f'{label}.asm')) else ''
        border = re.search(r'db \$(\w+) ; border block', objects)
        out[const] = {'label': label, 'const': const, 'tileset': tileset, 'blk': blocks.get(label), 'connections': conns,
                      'border': int(border[1], 16) if border else 0}
    for m in map_consts():
        if m['const'] in out:
            out[m['const']].update(m)
    return {k: v for k, v in out.items() if v.get('blk') and v.get('width')}


@cached
def tileset_files():
    """Nombre del tileset (OVERWORLD) -> (png de tiles, .bst de bloques)."""
    text = read('gfx/tilesets.asm')
    gfx, blk, names = {}, {}, []
    for label, kind, file in re.findall(r'^(\w+)_(GFX|Block)::(?:\s*INCBIN "([^"]+)")?', text, re.M):
        names.append((label, kind))
        if file:
            for pending_label, pending_kind in names:
                (gfx if pending_kind == 'GFX' else blk)[pending_label] = file
            names = []
    # Las constantes son el nombre en mayusculas con guiones bajos: RedsHouse1 -> REDS_HOUSE_1.
    const = lambda s: re.sub(r'(?<=[a-z])(?=[A-Z0-9])|(?<=[0-9])(?=[A-Z])', '_', s).upper()
    return {const(k): (gfx[k].replace('.2bpp', '.png'), blk[k]) for k in gfx if k in blk}


@cached
def tileset(name):
    """Tiles (n, 8, 8) con el tono 0-3 (0 blanco) y bloques (m, 16)."""
    png, bst = tileset_files()[name]
    img = np.array(Image.open(path(png)).convert('L'))
    shades = 3 - (img // 85)
    rows, cols = img.shape[0] // TILE, img.shape[1] // TILE
    tiles = shades[:rows * TILE, :cols * TILE].reshape(rows, TILE, cols, TILE).swapaxes(1, 2).reshape(-1, TILE, TILE)
    data = np.frombuffer(open(path(bst), 'rb').read(), dtype=np.uint8)
    return tiles, data[:len(data) // 16 * 16].reshape(-1, 16)


@cached
def palettes():
    """PAL_X -> cuatro colores RGB (blanco, claro, oscuro, negro)."""
    out = {}
    for values, name in re.findall(r'RGB ([\d, ]+) ; (PAL_\w+)', read('data/sgb/sgb_palettes.asm')):
        n = [int(v) for v in values.replace(' ', '').split(',')]
        out[name] = [tuple(c * 255 // 31 for c in n[i:i + 3]) for i in range(0, 12, 3)]
    return out


TOWN_PALETTES = ['PAL_PALLET', 'PAL_VIRIDIAN', 'PAL_PEWTER', 'PAL_CERULEAN', 'PAL_LAVENDER', 'PAL_VERMILION',
                 'PAL_CELADON', 'PAL_FUCHSIA', 'PAL_CINNABAR', 'PAL_INDIGO', 'PAL_SAFFRON']


def palette_of(m):
    """La paleta que pone el juego (SetPal_Overworld): cada pueblo la suya, las
    rutas PAL_ROUTE, cuevas PAL_CAVE, la Torre Pokemon gris, y los interiores la
    del pueblo o ruta donde estan."""
    consts = {x['const']: x for x in map_consts()}
    if m['tileset'] == 'CEMETERY':
        return palettes()['PAL_GRAYMON']
    if m['tileset'] == 'CAVERN' or m['const'].startswith('CERULEAN_CAVE') or m['const'] == 'BRUNOS_ROOM':
        return palettes()['PAL_CAVE']
    if m['const'] == 'LORELEIS_ROOM':
        return palettes()['PAL_ROUTE']
    base = consts.get(m.get('outside')) if m.get('indoor') else m
    index = base['index'] if base else len(TOWN_PALETTES)
    return palettes()[TOWN_PALETTES[index] if index < len(TOWN_PALETTES) else 'PAL_ROUTE']


def blocks_of(m):
    """Bloques del mapa en filas. Alguno trae menos de los que dice su tamano (el
    Camino Subterraneo norte-sur: 92 de 96; el juego lee lo que va detras); lo
    que falta se rellena con el bloque de borde."""
    data = np.frombuffer(open(path(m['blk']), 'rb').read(), dtype=np.uint8)
    size = m['width'] * m['height']
    if len(data) < size:
        data = np.concatenate([data, np.full(size - len(data), m.get('border', 0), dtype=np.uint8)])
    return data[:size].reshape(m['height'], m['width'])


def render(m, palette=None):
    """Imagen del mapa en color: un bloque de 32x32 px por byte del .blk."""
    tiles, blocks = tileset(m['tileset'])
    grid = blocks_of(m)
    shades = np.zeros((m['height'] * BLOCK, m['width'] * BLOCK), dtype=np.uint8)
    blank = np.zeros((TILE, TILE), dtype=np.uint8)
    for by in range(m['height']):
        for bx in range(m['width']):
            ids = blocks[grid[by, bx]] if grid[by, bx] < len(blocks) else [0] * 16
            for i, t in enumerate(ids):
                y, x = by * BLOCK + (i // 4) * TILE, bx * BLOCK + (i % 4) * TILE
                shades[y:y + TILE, x:x + TILE] = tiles[t] if t < len(tiles) else blank
    colors = np.array(palette or palette_of(m), dtype=np.uint8)
    return Image.fromarray(colors[shades], 'RGB')


# --- Pokemon: numeros, nombres, sprites y colores ---------------------------------------

@cached
def dex_numbers():
    """BULBASAUR -> 1 (numero de la Pokedex nacional)."""
    return {c: i + 1 for i, c in enumerate(re.findall(r'const DEX_(\w+)', read('constants/pokedex_constants.asm')))}


@cached
def internal_order():
    """Especies en el orden interno del juego; los huecos de MissingNo (const_skip) cuentan."""
    text = read('constants/pokemon_constants.asm').split('DEF NUM_POKEMON_INDEXES')[0]
    return [c or 'MISSINGNO' for c in re.findall(r'^\s*const(?:_skip|\s+(\w+))', text, re.M)][1:]


SPECIES_NAMES = {"Farfetch'd": "Farfetch'd", 'Mr.mime': 'Mr. Mime', 'Nidoran♀': 'Nidoran♀', 'Nidoran♂': 'Nidoran♂'}


@cached
def species_names():
    """Numero -> nombre como lo escribe el juego, en minusculas ('Mr. Mime', 'Nidoran♀')."""
    names = re.findall(r'dname "([^"]*)"', read('data/pokemon/names.asm'))
    numbers = dex_numbers()
    out = {}
    for const, name in zip(internal_order(), names):
        if const in numbers:
            nice = name[:1] + name[1:].lower()
            out[numbers[const]] = SPECIES_NAMES.get(nice, nice)
    return out


@cached
def front_sprites():
    """Numero -> PNG del sprite frontal (en grises de 4 tonos)."""
    # En Red y Blue Mew va aparte, en data/pokemon/mew.asm (se anadio al final).
    pics_asm = read('gfx/pics.asm') + (read('data/pokemon/mew.asm') if os.path.exists(path('data/pokemon/mew.asm')) else '')
    pics = dict(re.findall(r'^(\w+)PicFront::\s*INCBIN "(gfx/pokemon/front/[^"]+)\.pic"', pics_asm, re.M))
    numbers, out = dex_numbers(), {}
    for f in os.listdir(path('data/pokemon/base_stats')):
        text = read('data/pokemon/base_stats', f)
        dex, pic = re.search(r'db DEX_(\w+)', text), re.search(r'dw (\w+)PicFront', text)
        if dex and pic and pic[1] in pics:
            out[numbers[dex[1]]] = pics[pic[1]] + '.png'
    return out


@cached
def mon_palettes():
    """Numero -> los cuatro colores con que el juego pinta a esa especie (PAL_*MON)."""
    names = re.findall(r'db (PAL_\w+)', read('data/pokemon/palettes.asm'))[1:]  # el primero es MissingNo
    return {n + 1: palettes()[p] for n, p in enumerate(names)}


def mon_sprite(n, crop=False):
    """Sprite frontal en el color del juego, con el blanco transparente (RGBA).
    `crop` recorta el margen vacio: asi se usa como figurita."""
    img = np.array(Image.open(path(front_sprites()[n])).convert('L'))
    shades = 3 - (img // 85)
    colors = np.array([(*c, 255) for c in mon_palettes()[n]], dtype=np.uint8)
    rgba = colors[shades]
    rgba[shades == 0, 3] = 0
    out = Image.fromarray(rgba, 'RGBA')
    return out.crop(out.getbbox()) if crop and out.getbbox() else out
