"""Genera los mapas y marcadores de Pokemon Yellow desde pret/pokeyellow.

Mismo formato que build-frlg.py, para que la app cargue los dos juegos igual:
- regiones: Kanto con los exteriores unidos por sus conexiones;
- interiores: cada mapa suelto, agrupado por zona (la del mapa de la region:
  todas las plantas de Mt. Moon juntas);
- marcadores: objetos, objetos ocultos, entrenadores (con su equipo), Pokemon
  salvajes y fijos, regalos, intercambios, tiendas y rocas de Fuerza;
- warps (puertas y escaleras), lugares, encuentros por zona y checklist.

Todo en el color de Yellow (paleta de Super Game Boy / Game Boy Color de cada
mapa) y con coordenadas exactas por casilla (16 px).

Uso:  python scripts/yellow/sync-decomp.py && python scripts/yellow/build-yellow.py
Salida: public/yellow/areas/**.png, public/icons/yellow/** y public/yellow/data/
        (areas, markers, encounters y checklist)
"""
import json, os, re, shutil, sys, unicodedata
from collections import defaultdict

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
import decomp as d

OUT_IMG = 'public/yellow/areas'
OUT_DATA = 'public/yellow/data'
OUT_SPRITES = 'public/yellow/sprites'
ICONS = 'public/icons/yellow'
STEP = 16  # una casilla de movimiento: medio bloque
# Sprite grande de cada especie (panel de encuentros): el del juego, en su color.
SPRITE = '/yellow/sprites/p{}.png'
# Probabilidad de cada una de las 10 casillas de un encuentro (data/wild/probabilities.asm).
SLOTS = [51, 51, 39, 25, 25, 25, 13, 13, 11, 3]
WATER_TILE = 0x14


def slug(s):
    """'Pokémon Tower' -> 'pokemon-tower'."""
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')


def uid_of(text):
    """Numero estable para guardar el progreso (FNV-1a de 31 bits del id)."""
    h = 2166136261
    for b in text.encode('utf-8'):
        h = ((h ^ b) * 16777619) & 0xFFFFFFFF
    return h & 0x7FFFFFFF


# Palabras que no siguen la regla de mayuscula inicial.
WORDS = {'Tm': 'TM', 'Hm': 'HM', 'Pp': 'PP', 'Hp': 'HP', 'S.s.': 'S.S.', 'Mt.moon': 'Mt. Moon', 'Mt.': 'Mt.',
         'Is.': 'Islands', 'Hq': 'HQ', 'Co.': 'Co.', 'Jr.trainer♂': 'Jr. Trainer♂', 'Jr.trainer♀': 'Jr. Trainer♀',
         'Pokémaniac': 'Pokémaniac', 'Ss': 'S.S.'}
# Nombres del juego que la app ya conoce escritos de otra forma (y los de FRLG).
FIX = {'Rocket HQ': 'Rocket Hideout', 'S.s.anne': 'S.S. Anne', 'S.s.ticket': 'S.S. Ticket', 'Pokémon League': 'Pokémon League', 'S.S.anne': 'S.S. Anne', 'S.S.ticket': 'S.S. Ticket', 'Elixer': 'Elixir', 'Max Elixer': 'Max Elixir',
       'Pokémon Tower': 'Pokémon Tower', 'Silph Co.': 'Silph Co.', 'Rocket Hq': 'Rocket Hideout',
       'Pokédex': 'Pokédex', 'Parlyz Heal': 'Parlyz Heal', 'Exp.all': 'Exp. All', 'Seafoam Islands': 'Seafoam Islands',
       'Diglett S Cave': "Diglett's Cave", 'Diglett’s Cave': "Diglett's Cave", 'Pokémon Mansion': 'Pokémon Mansion',
       'Pokémon Lab': 'Pokémon Lab', 'Cerulean Cave': 'Cerulean Cave', 'Unknown Dungeon': 'Cerulean Cave',
       'Sea Cottage': "Bill's House", 'Pokémon League': 'Pokémon League', 'Underground Path': 'Underground Path',
       'Cinnabar Island': 'Cinnabar Island', 'Victory Road': 'Victory Road', 'Pokémon Fan Club': 'Pokémon Fan Club'}


def title(s):
    """'POKé BALL' -> 'Poké Ball'; 'MT.MOON' -> 'Mt. Moon'; 'TM36' -> 'TM36'."""
    # Tabla de caracteres de Gen 1: '#' es POKé y <PKMN> es POKéMON.
    s = s.replace('<PKMN>', 'POKéMON').replace('#', 'POKé')
    words = [w[:1].upper() + w[1:].lower() for w in s.split(' ') if w]
    words = [WORDS.get(w, re.sub(r'^(Tm|Hm)(\d+)$', lambda m: m.group(1).upper() + m.group(2), w)) for w in words]
    # "Sea Route 19" es la Ruta 19 de siempre: se nombra como en FRLG.
    text = re.sub(r'^Sea (Route \d+)$', r'\1', ' '.join(words))
    return FIX.get(text, text)


