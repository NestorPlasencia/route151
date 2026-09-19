"""Genera los mapas y marcadores de FireRed/LeafGreen desde pret/pokefirered.

Cada area es una imagen (terreno y objetos: personas, Poke Balls, rocas):
- regiones: los exteriores unidos por sus conexiones (Kanto; las Islas Sete
  como grupos de islas colocados en filas);
- interiores: cada mapa suelto (casas, cuevas, pisos), agrupado por zona segun
  su seccion del mapa de region (todas las plantas de Mt. Moon juntas).

Los marcadores (objetos, objetos ocultos, entrenadores, obstaculos) y los warps
(puertas y escaleras) salen de los map.json con coordenadas exactas por
casilla, pasadas a pixeles locales del area donde se ven.

Uso:  python scripts/frlg/sync-decomp.py && python scripts/frlg/build-frlg.py
Salida: public/frlg/areas/**.png, public/icons/frlg/** y public/frlg/data/
        (areas, markers, encounters-<version> y checklist)
"""
import json, os, re, shutil, sys, unicodedata
from collections import defaultdict
from functools import lru_cache

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
import decomp as d

OUT_IMG = 'public/frlg/areas'
OUT_DATA = 'public/frlg/data'
B = d.BLOCK

# Mapas que no son del juego normal (prototipos y casas sin usar, salas del cable link).
SKIP = re.compile(r'MAP_(PROTOTYPE_|BATTLE_COLOSSEUM|TRADE_CENTER|RECORD_CORNER|UNION_ROOM|UNKNOWN_MAP|BATTLE_TOWER|\w*UNUSED)')
# Azafran: las rutas conectan con una copia de 48x40 bloques; la ciudad real
# (66x55) es esa copia con margen, desplazada (10, 7) bloques. La copia se
# dibuja; los marcadores y warps salen de la ciudad real.
ALIAS = {'MAP_SAFFRON_CITY': ('MAP_SAFFRON_CITY_CONNECTION', 10, 7)}
# Grupos de exteriores de cada region, en el orden en que se colocan. Cada
# fila de las Islas Sete va de izquierda a derecha.
REGIONS = [
    ('kanto', 'Kanto', [['MAP_PALLET_TOWN']]),
    ('sevii', 'Sevii Islands', [
        ['MAP_ONE_ISLAND', 'MAP_TWO_ISLAND', 'MAP_THREE_ISLAND', 'MAP_FOUR_ISLAND'],
        ['MAP_FIVE_ISLAND', 'MAP_SIX_ISLAND', 'MAP_SEVEN_ISLAND'],
    ]),
]
OBSTACLES = {'OBJ_EVENT_GFX_ROCK_SMASH_ROCK': 'Rock Smash rock',
             'OBJ_EVENT_GFX_PUSHABLE_BOULDER': 'Strength boulder',
             'OBJ_EVENT_GFX_CUT_TREE': 'Cut tree'}
COPIES = {target for target, _, _ in ALIAS.values()}
GAP = 12  # bloques entre grupos de islas


def slug(s):
    """'Pokémon Tower' -> 'pokemon-tower'."""
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')


# Palabras que no siguen la regla de mayuscula inicial.
WORDS = {'Tm': 'TM', 'Hm': 'HM', 'Pp': 'PP', 'Hp': 'HP', 'Ss': 'S.S.', 'S.s.': 'S.S.', 'Mr': 'Mr.', 'Exp.': 'Exp.'}
SPECIES = {'Mr Mime': 'Mr. Mime', 'Nidoran F': 'Nidoran♀', 'Nidoran M': 'Nidoran♂', 'Farfetchd': "Farfetch'd", 'Ho Oh': 'Ho-Oh'}


def title(s):
    """'POKé BALL' -> 'Poké Ball'; 'MT. MOON' -> 'Mt. Moon'; 'TM36' -> 'TM36'."""
    s = s.encode('latin-1', 'ignore').decode('utf-8', 'ignore') if 'Ã' in s else s
    words = [w[:1].upper() + w[1:].lower() for w in s.split(' ')]
    words = [WORDS.get(w, re.sub(r'^(Tm|Hm)(\d+)$', lambda m: m.group(1).upper() + m.group(2), w)) for w in words]
    return ' '.join(words)


def species(c):
    """MR_MIME -> 'Mr. Mime'."""
    name = title(c.replace('_', ' '))
    return SPECIES.get(name, name)


def map_label(name, zone):
    """'CeruleanCave_B1F' en la zona 'Cerulean Cave' -> 'B1F';
    'PalletTown_ProfessorOaksLab' -> "Professor Oak's Lab"."""
    words = re.sub(r'(?<=[a-z])(?=[A-Z0-9])|(?<=[0-9])(?=[A-Z][a-z])|_', ' ', name).split()
    # Las zonas de las Islas Sete ('Lost Cave') no llevan la isla delante.
    if len(words) > 2 and words[1] == 'Island' and not zone.endswith('Island'):
        words = words[2:]
    words = ['Pokémon' if w == 'Pokemon' else w for w in words]
    label = ' '.join(words).replace('Oaks ', "Oak's ").replace('Players ', "Player's ").replace('Rivals ', "Rival's ").replace('Loreleis ', "Lorelei's ")
    # Quita la zona del principio: comparando sin tildes, puntuacion ni mayusculas.
    key = lambda s: slug(s).replace('-', '')
    for i in range(len(words), 0, -1):
        if key(' '.join(words[:i])) == key(zone) and i < len(words):
            return ' '.join(label.split()[i:])
    return label


def const_name(c, prefix):
    """TRAINER_CLASS_BUG_CATCHER -> 'Bug Catcher'."""
    return title(c.removeprefix(prefix).replace('_', ' '))


def layout_size(map_id):
    l = d.layouts()[d.maps()[map_id]['layout']]
    return l['width'], l['height']


def offset_to(a, b):
    """Desplazamiento (en bloques) de `b` respecto de `a` segun la conexion a -> b."""
    for c in d.maps()[a].get('connections') or []:
        if c['map'] == b:
            (aw, ah), (bw, bh), o = layout_size(a), layout_size(b), c['offset']
            return {'up': (o, -bh), 'down': (o, ah), 'left': (-bw, o), 'right': (aw, o)}[c['direction']]
    return None


def consistent(a, b):
    """La conexion a -> b coincide con la de vuelta b -> a (si la hay). No siempre:
    la Ruta 6 pone a Azafran con desfase 0 y Azafran a la Ruta 6 con 12; el juego
    solo dibuja vecinos y no se nota, pero en un mapa global descuadra Kanto."""
    there, back = offset_to(a, b), offset_to(b, a)
    return back is None or (there[0] + back[0], there[1] + back[1]) == (0, 0)


def place_group(start):
    """Posicion (en bloques) de cada mapa conectado a `start`. Las conexiones que
    se contradicen con su vuelta se ignoran: esos mapas se colocan por sus otros
    vecinos, que si cuadran (asi Kanto encaja sin solapes)."""
    maps = d.maps()
    pos, queue = {start: (0, 0)}, [start]
    while queue:
        a = queue.pop()
        for c in maps[a].get('connections') or []:
            b = c['map']
            if b in pos or b not in maps or b in ALIAS or SKIP.match(b) or not consistent(a, b):
                continue
            dx, dy = offset_to(a, b)
            pos[b] = (pos[a][0] + dx, pos[a][1] + dy)
            queue.append(b)
    check_group(pos)
    x0, y0 = min(p[0] for p in pos.values()), min(p[1] for p in pos.values())
    return {m: (x - x0, y - y0) for m, (x, y) in pos.items()}


def check_group(pos):
    """Avisa de uniones que no cuadran o mapas que se pisan en la region armada."""
    for a in pos:
        for c in d.maps()[a].get('connections') or []:
            b = c['map']
            if b in pos and consistent(a, b):
                dx, dy = offset_to(a, b)
                if (pos[a][0] + dx, pos[a][1] + dy) != pos[b]:
                    print(f'aviso: {a} -> {b} no cuadra en el mapa global')
    items = [(m, *pos[m], *layout_size(m)) for m in pos]
    for i, (a, ax, ay, aw, ah) in enumerate(items):
        for b, bx, by, bw, bh in items[i + 1:]:
            if min(ax + aw, bx + bw) > max(ax, bx) and min(ay + ah, by + bh) > max(ay, by):
                print(f'aviso: {a} y {b} se solapan')


def group_size(group):
    return (max(x + layout_size(m)[0] for m, (x, y) in group.items()),
            max(y + layout_size(m)[1] for m, (x, y) in group.items()))


def build_regions():
    """region -> {'maps': {MAP: (x, y)}, 'size': (w, h)} en bloques."""
    out = {}
    for rid, label, rows in REGIONS:
        placed, y = {}, 0
        for row in rows:
            x, row_h = 0, 0
            for start in row:
                group = place_group(start)
                gw, gh = group_size(group)
                placed.update({m: (x + gx, y + gy) for m, (gx, gy) in group.items()})
                x, row_h = x + gw + GAP, max(row_h, gh)
            y += row_h + GAP
        out[rid] = {'label': label, 'maps': placed, 'size': group_size(placed)}
    return out


def render_region(region):
    """Terreno de todos los mapas y, despues, sus objetos: asi un sprite en el
    borde entre dos mapas no queda tapado por el vecino."""
    w, h = region['size']
    img = Image.new('RGBA', (w * B, h * B))
    for m, (x, y) in region['maps'].items():
        img.paste(d.render_layout(d.maps()[m]['layout']), (x * B, y * B))
    for m, (x, y) in region['maps'].items():
        if m in COPIES:
            real, (dx, dy) = next((a, (t[1], t[2])) for a, t in ALIAS.items() if t[0] == m)
            d.draw_objects(img, real, (x - dx, y - dy))
        else:
            d.draw_objects(img, m, (x, y))
    return img


# --- Nombres del juego ---------------------------------------------------------

@lru_cache(None)
def load_items():
    items = json.load(open(d.path('src/data/items.json'), encoding='utf-8'))['items']
    return {i['itemId']: {'name': title(i['english']), 'pocket': i['pocket']} for i in items}