def asm(*parts):
    return d.read(*parts)


# --- Constantes y nombres -----------------------------------------------------------

dex_numbers, species_names = d.dex_numbers, d.species_names


def save_mon_images():
    """Figurita (sprite recortado) y sprite grande de las 151 especies, en el color
    que les da Yellow: public/icons/yellow/pokemon y public/yellow/sprites."""
    os.makedirs(f'{ICONS}/pokemon', exist_ok=True)
    os.makedirs(OUT_SPRITES, exist_ok=True)
    for n in d.front_sprites():
        d.mon_sprite(n, crop=True).save(f'{ICONS}/pokemon/p{n}.png', optimize=True)
        d.mon_sprite(n).save(f'{OUT_SPRITES}/p{n}.png', optimize=True)


def load_items():
    """Constante -> nombre: objetos por su lista de nombres; MT y MO por su numero."""
    text = asm('constants/item_constants.asm')
    consts = re.findall(r'^\s*const (\w+)', text.split('DEF NUM_ITEMS')[0], re.M)
    names = re.findall(r'li "([^"]*)"', asm('data/items/names.asm'))
    out = {c: title(n) for c, n in zip(consts[1:], names)}
    for i, move in enumerate(re.findall(r'add_hm (\w+)', text)):
        out[f'HM_{move}'] = f'HM{i + 1:02d}'
    for i, move in enumerate(re.findall(r'add_tm (\w+)', text)):
        out[f'TM_{move}'] = f'TM{i + 1:02d}'
    out['COIN'] = 'Coins'
    return out


def load_trainers(numbers, names):
    """(clase, indice) -> equipo como texto; clase -> nombre ('Bug Catcher')."""
    classes = re.findall(r'trainer_const (\w+)', asm('constants/trainer_constants.asm'))
    labels = re.findall(r'li "([^"]*)"', asm('data/trainers/names.asm'))
    class_name = {c: title(n) for c, n in zip(classes[1:], labels)}
    class_name.update({'RIVAL1': 'Rival', 'RIVAL2': 'Rival', 'RIVAL3': 'Rival', 'ROCKET': 'Team Rocket Grunt'})
    text = asm('data/trainers/parties.asm')
    order = re.findall(r'dw (\w+)Data', text.split('\n\n')[0] + text[:text.find('YoungsterData:')])
    blocks = dict(re.findall(r'^(\w+)Data:\n(.*?)(?=^\w+Data:|\Z)', text, re.M | re.S))
    parties = {}
    for label, cls in zip(order, classes[1:]):
        for i, line in enumerate(re.findall(r'^\s*db (.+?)\s*(?:;.*)?$', blocks.get(label, ''), re.M)):
            vals = [v.strip() for v in line.split(',')]
            if vals[-1] == '0':
                vals = vals[:-1]
            if vals[0] == '$FF':
                mons = [(int(vals[k]), vals[k + 1]) for k in range(1, len(vals) - 1, 2)]
            else:
                mons = [(int(vals[0]), v) for v in vals[1:]]
            parties[(cls, i + 1)] = ', '.join(f'{names[numbers[m]]} Lv{lv}' for lv, m in mons if m in numbers)
    return class_name, parties


def load_sprites():
    """SPRITE_X -> PNG del personaje (frames de 16x16 en columna, el primero de frente)."""
    consts = re.findall(r'const (SPRITE_\w+)', asm('constants/sprite_constants.asm').split('DEF FIRST_STILL_SPRITE')[0])
    sheets = re.findall(r'overworld_sprite (\w+),', asm('data/sprites/sprites.asm'))
    files = dict(re.findall(r'^(\w+)::\s*INCBIN "(gfx/sprites/[^"]+)\.2bpp"', asm('gfx/sprites.asm'), re.M))
    out = {}
    for const, sheet in zip(consts[1:], sheets):
        if sheet in files:
            out[const] = files[sheet] + '.png'
    # Las figuras quietas (Poke Ball, roca, fosil...) van despues, con su propia hoja.
    still = re.findall(r'const (SPRITE_\w+)', asm('constants/sprite_constants.asm').split('DEF FIRST_STILL_SPRITE')[1])
    for const, sheet in zip(still, sheets[len(consts) - 1:]):
        if sheet in files:
            out[const] = files[sheet] + '.png'
    return out