@lru_cache(None)
def load_trainers():
    """TRAINER_X -> {'name', 'class', 'party': [(especie, nivel)]}."""
    text = open(d.path('src/data/trainers.h'), encoding='utf-8').read()
    parties_text = open(d.path('src/data/trainer_parties.h'), encoding='utf-8').read()
    parties = {}
    for name, body in re.findall(r'(sParty_\w+)\[\] = \{(.*?)\n\};', parties_text, re.S):
        mons = re.findall(r'\.lvl = (\d+),\s*\.species = SPECIES_(\w+)', body)
        parties[name] = [(species(s), int(l)) for l, s in mons]
    out = {}
    for tid, body in re.findall(r'\[(TRAINER_\w+)\] = \{(.*?)\n    \},', text, re.S):
        cls = re.search(r'\.trainerClass = (\w+)', body)
        if not cls:  # TRAINER_NONE
            continue
        cls = cls.group(1)
        name = re.search(r'\.trainerName = _\("([^"]*)"\)', body).group(1)
        party = re.search(r'\((sParty_\w+)\)', body)
        cls_name = const_name(cls, 'TRAINER_CLASS_')
        if cls_name.startswith('Rival') or cls_name == 'Champion':
            # El rival se llama como lo nombre el jugador; Terry es el de fabrica.
            cls_name, name = ('Rival' if cls_name.startswith('Rival') else 'Champion'), ''
        out[tid] = {'name': title(name), 'class': cls_name,
                    'party': parties.get(party.group(1), []) if party else []}
    return out


def script_blocks(text):
    """Etiqueta:: -> cuerpo hasta la siguiente etiqueta."""
    parts = re.split(r'^(\w+)::\s*$', text, flags=re.M)
    return {parts[i]: parts[i + 1] for i in range(1, len(parts) - 1, 2)}


def load_scripts(version):
    """Todas las etiquetas de script de esa version ('FIRERED' o 'LEAFGREEN'):
    las de cada mapa y las comunes de data/scripts (ahi estan los entrenadores
    de ruta y las Poke Balls)."""
    files = [d.path('data/scripts', f) for f in os.listdir(d.path('data/scripts')) if f.endswith('.inc')]
    files += [d.path('data/maps', m['dir'], 'scripts.inc') for m in d.maps().values()]
    blocks = {}
    for f in files:
        if os.path.exists(f):
            blocks.update(script_blocks(d.version_text(open(f, encoding='utf-8').read(), version)))
    return blocks


REACHED = set()  # etiquetas ya alcanzadas desde un personaje, casilla o cartel


def follow(scripts, label, depth=5, track=True):
    """Cuerpo del script mas los de las etiquetas a las que salta (goto, call)
    dentro del mismo mapa: el combate del Alto Mando esta tras un goto_if y los
    premios del Casino, cinco saltos mas alla del empleado."""
    prefix = label.split('_EventScript_')[0] + '_EventScript_'
    seen, frontier, body = {label}, [label], ''
    for _ in range(depth + 1):
        nxt = []
        for l in frontier:
            text = scripts.get(l, '')
            body += text
            if track:
                REACHED.add(l)
            for ref in re.findall(r'\b(' + re.escape(prefix) + r'\w+)', text):
                if ref not in seen:
                    seen.add(ref)
                    nxt.append(ref)
        frontier = nxt
    return body


# --- Areas, marcadores y warps --------------------------------------------------

VERSIONS = {'firered': 'FIRERED', 'leafgreen': 'LEAFGREEN'}
# Metodos de encuentro con el nombre que muestra la app.
METHODS = {'land_mons': 'Grass', 'water_mons': 'Surf', 'rock_smash_mons': 'Rock Smash',
           'old_rod': 'Old Rod', 'good_rod': 'Good Rod', 'super_rod': 'Super Rod'}
ICONS = 'public/icons/frlg'


def uid_of(text):
    """Numero estable para guardar el progreso (FNV-1a de 31 bits del id)."""
    h = 2166136261
    for b in text.encode('utf-8'):
        h = ((h ^ b) * 16777619) & 0xFFFFFFFF
    return h & 0x7FFFFFFF


def load_trades(version):
    """INGAME_TRADE_X -> (especie que te dan, especie que piden) en esa version."""
    text = d.version_text(open(d.path('src/data/ingame_trades.h'), encoding='utf-8').read(), version)
    out = {}
    for tid, body in re.findall(r'\[(INGAME_TRADE_\w+)\]\s*=\s*\{(.*?)\n    \}', text, re.S):
        got, wanted = re.search(r'\.species = (SPECIES_\w+)', body), re.search(r'\.requestedSpecies = (SPECIES_\w+)', body)
        if got and wanted:
            out[tid] = (got.group(1), wanted.group(1))
    return out


def wild_tables():
    """version -> MAP -> metodo -> especie -> {'min', 'max', 'chance'}."""
    data = json.load(open(d.path('src/data/wild_encounters.json'), encoding='utf-8'))['wild_encounter_groups'][0]
    fields = {f['type']: f for f in data['fields']}
    out = {v: defaultdict(dict) for v in VERSIONS}
    for enc in data['encounters']:
        version = 'firered' if enc['base_label'].endswith('_FireRed') else 'leafgreen'
        for field, info in fields.items():
            if field not in enc:
                continue
            mons, rates = enc[field]['mons'], info['encounter_rates']
            groups = info.get('groups') or {field: list(range(len(rates)))}
            for group, slots in groups.items():
                table = {}
                for i in slots:
                    mon = mons[i]
                    t = table.setdefault(mon['species'], {'min': mon['min_level'], 'max': mon['max_level'], 'chance': 0})
                    t['min'], t['max'] = min(t['min'], mon['min_level']), max(t['max'], mon['max_level'])
                    t['chance'] += rates[i]
                out[version][enc['map']][METHODS[group]] = table
    return out


def spot(grid, kind, fallback):
    """Casilla de ese tipo de encuentro mas cercana al centro de todas ellas:
    siempre cae sobre hierba o agua real, aunque la zona tenga forma de L."""
    ys, xs = np.nonzero(grid == kind)
    if not len(xs):
        return fallback
    cx, cy = xs.mean(), ys.mean()
    i = int(np.argmin((xs - cx) ** 2 + (ys - cy) ** 2))
    return int(xs[i]), int(ys[i])


def save_icon(img, rel):
    """Guarda un icono en public/icons/<rel> y devuelve <rel> (como en Yellow)."""
    if img is None:
        return None
    os.makedirs(os.path.dirname(f'public/icons/{rel}'), exist_ok=True)
    if not os.path.exists(f'public/icons/{rel}'):
        img.save(f'public/icons/{rel}', optimize=True)
    return rel


def item_icon(item):
    return save_icon(d.item_icon(item), f'frlg/item/{slug(item.removeprefix("ITEM_"))}.png')


def npc_icon(gfx):
    return save_icon(d.object_sprite(gfx, 'down'), f'frlg/npc/{slug(gfx.removeprefix("OBJ_EVENT_GFX_"))}.png')


SPRITE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/{}.png'


def mon_icon(n):
    # Mismas figuritas que Yellow (public/icons/pokemon); las que faltan las
    # descarga build-frlg-dex.py.
    return f'pokemon/p{n}.png'


def gifts(body):
    """Pokemon que regala un script: 'givemon SPECIES_X, 5' o por variable
    ('setvar VAR_TEMP_1, SPECIES_HITMONLEE' ... 'givemon VAR_TEMP_1, 25'), como
    los iniciales, los Hitmon del Dojo o los premios del Casino."""
    out = []
    by_var = defaultdict(set)
    for arg, lv in re.findall(r'givemon (\w+), (\w+)', body):
        if arg.startswith('SPECIES_'):
            out.append((arg, int(lv) if lv.isdigit() else None))
        else:
            by_var[arg].add(lv)
    # Por variable: si la misma variable da varias especies con niveles
    # distintos (premios del Casino) no se sabe cual es cual; sin nivel.
    for var, lvs in by_var.items():
        lv = int(next(iter(lvs))) if len(lvs) == 1 and next(iter(lvs)).isdigit() else None
        out += [(sp, lv) for sp in re.findall(r'setvar ' + re.escape(var) + r', (SPECIES_\w+)', body)]
    return list(dict.fromkeys(out))


def given_items(body):
    """Objetos que da un script, en orden y sin repetir: 'finditem ITEM_X',
    'giveitem ITEM_X', 'additem ITEM_X' y 'giveitem_msg <texto>, ITEM_X'."""
    found = re.findall(r'\b(?:finditem|giveitem|additem) (ITEM_\w+)|\bgiveitem_msg \w+, (ITEM_\w+)', body)
    return list(dict.fromkeys(a or b for a, b in found))


def prize_items(body):
    """Objetos que se dan por variable ('setvar VAR_TEMP_1, ITEM_TM13' ...
    'giveitem VAR_TEMP_1'): los premios del Casino."""
    out = []
    for var in dict.fromkeys(re.findall(r'\b(?:giveitem|additem) (VAR_\w+)', body)):
        out += re.findall(r'setvar ' + re.escape(var) + r', (ITEM_\w+)', body)
    return list(dict.fromkeys(out))


def shop_items(body, scripts):
    """Lo que vende una tienda: las listas de 'pokemart <etiqueta>' (.2byte ITEM_X)."""
    out = []
    for label in re.findall(r'pokemart (\w+)', body):
        out += [i for i in re.findall(r'\.2byte (ITEM_\w+)', scripts.get(label, '')) if i != 'ITEM_NONE']
    return list(dict.fromkeys(out))