def sprite_frame(png):
    """Primer frame (de frente) como tonos 0-3, o None."""
    if not png or not os.path.exists(d.path(png)):
        return None
    img = np.array(Image.open(d.path(png)).convert('L'))
    return 3 - (img[:16, :16] // 85)


def zone_names():
    """Nombre de la zona de cada mapa exterior (por indice) y de cada grupo interior."""
    names = {k: title(v) for k, v in re.findall(r'^(\w+Name):\s*db "([^"@]*)@?"', asm('data/maps/names.asm'), re.M)}
    text = asm('data/maps/town_map_entries.asm')
    outdoor = [names.get(n, n) for n in re.findall(r'outdoor_map\s+\d+,\s*\d+,\s*(\w+)', text)]
    indoor = {g: names.get(n, n) for g, n in re.findall(r'indoor_map (\w+),\s*\d+,\s*\d+,\s*(\w+)', text)}
    return outdoor, indoor


def map_label(label, zone):
    """'MtMoon1F' en 'Mt. Moon' -> 'Mt. Moon 1F'; 'RedsHouse1F' en 'Pallet Town' ->
    "Pallet Town Red's House 1F"."""
    label = label.replace('SSAnne', 'SSAnne ')
    words = re.sub(r'(?<=[a-z])(?=[A-Z0-9])|(?<=[0-9])(?=[A-Z][a-z])|(?<=[0-9]F)(?=[A-Z])', ' ', label).split()
    words = ['Pokémon' if w == 'Pokemon' else 'S.S. Anne' if w == 'SSAnne' else w for w in words]
    text = ' '.join(words)
    for a, b in (('Reds ', "Red's "), ('Blues ', "Blue's "), ('Oaks ', "Oak's "), ('Bills ', "Bill's "), ('Mr Fujis ', "Mr. Fuji's "),
                 ('Wardens ', "Warden's "), ('Loreleis ', "Lorelei's "), ('Brunos ', "Bruno's "), ('Agathas ', "Agatha's "),
                 ('Lances ', "Lance's "), ('Champions ', "Champion's "), ('Melanies ', "Melanie's "), ('Mr Psychics ', "Mr. Psychic's "),
                 ('Copycats ', "Copycat's "), ('Grandpas ', "Grandpa's "), ('Name Raters ', "Name Rater's "), ('Captains ', "Captain's "),
                 ('Digletts ', "Diglett's "), ('Hall Of Fame', 'Hall of Fame'), ('North South', 'North–South'), ('West East', 'West–East'),
                 ('Pokecenter', 'Pokémon Center'), ('Mt Moon', 'Mt. Moon'), ('Silph Co ', 'Silph Co. ')):
        text = text.replace(a, b)
    key = lambda s: slug(s).replace('-', '')
    parts = text.split()
    for i in range(len(parts), 0, -1):
        if key(' '.join(parts[:i])) == key(zone):
            rest = ' '.join(parts[i:])
            return f'{zone} {rest}' if rest else zone
    # Los que ya llevan el nombre de su pueblo o de su zona ('Cinnabar Lab',
    # "Diglett's Cave Route 11") no lo repiten.
    if key(parts[0]) == key(zone.split()[0]) or key(zone) in key(text):
        return text
    return f'{zone} {text}'


# --- Mapas ----------------------------------------------------------------------------

def place_kanto(maps):
    """Exteriores colocados por sus conexiones desde Pueblo Paleta (en bloques)."""
    out = {c: m for c, m in maps.items() if not m['indoor']}
    pos, queue = {'PALLET_TOWN': (0, 0)}, ['PALLET_TOWN']
    while queue:
        c = queue.pop(0)
        m, (x, y) = out[c], pos[c]
        for direction, t, o in m['connections']:
            if t not in out:
                continue
            tm = out[t]
            p = {'north': (x + o, y - tm['height']), 'south': (x + o, y + m['height']),
                 'west': (x - tm['width'], y + o), 'east': (x + m['width'], y + o)}[direction]
            if t in pos:
                assert pos[t] == p, f'conexion incoherente {c} -> {t}'
            else:
                pos[t] = p
                queue.append(t)
    x0, y0 = min(p[0] for p in pos.values()), min(p[1] for p in pos.values())
    return {c: (x - x0, y - y0) for c, (x, y) in pos.items()}


def parse_objects(label):
    """Warps, carteles y objetos de un mapa (data/maps/objects)."""
    path = d.path('data/maps/objects', f'{label}.asm')
    text = open(path, encoding='utf-8').read() if os.path.exists(path) else ''
    warps = [(int(x), int(y), dest, int(n)) for x, y, dest, n in re.findall(r'^[ 	]*warp_event[ 	]+(\d+),[ 	]*(\d+),[ 	]*(\w+),[ 	]*(\d+)', text, re.M)]
    objects = []
    for line in re.findall(r'^[ 	]*object_event[ 	]+(.+)$', text, re.M):
        v = [s.strip() for s in line.split(';')[0].split(',')]
        objects.append({'x': int(v[0]), 'y': int(v[1]), 'sprite': v[2], 'facing': v[4], 'text': v[5], 'args': v[6:]})
    return warps, objects


def draw_objects(img, objects, frames, palette):
    """Pinta los personajes y objetos del mapa sobre su imagen (el blanco es transparente)."""
    colors = np.array(palette, dtype=np.uint8)
    arr = np.array(img)
    for o in objects:
        f = frames.get(o['sprite'])
        if f is None:
            continue
        x, y = o['x'] * STEP, o['y'] * STEP - 4
        h, w = f.shape
        y0, x0 = max(0, y), max(0, x)
        sub = f[y0 - y:h, x0 - x:w]
        if not sub.size:
            continue
        region = arr[y0:y0 + sub.shape[0], x0:x0 + sub.shape[1]]
        mask = sub[:region.shape[0], :region.shape[1]] > 0
        region[mask] = colors[sub[:region.shape[0], :region.shape[1]][mask]]
    return Image.fromarray(arr)


def tile_grid(m):
    """Tile de arriba a la izquierda de cada casilla de 16 px (para buscar hierba y agua)."""
    tiles, blocks = d.tileset(m['tileset'])
    grid = d.blocks_of(m)
    out = np.zeros((m['height'] * 2, m['width'] * 2), dtype=np.int32)
    for by in range(m['height']):
        for bx in range(m['width']):
            ids = blocks[grid[by, bx]] if grid[by, bx] < len(blocks) else [0] * 16
            for sy in range(2):
                for sx in range(2):
                    out[by * 2 + sy, bx * 2 + sx] = ids[(sy * 2 + 1) * 4 + sx * 2]
    return out


def grass_tiles():
    """Tileset -> tile de hierba alta (data/tilesets/tileset_headers.asm), si tiene."""
    out = {}
    names = list(d.tileset_files())
    for name, grass in re.findall(r'tileset (\w+),\s*[-$\w]+,\s*[-$\w]+,\s*[-$\w]+,\s*([-$\w]+),', asm('data/tilesets/tileset_headers.asm')):
        const = re.sub(r'(?<=[a-z])(?=[A-Z0-9])|(?<=[0-9])(?=[A-Z])', '_', name).upper()
        if grass.startswith('$'):
            out[const] = int(grass[1:], 16)
    return out


def spot(grid, tile, fallback):
    """Casilla con ese tile mas cercana al centro de todas ellas."""
    ys, xs = np.nonzero(grid == tile)
    if not len(xs):
        return fallback
    cx, cy = xs.mean(), ys.mean()
    i = int(np.argmin((xs - cx) ** 2 + (ys - cy) ** 2))
    return int(xs[i]), int(ys[i])


def wild_tables(consts):
    """Constante del mapa -> {'Grass'|'Surf': {especie: (min, max, probabilidad)}}."""
    pointers = re.findall(r'dw (\w+)', asm('data/wild/grass_water.asm'))
    by_index = {m['index']: m['const'] for m in consts}
    out = {}
    for i, label in enumerate(pointers):
        const = by_index.get(i)
        path = next((f for f in os.listdir(d.path('data/wild/maps')) if asm('data/wild/maps', f).startswith(f'{label}:')), None)
        if not const or not path:
            continue
        text = asm('data/wild/maps', path)
        tables = {}
        for kind, method in (('grass', 'Grass'), ('water', 'Surf')):
            body = re.search(rf'def_{kind}_wildmons (\d+).*?\n(.*?)end_{kind}_wildmons', text, re.S)
            if not body or body.group(1) == '0':
                continue
            t = {}
            for slot, (lv, sp) in enumerate(re.findall(r'db\s+(\d+),\s*(\w+)', body.group(2))):
                lo, hi, ch = t.get(sp, (99, 0, 0))
                t[sp] = (min(lo, int(lv)), max(hi, int(lv)), ch + SLOTS[slot])
            tables[method] = {sp: (lo, hi, round(ch * 100 / 256)) for sp, (lo, hi, ch) in t.items()}
        if tables:
            out[const] = tables
    # Super Cana: cuatro especies por mapa, 25 % cada una.
    for const, body in re.findall(r'db (\w+), ((?:\w+, \d+,? ?)+)', asm('data/wild/super_rod.asm')):
        pairs = re.findall(r'(\w+), (\d+)', body)
        t = {}
        for sp, lv in pairs:
            lo, hi, ch = t.get(sp, (99, 0, 0))
            t[sp] = (min(lo, int(lv)), max(hi, int(lv)), ch + 25)
        out.setdefault(const, {})['Super Rod'] = t
        # Cana Vieja y Cana Buena valen en cualquier agua: se ponen donde se pesca.
        out[const]['Old Rod'] = {'MAGIKARP': (5, 5, 100)}
        out[const]['Good Rod'] = {'GOLDEEN': (10, 10, 50), 'POLIWAG': (10, 10, 50)}
    return out


def mart_texts():
    """Etiqueta de texto de un dependiente -> lo que vende."""
    return {label: [s.strip() for s in items.split(',')] for label, items in re.findall(r'^(\w+)::\n\s*script_mart (.+)$', asm('data/items/marts.asm'), re.M)}


def text_labels(label):
    """TEXT_X del mapa -> etiqueta de su texto en el script (dw_const XText, TEXT_X)."""
    out = {}
    for name in os.listdir(d.path('scripts')):
        if name.split('.')[0].split('_')[0] == label:
            out.update({c: l for l, c in re.findall(r'dw_const (\w+),\s*(TEXT_\w+)', asm('scripts', name))})
    return out


def map_scripts(label):
    return '\n'.join(asm('scripts', n) for n in sorted(os.listdir(d.path('scripts'))) if n.split('.')[0].split('_')[0] == label)


# Regalos que el juego da tras elegir (no con un GivePokemon fijo) y Pikachu, que
# Oak entrega con su propia rutina. Mapa -> [(especie, nivel)].
CHOICE_GIFTS = {'OAKS_LAB': [('PIKACHU', 5)], 'FIGHTING_DOJO': [('HITMONLEE', 30), ('HITMONCHAN', 30)],
                'CINNABAR_LAB_FOSSIL_ROOM': [('OMANYTE', 30), ('KABUTO', 30), ('AERODACTYL', 30)]}
# Premios del Casino de Azulona (data/events/prizes.asm, en Yellow).
PRIZE_ROOM = 'GAME_CORNER_PRIZE_ROOM'


def main():
    maps, consts = d.maps(), d.map_consts()
    by_const = {m['const']: m for m in consts}
    numbers, names = dex_numbers(), species_names()
    items = load_items()
    class_name, parties = load_trainers(numbers, names)
    sprite_files = load_sprites()
    frames = {s: sprite_frame(p) for s, p in sprite_files.items()}
    outdoor_names, indoor_names = zone_names()
    wild = wild_tables(consts)
    grass = grass_tiles()
    marts = mart_texts()
    trades = re.findall(r'npctrade (\w+),\s*(\w+),', asm('data/events/trades.asm'))
    trade_ids = re.findall(r'const (TRADE_FOR_\w+)', asm('constants/script_constants.asm')) if os.path.exists(d.path('constants/script_constants.asm')) else []

    shutil.rmtree(OUT_IMG, ignore_errors=True)
    shutil.rmtree(ICONS, ignore_errors=True)
    shutil.rmtree(OUT_SPRITES, ignore_errors=True)
    os.makedirs(OUT_IMG)
    os.makedirs(OUT_DATA, exist_ok=True)
    save_mon_images()

    def zone_of(const):
        m = maps[const]
        if not m['indoor']:
            return outdoor_names[m['index']] if m['index'] < len(outdoor_names) else title(const.replace('_', ' '))
        return indoor_names.get(m.get('outside'), title((m.get('outside') or const).replace('_', ' ')))

    objects_of = {c: parse_objects(m['label']) for c, m in maps.items()}

    # Kanto: exteriores unidos, con sus personajes y objetos pintados.
    kanto = place_kanto(maps)
    w = max(x + maps[c]['width'] for c, (x, y) in kanto.items())
    h = max(y + maps[c]['height'] for c, (x, y) in kanto.items())
    region = Image.new('RGB', (w * d.BLOCK, h * d.BLOCK), (8, 8, 12))
    for c, (x, y) in kanto.items():
        img = draw_objects(d.render(maps[c]), objects_of[c][1], frames, d.palette_of(maps[c]))
        region.paste(img, (x * d.BLOCK, y * d.BLOCK))
    region.save(f'{OUT_IMG}/kanto.png', optimize=True)
    areas = [{'id': 'kanto', 'kind': 'region', 'label': 'Kanto', 'image': '/yellow/areas/kanto.png', 'width': region.width, 'height': region.height}]
    where = {c: ('kanto', x * 2, y * 2) for c, (x, y) in kanto.items()}

    # Interiores: uno por mapa, agrupados por zona. Los mapas sin salida desde el
    # juego normal (sin usar, sala del cable) se saltan.
    reachable = {dest for ws, _ in objects_of.values() for _, _, dest, _ in ws}
    floor_of = {}
    for c, m in maps.items():
        if c in where or c not in reachable or c.startswith(('UNUSED', 'TRADE_CENTER', 'COLOSSEUM')):
            continue
        zone = zone_of(c)
        label = map_label(m['label'], zone)
        img = draw_objects(d.render(m), objects_of[c][1], frames, d.palette_of(m))
        rel = f'{slug(zone)}/{slug(m["label"])}.png'
        os.makedirs(os.path.dirname(f'{OUT_IMG}/{rel}'), exist_ok=True)
        img.save(f'{OUT_IMG}/{rel}', optimize=True)
        areas.append({'id': c, 'kind': 'interior', 'zone': zone, 'label': label, 'image': f'/yellow/areas/{rel}', 'width': img.width, 'height': img.height})
        where[c] = (c, 0, 0)
        floor_of[c] = label

    def at(c, x, y):
        area, ox, oy = where[c]
        return area, [(ox + x) * STEP + STEP // 2, (oy + y) * STEP + STEP // 2]

    def location(c):
        return floor_of.get(c, zone_of(c))

    # Lugares de Kanto: cada zona exterior, en el centro de sus mapas.
    places = {}
    for c, (x, y) in kanto.items():
        p = places.setdefault(zone_of(c), {'name': zone_of(c), 'area': 'kanto', 'pts': []})
        p['pts'].append(((x + maps[c]['width'] / 2) * d.BLOCK, (y + maps[c]['height'] / 2) * d.BLOCK))
    places = [{'name': p['name'], 'area': p['area'], 'at': [round(sum(q[0] for q in p['pts']) / len(p['pts'])), round(sum(q[1] for q in p['pts']) / len(p['pts']))]}
              for p in places.values()]

    markers, placed = [], set()

    # En Gen 1 los objetos no tienen icono: todos son la Poke Ball del mapa.
    def item_icon(_const):
        return sprite_icon('SPRITE_POKE_BALL')

    def sprite_icon(sprite):
        f = frames.get(sprite)
        if f is None:
            return None
        rel = f'yellow/npc/{slug(sprite.removeprefix("SPRITE_"))}.png'
        if not os.path.exists(f'public/icons/{rel}'):
            os.makedirs(os.path.dirname(f'public/icons/{rel}'), exist_ok=True)
            rgba = np.zeros((16, 16, 4), dtype=np.uint8)
            shades = np.array([(255, 255, 255, 0), (170, 170, 170, 255), (85, 85, 85, 255), (16, 16, 16, 255)], dtype=np.uint8)
            rgba[:] = shades[f]
            Image.fromarray(rgba, 'RGBA').save(f'public/icons/{rel}', optimize=True)
        return rel

    def add(c, category, name, x, y, key=None, icon=None, detail=None, encounter=None, catch=None, once=False):
        kind = 'item' if category in ('Item In Map', 'Hidden Item', 'Item Gift') else category
        tag = (c, kind, name)
        if (once or category == 'Item Gift') and tag in placed:
            return
        placed.add(tag)
        area, px = at(c, x, y)
        mid = f'{c}:{key or category}:{x},{y}'
        mk = {'id': mid, 'uid': uid_of(f'yellow:catch:{catch}' if catch else f'yellow:{mid}'), 'category': category, 'name': name,
              'location': location(c), 'area': area, 'at': px, 'map': c, 'zone': zone_of(c), 'icon': icon}
        if c in floor_of:
            mk['floor'] = floor_of[c]
        if detail:
            mk['detail'] = detail
        if encounter:
            mk['encounter'] = {**encounter, 'zone': location(c)}
        markers.append(mk)

    def mon(sp):
        return names[numbers[sp]]

    def mon_icon(sp):
        return f'yellow/pokemon/p{numbers[sp]}.png'

    warps, encounter_zones = [], defaultdict(dict)
    for c, m in maps.items():
        if c not in where:
            continue
        ws, objs = objects_of[c]
        texts = text_labels(m['label'])
        script = map_scripts(m['label'])
        for o in objs:
            x, y, args = o['x'], o['y'], o['args']
            if args and args[0].startswith('OPP_'):
                cls, n = args[0].removeprefix('OPP_'), int(args[1]) if len(args) > 1 else 1
                add(c, 'Battle', class_name.get(cls, title(cls.replace('_', ' '))), x, y, icon=sprite_icon(o['sprite']),
                    detail=parties.get((cls, n)))
            elif args and args[0] in numbers and len(args) > 1:
                sp, lv = args[0], int(args[1])
                add(c, 'Pokémon', mon(sp), x, y, key=f'static:{sp}', catch=sp, icon=mon_icon(sp),
                    encounter={'min': lv, 'max': lv, 'chance': 100, 'methods': ['Static encounter'], 'sprite': SPRITE.format(numbers[sp])})
            elif args and args[0] in items:
                add(c, 'Item In Map', items[args[0]], x, y, icon=item_icon(args[0]))
            elif o['sprite'] == 'SPRITE_BOULDER':
                add(c, 'Obstacle', 'Strength boulder', x, y, icon=sprite_icon('SPRITE_BOULDER'))
            else:
                label = texts.get(o['text'])
                if label in marts:
                    sold = ', '.join(items[i] for i in marts[label] if i in items)
                    add(c, 'Shop', 'Poké Mart', x, y, icon=sprite_icon(o['sprite']), detail=f'Sells {sold}')

        # Regalos, intercambios y combates que da el script del mapa. Van sobre el
        # personaje que los da si se sabe, o en el centro del mapa.
        cx, cy = m['width'], m['height']
        for sp, lv in re.findall(r'lb bc, (\w+), (\d+)\n(?:[^\n]*\n){0,3}?\s*call GivePokemon', script):
            if sp in numbers:
                add(c, 'In-Game Gift Pokémon', mon(sp), cx, cy, key=f'gift:{sp}', icon=mon_icon(sp), detail=f'Lv{lv}', once=True)
        for sp, lv in CHOICE_GIFTS.get(c, []):
            add(c, 'In-Game Gift Pokémon', mon(sp), cx, cy, key=f'gift:{sp}', icon=mon_icon(sp), detail=f'Lv{lv}', once=True)
        for it, q in re.findall(r'lb bc, (\w+), (\d+)\n(?:[^\n]*\n){0,3}?\s*call GiveItem', script):
            if it in items:
                add(c, 'Item Gift', items[it] + (f' ×{q}' if int(q) > 1 else ''), cx, cy, key=f'gift:{it}', icon=item_icon(it))
        for tid in re.findall(r'ld a, (TRADE_FOR_\w+)', script):
            if tid in trade_ids and trade_ids.index(tid) < len(trades):
                give, get = trades[trade_ids.index(tid)]
                add(c, 'In-Game Trade', mon(get), cx, cy, key=f'trade:{get}', icon=mon_icon(get), detail=f'Trade your {mon(give)}', once=True)
        # Pokemon fijos que lanza el guion (Snorlax): van sobre su sprite.
        for sp, lv in re.findall(r'ld a, (\w+)\n\s*ld \[wCurOpponent\], a\n\s*ld a, (\d+)\n\s*ld \[wCurEnemyLevel\], a', script):
            if sp in numbers:
                body = next((o for o in objs if o['sprite'] == f'SPRITE_{sp}'), None)
                px, py = (body['x'], body['y']) if body else (cx, cy)
                add(c, 'Pokémon', mon(sp), px, py, key=f'static:{sp}', catch=sp, icon=mon_icon(sp),
                    encounter={'min': int(lv), 'max': int(lv), 'chance': 100, 'methods': ['Static encounter'], 'sprite': SPRITE.format(numbers[sp])})
        for cls, n in re.findall(r'ld a, OPP_(\w+)\n\s*ld \[wCurOpponent\], a\n(?:[^\n]*\n){0,4}?\s*ld a, (\d+)\n\s*ld \[wTrainerNo\], a', script):
            rival = next((o for o in objs if o['sprite'] in ('SPRITE_BLUE', 'SPRITE_ROCKET', 'SPRITE_JESSIE', 'SPRITE_JAMES')), None)
            px, py = (rival['x'], rival['y']) if rival else (cx, cy)
            add(c, 'Battle', class_name.get(cls, title(cls)), px, py, key=f'scene:{cls}:{n}', detail=parties.get((cls, int(n))),
                icon=sprite_icon(rival['sprite']) if rival else None, once=False)

        # Objetos ocultos de este mapa.
        hidden = re.search(rf'hidden_events_for {c}\n(.*?)db -1', asm('data/events/hidden_events.asm'), re.S)
        for hx, hy, kind, what in re.findall(r'hidden_event\s+(\d+),\s*(\d+),\s*(HiddenItems|HiddenCoins),\s*([\w+]+)', hidden.group(1) if hidden else ''):
            if kind == 'HiddenCoins':
                n = int(what.split('+')[1]) if '+' in what else 10
                add(c, 'Hidden Item', f'Coins ×{n}', int(hx), int(hy), icon=item_icon('COIN_CASE'))
            elif what in items:
                add(c, 'Hidden Item', items[what], int(hx), int(hy), icon=item_icon(what))

        # Salvajes: un pin por especie y mapa, sobre la hierba o el agua.
        tables = wild.get(c)
        if tables:
            grid = tile_grid(m)
            center = (m['width'], m['height'])
            land = spot(grid, grass.get(m['tileset'], -1), center)
            water = spot(grid, WATER_TILE, land)
            cave = m['indoor']
            for sp in sorted({s for t in tables.values() for s in t}):
                rows = [(method, t[sp]) for method, t in tables.items() if sp in t]
                methods = ['Cave' if method == 'Grass' and cave else method for method, _ in rows]
                x, y = land if rows[0][0] == 'Grass' else water
                add(c, 'Pokémon', mon(sp), x, y, key=f'wild:{sp}', catch=sp, icon=mon_icon(sp),
                    encounter={'min': min(r[0] for _, r in rows), 'max': max(r[1] for _, r in rows), 'chance': max(r[2] for _, r in rows),
                               'methods': methods, 'sprite': SPRITE.format(numbers[sp])})
                for method, (lo, hi, ch) in rows:
                    n = numbers[sp]
                    e = encounter_zones[zone_of(c)].setdefault(n, {'id': n, 'name': mon(sp), 'sprite': SPRITE.format(n), 'types': [], 'areas': {}})
                    a = e['areas'].setdefault(location(c), {'area': location(c), 'maxChance': 0, 'encounters': []})
                    a['encounters'].append({'chance': ch, 'minLevel': lo, 'maxLevel': hi, 'method': 'Cave' if method == 'Grass' and cave else method})
                    a['maxChance'] = max(a['maxChance'], ch)

        # Puertas y escaleras. LAST_MAP es "el exterior del que viniste": el mapa
        # que tiene una puerta hacia este.
        for wx, wy, dest, n in ws:
            if dest == 'LAST_MAP':
                dest = next((o for o, (ows, _) in objects_of.items() if o in where and o != c and any(t == c for _, _, t, _ in ows)), None)
            if not dest or dest not in where:
                continue
            targets = objects_of[dest][0]
            if not 1 <= n <= len(targets):
                continue
            src_area, src = at(c, wx, wy)
            dst_area, dst = at(dest, targets[n - 1][0], targets[n - 1][1])
            if src_area != dst_area:
                warps.append({'area': src_area, 'at': src, 'to': dst_area, 'toAt': dst})

    # Premios del Casino (se compran con fichas: cuentan como regalo).
    prizes = asm('data/events/prizes.asm')
    for sp in dict.fromkeys(re.findall(r'\b([A-Z_]+)\b', prizes)):
        if sp in numbers and PRIZE_ROOM in where:
            add(PRIZE_ROOM, 'In-Game Gift Pokémon', mon(sp), maps[PRIZE_ROOM]['width'], maps[PRIZE_ROOM]['height'], key=f'prize:{sp}',
                icon=mon_icon(sp), detail='Game Corner prize', once=True)

    merged = []
    for w in warps:
        near = next((o for o in merged if o['area'] == w['area'] and o['to'] == w['to'] and abs(o['at'][0] - w['at'][0]) <= 2 * STEP and abs(o['at'][1] - w['at'][1]) <= STEP), None)
        if not near:
            merged.append(w)

    ids = [mk['id'] for mk in markers]
    assert len(set(ids)) == len(ids), 'ids de marcador repetidos'

    dump = lambda name, value: json.dump(value, open(f'{OUT_DATA}/{name}', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    dump('areas.json', {'areas': areas, 'warps': merged, 'places': places})
    dump('markers.json', markers)
    dump('encounters.json', {'zones': [{'name': z, 'pokemon': [{**e, 'areas': list(e['areas'].values())} for e in sorted(mons.values(), key=lambda e: e['id'])]}
                                       for z, mons in encounter_zones.items()]})
    dump('checklist.json', build_checklist(markers, areas))

    counts = defaultdict(int)
    for mk in markers:
        counts[mk['category']] += 1
    print(f'{len(areas)} areas, {len(merged)} warps, {len(places)} lugares, {len(markers)} marcadores:', dict(counts))


# --- Checklist -------------------------------------------------------------------------

PARTS = [
    ('Pallet Town', ['Pallet Town']),
    ('Route 1 → Viridian City', ['Route 1', 'Viridian City', 'Route 22', 'Route 2']),
    ('Viridian Forest → Pewter City', ['Viridian Forest', 'Pewter City']),
    ('Route 3 → Mt. Moon → Route 4', ['Route 3', 'Mt. Moon', 'Route 4']),
    ('Cerulean City → Nugget Bridge', ['Cerulean City', 'Route 24', 'Route 25']),
    ('Route 5 → Vermilion City', ['Route 5', 'Underground Path', 'Route 6', 'Vermilion City', 'S.S. Anne']),
    ("Route 11 → Diglett's Cave", ['Route 11', "Diglett's Cave"]),
    ('Route 9 → Rock Tunnel', ['Route 9', 'Route 10', 'Rock Tunnel', 'Power Plant']),
    ('Lavender Town → Celadon City', ['Lavender Town', 'Route 8', 'Route 7', 'Celadon City', 'Rocket Hideout']),
    ('Pokémon Tower', ['Pokémon Tower']),
    ('Saffron City → Silph Co.', ['Saffron City', 'Silph Co.']),
    ('Route 12 → Fuchsia City', ['Route 12', 'Route 13', 'Route 14', 'Route 15', 'Route 16', 'Route 17', 'Route 18',
                                 'Fuchsia City', 'Safari Zone']),
    ('Route 19 → Cinnabar Island', ['Route 19', 'Route 20', 'Seafoam Islands', 'Cinnabar Island', 'Pokémon Mansion', 'Route 21']),
    ('Victory Road → Indigo Plateau', ['Route 23', 'Victory Road', 'Indigo Plateau', 'Pokémon League']),
    ('Post-game', ['Cerulean Cave']),
]
CHECKLIST = {'Pokémon', 'Item In Map', 'Hidden Item', 'Item Gift', 'In-Game Trade', 'In-Game Gift Pokémon', 'Battle'}


def build_checklist(markers, areas):
    listed = [mk for mk in markers if mk['category'] in CHECKLIST]
    zones_used = {mk['zone'] for mk in listed}
    order = [(i + 1, z) for i, (_, zs) in enumerate(PARTS) for z in zs]
    known = {z for _, z in order}
    extra = sorted(zones_used - known)
    parts = [{'n': i + 1, 'title': t} for i, (t, _) in enumerate(PARTS)]
    if extra:
        parts.append({'n': len(parts) + 1, 'title': 'Other areas'})
        order += [(len(parts), z) for z in extra]
    floors = defaultdict(list)
    for a in areas:
        if a['kind'] == 'interior' and a['label'] != a['zone'] and a['label'] not in floors[a['zone']]:
            floors[a['zone']].append(a['label'])
    zones = [{'name': z, 'part': n, 'count': sum(mk['zone'] == z for mk in listed),
              'floors': [f for f in floors.get(z, []) if any(mk.get('floor') == f and mk['zone'] == z for mk in listed)]}
             for n, z in order if z in zones_used]
    return {'source': 'https://github.com/pret/pokeyellow', 'note': 'Area order follows the story of Pokémon Yellow.',
            'parts': parts, 'zones': zones,
            'markers': {mk['id']: {'zone': mk['zone'], **({'floor': mk['floor']} if mk.get('floor') and mk['floor'] != mk['zone'] else {})} for mk in listed}}


if __name__ == '__main__':
    main()