def classify(o, body, trades, scripts):
    """Marcadores de un objeto: [(categoria, nombre, extras)]. Un mismo personaje
    puede dar varios: un lider de gimnasio es un combate y regala una MT."""
    items, trainers, numbers = load_items(), load_trainers(), d.species_numbers()
    gfx = o.get('graphics_id', '')
    battle = re.search(r'trainerbattle_\w+ (TRAINER_\w+)', body)
    static = re.search(r'setwildbattle (SPECIES_\w+), (\d+)', body)
    trade = re.search(r'setvar VAR_0x8008, (INGAME_TRADE_\w+)', body)
    mon = lambda sp: species(sp.removeprefix('SPECIES_'))
    given = [i for i in given_items(body) if i in items and i != 'ITEM_NONE']
    # Poke Ball del suelo: su unico objeto.
    if gfx == 'OBJ_EVENT_GFX_ITEM_BALL' and given and not gifts(body) and not static:
        return [('Item In Map', items[given[0]]['name'], {'icon': item_icon(given[0])})]
    out = []
    if battle and battle.group(1) in trainers:
        t = trainers[battle.group(1)]
        party = ', '.join(f'{s} Lv{l}' for s, l in t['party'])
        out.append(('Battle', f'{t["class"]} {t["name"]}'.strip(), {'icon': npc_icon(gfx), 'detail': party}))
    if trade and trade.group(1) in trades:
        got, wanted = trades[trade.group(1)]
        out.append(('In-Game Trade', mon(got), {'icon': mon_icon(numbers[got]), 'detail': f'Trade your {mon(wanted)}'}))
    out += [('In-Game Gift Pokémon', mon(sp), {'key': f'gift:{sp}', 'icon': mon_icon(numbers[sp]), 'detail': f'Lv. {lv}' if lv else None})
            for sp, lv in gifts(body)]
    if static:
        lv = int(static.group(2))
        out.append(('Pokémon', mon(static.group(1)), {'key': 'static', 'catch': static.group(1), 'icon': mon_icon(numbers[static.group(1)]),
                    'encounter': {'zone': None, 'min': lv, 'max': lv, 'chance': 100, 'methods': ['Static encounter'],
                                  'sprite': SPRITE.format(numbers[static.group(1)])}}))
    out += [('Item Gift', items[i]['name'], {'key': f'gift:{i}', 'icon': item_icon(i)}) for i in given]
    # Por variable: premios del Casino, o canjes (bebidas en la azotea de
    # Azulona, Berry Powder en Celeste).
    prize = 'Game Corner prize' if 'GameCorner' in o.get('script', '') else 'Reward or exchange'
    out += [('Item Gift', items[i]['name'], {'key': f'prize:{i}', 'icon': item_icon(i), 'detail': prize})
            for i in prize_items(body) if i in items and i not in given]
    sold = [items[i]['name'] for i in shop_items(body, scripts) if i in items]
    if sold:
        out.append(('Shop', 'Poké Mart', {'key': 'shop', 'icon': npc_icon(gfx), 'detail': 'Sells ' + ', '.join(sold)}))
    return out


def main():
    maps, regions = d.maps(), build_regions()
    items = load_items()
    mapsecs = {s['id']: title(s['name']) for s in json.load(open(d.path('src/data/region_map/region_map_sections.json'), encoding='utf-8'))['map_sections'] if 'name' in s}
    numbers = d.species_numbers()
    trades = {v: load_trades(tag) for v, tag in VERSIONS.items()}
    scripts = {v: load_scripts(tag) for v, tag in VERSIONS.items()}
    wild = wild_tables()

    shutil.rmtree(OUT_IMG, ignore_errors=True)
    shutil.rmtree(ICONS, ignore_errors=True)
    os.makedirs(OUT_IMG)
    os.makedirs(OUT_DATA, exist_ok=True)

    # Donde se ve cada mapa: (area, desplazamiento en bloques).
    where, areas = {}, []
    for rid, r in regions.items():
        render_region(r).save(f'{OUT_IMG}/{rid}.png', optimize=True)
        w, h = r['size']
        areas.append({'id': rid, 'kind': 'region', 'label': r['label'], 'image': f'/frlg/areas/{rid}.png', 'width': w * B, 'height': h * B})
        for m, (x, y) in r['maps'].items():
            where[m] = (rid, x, y)
    for alias, (target, dx, dy) in ALIAS.items():
        rid, x, y = where[target]
        where[alias] = (rid, x - dx, y - dy)

    # Zona (seccion del mapa de region) y piso de cada mapa: la checklist agrupa
    # por zona, y los interiores de una misma zona son sus pisos.
    zone_of, floor_of = {}, {}
    for m in maps.values():
        mid = m['id']
        zone_of[mid] = mapsecs.get(m['region_map_section'], 'Other')
        if mid in where or SKIP.match(mid):
            continue
        zone = zone_of[mid]
        # Etiqueta completa, como en Yellow ("Silph Co. 7F"); la app acorta las
        # de una misma zona al mostrarlas juntas.
        short = map_label(m['name'], zone)
        label = zone if short == zone else f'{zone} {short}'
        img = d.render_layout(m['layout'])
        d.draw_objects(img, mid)
        rel = f'{slug(zone)}/{slug(m["name"])}.png'
        os.makedirs(os.path.dirname(f'{OUT_IMG}/{rel}'), exist_ok=True)
        img.save(f'{OUT_IMG}/{rel}', optimize=True)
        areas.append({'id': mid, 'kind': 'interior', 'zone': zone, 'label': label, 'image': f'/frlg/areas/{rel}', 'width': img.width, 'height': img.height})
        where[mid] = (mid, 0, 0)
        floor_of[mid] = label

    def at(mid, x, y):
        """Casilla (x, y) del mapa -> (area, centro en pixeles)."""
        area, ox, oy = where[mid]
        return area, [(ox + x) * B + B // 2, (oy + y) * B + B // 2]

    def location(mid):
        return floor_of.get(mid, zone_of[mid])

    # Lugares de cada region (rutas, ciudades): para "ir a" y para nombrar el
    # sitio de una puerta. Varios mapas de una misma zona se funden en uno.
    places = {}
    for mid, (rid, x, y) in where.items():
        if mid in COPIES or rid == mid:
            continue
        w, h = layout_size(mid)
        p = places.setdefault(zone_of[mid], {'name': zone_of[mid], 'area': rid, 'pts': []})
        p['pts'].append(((x + w / 2) * B, (y + h / 2) * B))
    places = [{'name': p['name'], 'area': p['area'], 'at': [round(sum(q[0] for q in p['pts']) / len(p['pts'])), round(sum(q[1] for q in p['pts']) / len(p['pts']))]} for p in places.values()]

    markers, warps = [], []
    encounter_zones = {v: defaultdict(dict) for v in VERSIONS}
    placed = set()  # (mapa, categoria, nombre, version) ya puestos

    # `catch`: especie de un Pokemon salvaje o fijo. Como en Yellow, todos los
    # de una especie comparten uid: atraparlo en un sitio lo completa en todos.
    # `once`: si ya hay uno igual en el mapa no se repite (escenas en varias
    # casillas); los regalos de objetos nunca se repiten en un mismo mapa (Bill
    # sale dos veces en su cabana y da un solo S.S. Ticket).
    def add_to(mid, category, name, x, y, key=None, icon=None, detail=None, encounter=None, version=None, catch=None, once=False):
        kind = 'item' if category in ('Item In Map', 'Hidden Item', 'Item Gift') else category
        tag = (mid, kind, name, version)
        if (once or category == 'Item Gift') and (tag in placed or (mid, kind, name, None) in placed):
            return
        placed.add(tag)
        area, px = at(mid, x, y)
        if encounter:
            encounter = {**encounter, 'zone': encounter['zone'] or location(mid)}
        mid_key = f'{mid}:{key or category}:{x},{y}' + (f':{version}' if version else '')
        mk = {'id': mid_key, 'uid': uid_of(f'catch:{catch}' if catch else mid_key), 'category': category, 'name': name, 'location': location(mid),
              'area': area, 'at': px, 'map': mid, 'zone': zone_of[mid], 'icon': icon}
        if mid in floor_of:
            mk['floor'] = floor_of[mid]
        for k, v in (('detail', detail), ('encounter', encounter), ('version', version)):
            if v:
                mk[k] = v
        markers.append(mk)

    def actor(mid, body):
        """Personaje que protagoniza una escena: el objeto del mapa cuyo LOCALID
        mas se nombra en el script (Celio, el dependiente del Mart, el rival)."""
        objs = [o for o in maps[mid].get('object_events') or [] if o.get('local_id')]
        counts = {o['local_id']: body.count(o['local_id']) for o in objs}
        best = max(objs, key=lambda o: counts[o['local_id']], default=None)
        return best if best and counts[best['local_id']] else None

    def place_scene(mid, label, x=None, y=None, track=True):
        """Combates y regalos de una escena que no dispara un personaje al hablarle.
        Van en la casilla que la dispara o, si no hay (escenas al entrar al mapa),
        sobre su protagonista o en el centro del mapa."""
        found = {}
        for v in VERSIONS:
            body = follow(scripts[v], label, track=track)
            who = actor(mid, body)
            specs = [s for s in classify({'graphics_id': who['graphics_id'] if who else ''}, body, trades[v], scripts[v]) if s[0] in ('Battle', 'Item Gift')]
            found[v] = (specs, who)
        same = found['firered'][0] == found['leafgreen'][0]
        for v in VERSIONS:
            specs, who = found[v]
            px, py = (x, y) if x is not None else (who['x'], who['y']) if who else tuple(n // 2 for n in layout_size(mid))
            for spec in specs:
                extra = {**spec[2], 'key': f'scene:{spec[2].get("key") or spec[1]}'}
                add_to(mid, *spec[:2], px, py, **extra, version=None if same else v, once=True)
            if same:
                break

    for m in maps.values():
        mid = m['id']
        if mid not in where or mid in COPIES:
            continue
        add = lambda *args, mid=mid, **kw: add_to(mid, *args, **kw)

        for o in m.get('object_events') or []:
            gfx, x, y = o.get('graphics_id', ''), o['x'], o['y']
            if gfx in OBSTACLES:
                add('Obstacle', OBSTACLES[gfx], x, y, icon=npc_icon(gfx))
                continue
            # Se clasifica con los scripts de cada version: si coinciden es un
            # solo marcador; si no (premios del Casino, intercambios), uno por version.
            found = {v: classify(o, follow(scripts[v], o.get('script', '')), trades[v], scripts[v]) for v in VERSIONS}
            same = found['firered'] == found['leafgreen']
            for v in VERSIONS:
                for spec in found[v]:
                    add(*spec[:2], x, y, **spec[2], version=None if same else v)
                if same:
                    break
        for b in m.get('bg_events') or []:
            if b.get('type') == 'hidden_item' and b.get('item') in items:
                q = int(b.get('quantity') or 1)
                # ITEM_NONE con cantidad: las monedas escondidas del Casino.
                coins = b['item'] == 'ITEM_NONE'
                name = ('Coins' if coins else items[b['item']]['name']) + (f' ×{q}' if q > 1 else '')
                add('Hidden Item', name, b['x'], b['y'], icon=item_icon('ITEM_COIN_CASE' if coins else b['item']))

        # Casillas que disparan una escena al pisarlas (el rival en Celeste, la Ruta
        # 22...): sus combates y regalos, una vez aunque la escena ocupe varias.
        for c in m.get('coord_events') or []:
            if c.get('script'):
                place_scene(mid, c['script'], c['x'], c['y'])

        # Pokemon salvajes: un pin por especie y mapa, sobre la hierba (o el agua
        # si solo sale surfeando o pescando). Si las dos versiones coinciden es un
        # unico pin; si no, uno por version.
        tables = {v: wild[v].get(mid, {}) for v in VERSIONS}
        if any(tables.values()):
            grid = d.encounter_grid(m['layout'])
            w, h = layout_size(mid)
            land = spot(grid, d.ENCOUNTER_LAND, (w // 2, h // 2))
            water = spot(grid, d.ENCOUNTER_WATER, land)
            rocks = [(o['x'], o['y']) for o in m.get('object_events') or [] if o.get('graphics_id') == 'OBJ_EVENT_GFX_ROCK_SMASH_ROCK']
            where_method = {'Grass': land, 'Surf': water, 'Old Rod': water, 'Good Rod': water, 'Super Rod': water,
                            'Rock Smash': rocks[0] if rocks else land}
            cave = m.get('map_type') == 'MAP_TYPE_UNDERGROUND'

            def summary(v, sp):
                rows = [(method, t[sp]) for method, t in tables[v].items() if sp in t]
                if not rows:
                    return None
                methods = ['Cave' if method == 'Grass' and cave else method for method, _ in rows]
                return {'zone': location(mid), 'min': min(r['min'] for _, r in rows), 'max': max(r['max'] for _, r in rows),
                        'chance': max(r['chance'] for _, r in rows), 'methods': methods, 'first': rows[0][0]}

            for sp in sorted({s for v in VERSIONS for t in tables[v].values() for s in t}):
                per = {v: summary(v, sp) for v in VERSIONS}
                both = per['firered'] and per == {v: per['firered'] for v in VERSIONS}
                for v in VERSIONS:
                    e = per[v]
                    if not e:
                        continue
                    first = e.pop('first')
                    x, y = where_method[first]
                    add('Pokémon', species(sp.removeprefix('SPECIES_')), x, y, key=f'wild:{sp}', catch=sp, icon=mon_icon(numbers[sp]),
                        encounter={**e, 'sprite': SPRITE.format(numbers[sp])}, version=None if both else v)
                    if both:
                        break
            # Tabla de la zona (como las de PokeAPI en Yellow) para el panel "ir a".
            for v in VERSIONS:
                for method, t in tables[v].items():
                    for sp, r in t.items():
                        n = numbers[sp]
                        mon = encounter_zones[v][zone_of[mid]].setdefault(n, {'id': n, 'name': species(sp.removeprefix('SPECIES_')),
                                                                              'sprite': SPRITE.format(n), 'types': [], 'areas': {}})
                        a = mon['areas'].setdefault(location(mid), {'area': location(mid), 'maxChance': 0, 'encounters': []})
                        a['encounters'].append({'chance': r['chance'], 'minLevel': r['min'], 'maxLevel': r['max'],
                                                'method': 'Cave' if method == 'Grass' and cave else method})
                        a['maxChance'] = max(a['maxChance'], r['chance'])

        for w in m.get('warp_events') or []:
            dest = w['dest_map']
            if dest not in where or dest not in maps:
                continue
            targets = maps[dest].get('warp_events') or []
            k = int(w['dest_warp_id']) if str(w['dest_warp_id']).isdigit() else -1
            if not 0 <= k < len(targets):
                continue
            src_area, src = at(mid, w['x'], w['y'])
            dst_area, dst = at(dest, targets[k]['x'], targets[k]['y'])
            if src_area != dst_area:
                warps.append({'area': src_area, 'at': src, 'to': dst_area, 'toAt': dst})

    # Escenas que dispara el propio mapa (al entrar, o tras otra escena): el
    # Campeon, el Oak's Parcel, lo que da Celio... Cada etiqueta va al mapa que
    # nombra ('OneIsland_PokemonCenter_1F_EventScript_...'); lo ya puesto no se repite.
    by_name = {m['name']: m['id'] for m in maps.values() if m['id'] in where and m['id'] not in COPIES}
    for label in sorted(set(scripts['firered']) | set(scripts['leafgreen'])):
        owner = by_name.get(label.split('_EventScript_')[0])
        if owner and '_EventScript_' in label and label not in REACHED:
            place_scene(owner, label, track=False)

    # Las puertas anchas son varias casillas de warp: se unen en una.
    merged = []
    for w in warps:
        near = next((o for o in merged if o['area'] == w['area'] and o['to'] == w['to'] and abs(o['at'][0] - w['at'][0]) <= 2 * B and abs(o['at'][1] - w['at'][1]) <= B), None)
        if not near:
            merged.append(w)

    ids = [mk['id'] for mk in markers]
    assert len(set(ids)) == len(ids), 'ids de marcador repetidos'
    owner = {}
    for mk in markers:
        key = f"catch:{mk['name']}" if mk['category'] == 'Pokémon' else mk['id']
        assert owner.setdefault(mk['uid'], key) == key, 'colision de uid: cambia uid_of'

    dump = lambda name, value: json.dump(value, open(f'{OUT_DATA}/{name}', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    dump('areas.json', {'areas': areas, 'warps': merged, 'places': places})
    dump('markers.json', markers)
    for v in VERSIONS:
        zones = [{'name': z, 'pokemon': [{**mon, 'areas': list(mon['areas'].values())} for mon in sorted(mons.values(), key=lambda x: x['id'])]}
                 for z, mons in encounter_zones[v].items()]
        dump(f'encounters-{v}.json', {'zones': zones})
    dump('checklist.json', build_checklist(markers, areas))

    counts = defaultdict(int)
    for mk in markers:
        counts[mk['category']] += 1
    print(f'{len(areas)} areas, {len(merged)} warps, {len(places)} lugares, {len(markers)} marcadores:', dict(counts))


# --- Checklist -------------------------------------------------------------------

# Orden de juego: partes del recorrido y las zonas que visita cada una. Las
# zonas que no aparecen aqui van al final, en "Other areas".
PARTS = [
    ('Pallet Town', ['Pallet Town']),
    ('Route 1 → Viridian City', ['Route 1', 'Viridian City', 'Route 22', 'Route 2']),
    ('Viridian Forest → Pewter City', ['Viridian Forest', 'Pewter City']),
    ('Route 3 → Mt. Moon → Route 4', ['Route 3', 'Mt. Moon', 'Route 4']),
    ('Cerulean City → Nugget Bridge', ['Cerulean City', 'Route 24', 'Route 25']),
    ('Route 5 → Vermilion City', ['Route 5', 'Underground Path', 'Route 6', 'Vermilion City', 'S.S. Anne']),
    ("Route 11 → Diglett's Cave", ['Route 11', "Diglett's Cave"]),
    ('Route 9 → Rock Tunnel', ['Route 9', 'Route 10', 'Rock Tunnel']),
    ('Lavender Town → Celadon City', ['Lavender Town', 'Route 8', 'Route 7', 'Celadon City', 'Rocket Hideout']),
    ('Pokémon Tower', ['Pokémon Tower']),
    ('Saffron City → Silph Co.', ['Saffron City', 'Silph Co.']),
    ('Route 12 → Fuchsia City', ['Route 12', 'Route 13', 'Route 14', 'Route 15', 'Route 16', 'Route 17', 'Route 18',
                                 'Fuchsia City', 'Safari Zone']),
    ('Route 19 → Cinnabar Island', ['Route 19', 'Route 20', 'Seafoam Islands', 'Cinnabar Island', 'Pokémon Mansion', 'Route 21']),
    ('Sevii Islands 1–3', ['One Island', 'Kindle Road', 'Mt. Ember', 'Ember Spa', 'Treasure Beach', 'Two Island', 'Cape Brink',
                           'Three Island', 'Three Isle Port', 'Three Isle Path', 'Bond Bridge', 'Berry Forest']),
    ('Victory Road → Indigo Plateau', ['Route 23', 'Victory Road', 'Indigo Plateau', 'Pokémon League']),
    ('Post-game: Sevii Islands 4–7', ['Four Island', 'Icefall Cave', 'Five Island', 'Five Isle Meadow', 'Memorial Pillar',
                                      'Water Labyrinth', 'Resort Gorgeous', 'Lost Cave', 'Rocket Warehouse', 'Six Island',
                                      'Water Path', 'Ruin Valley', 'Green Path', 'Outcast Island', 'Altering Cave',
                                      'Pattern Bush', 'Dotted Hole', 'Seven Island', 'Trainer Tower', 'Canyon Entrance',
                                      'Sevault Canyon', 'Tanoby Ruins', 'Tanoby Key', 'Monean Chamber', 'Liptoo Chamber',
                                      'Weepth Chamber', 'Dilford Chamber', 'Scufib Chamber', 'Rixy Chamber', 'Viapois Chamber']),
    ('Post-game: Kanto', ['Cerulean Cave', 'Power Plant']),
    ('Events', ['Navel Rock', 'Birth Island']),
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
    # Pisos de cada zona en el orden de los mapas del juego.
    floors = defaultdict(list)
    for a in areas:
        if a['kind'] == 'interior' and a['label'] != a['zone'] and a['label'] not in floors[a['zone']]:
            floors[a['zone']].append(a['label'])
    zones = [{'name': z, 'part': n, 'count': sum(mk['zone'] == z for mk in listed),
              'floors': [f for f in floors.get(z, []) if any(mk.get('floor') == f and mk['zone'] == z for mk in listed)]}
             for n, z in order if z in zones_used]
    return {'source': 'https://github.com/pret/pokefirered', 'note': 'Area order follows the story of FireRed and LeafGreen.',
            'parts': parts, 'zones': zones,
            'markers': {mk['id']: {'zone': mk['zone'], **({'floor': mk['floor']} if mk.get('floor') and mk['floor'] != mk['zone'] else {})} for mk in listed}}


if __name__ == '__main__':
    main()
