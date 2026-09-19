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
Salida: public/frlg/areas/**.png y public/frlg/data/{areas,markers}.json
"""
import json, os, re, shutil, sys, unicodedata
from collections import defaultdict

from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
import decomp as d

OUT_IMG = 'public/frlg/areas'
OUT_DATA = 'public/frlg/data'
B = d.BLOCK

# Mapas que no son del juego normal (prototipos sin usar y salas del cable link).
SKIP = re.compile(r'MAP_(PROTOTYPE_|BATTLE_COLOSSEUM|TRADE_CENTER|RECORD_CORNER|UNION_ROOM|UNKNOWN_MAP|BATTLE_TOWER)')
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


def place_group(start):
    """Posicion (en bloques) de cada mapa conectado a `start`."""
    maps = d.maps()
    pos, queue = {start: (0, 0)}, [start]
    while queue:
        a = queue.pop()
        (ax, ay), (aw, ah) = pos[a], layout_size(a)
        for c in maps[a].get('connections') or []:
            b = c['map']
            if b in pos or b not in maps or b in ALIAS or SKIP.match(b):
                continue
            (bw, bh), o = layout_size(b), c['offset']
            pos[b] = {'up': (ax + o, ay - bh), 'down': (ax + o, ay + ah),
                      'left': (ax - bw, ay + o), 'right': (ax + aw, ay + o)}[c['direction']]
            queue.append(b)
    x0, y0 = min(p[0] for p in pos.values()), min(p[1] for p in pos.values())
    return {m: (x - x0, y - y0) for m, (x, y) in pos.items()}


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

def load_items():
    items = json.load(open(d.path('src/data/items.json'), encoding='utf-8'))['items']
    return {i['itemId']: {'name': title(i['english']), 'pocket': i['pocket']} for i in items}


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
        out[tid] = {'name': title(name), 'class': const_name(cls, 'TRAINER_CLASS_'),
                    'party': parties.get(party.group(1), []) if party else []}
    return out


def script_blocks(text):
    """Etiqueta:: -> cuerpo hasta la siguiente etiqueta."""
    parts = re.split(r'^(\w+)::\s*$', text, flags=re.M)
    return {parts[i]: parts[i + 1] for i in range(1, len(parts) - 1, 2)}


def load_scripts():
    """Todas las etiquetas de script: las de cada mapa y las comunes de
    data/scripts (ahi estan los entrenadores de ruta y las Poke Balls)."""
    files = [d.path('data/scripts', f) for f in os.listdir(d.path('data/scripts')) if f.endswith('.inc')]
    files += [d.path('data/maps', m['dir'], 'scripts.inc') for m in d.maps().values()]
    blocks = {}
    for f in files:
        if os.path.exists(f):
            blocks.update(script_blocks(open(f, encoding='utf-8').read()))
    return blocks


def follow(scripts, label, depth=3):
    """Cuerpo del script mas los de las etiquetas a las que salta (goto, call)
    dentro del mismo mapa: el combate del Alto Mando esta tras un goto_if."""
    prefix = label.split('_EventScript_')[0] + '_EventScript_'
    seen, frontier, body = {label}, [label], ''
    for _ in range(depth + 1):
        nxt = []
        for l in frontier:
            text = scripts.get(l, '')
            body += text
            for ref in re.findall(r'\b(' + re.escape(prefix) + r'\w+)', text):
                if ref not in seen:
                    seen.add(ref)
                    nxt.append(ref)
        frontier = nxt
    return body


# --- Areas, marcadores y warps --------------------------------------------------

def main():
    maps, regions = d.maps(), build_regions()
    items, trainers, scripts = load_items(), load_trainers(), load_scripts()
    mapsecs = {s['id']: title(s['name']) for s in json.load(open(d.path('src/data/region_map/region_map_sections.json'), encoding='utf-8'))['map_sections'] if 'name' in s}

    shutil.rmtree(OUT_IMG, ignore_errors=True)
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

    for m in maps.values():
        mid = m['id']
        if mid in where or SKIP.match(mid):
            continue
        zone = mapsecs.get(m['region_map_section'], 'Other')
        label = map_label(m['name'], zone)
        img = d.render_layout(m['layout'])
        d.draw_objects(img, mid)
        rel = f'{slug(zone)}/{slug(m["name"])}.png'
        os.makedirs(os.path.dirname(f'{OUT_IMG}/{rel}'), exist_ok=True)
        img.save(f'{OUT_IMG}/{rel}', optimize=True)
        areas.append({'id': mid, 'kind': 'interior', 'zone': zone, 'label': label, 'image': f'/frlg/areas/{rel}', 'width': img.width, 'height': img.height})
        where[mid] = (mid, 0, 0)

    def at(mid, x, y):
        """Casilla (x, y) del mapa -> (area, centro en pixeles)."""
        area, ox, oy = where[mid]
        return area, [(ox + x) * B + B // 2, (oy + y) * B + B // 2]

    markers, warps = [], []
    for m in maps.values():
        mid = m['id']
        if mid not in where or mid in COPIES:
            continue

        def add(kind, name, x, y, detail=None, flag=None, **extra):
            area, px = at(mid, x, y)
            markers.append({'id': f'{mid}:{kind}:{x},{y}', 'category': kind, 'name': name, 'detail': detail,
                            'area': area, 'at': px, 'map': mid, 'flag': flag if flag not in (None, '0') else None, **extra})

        for o in m.get('object_events') or []:
            gfx, script = o.get('graphics_id', ''), o.get('script', '')
            body = follow(scripts, script)
            battle = re.search(r'trainerbattle_\w+ (TRAINER_\w+)', body)
            gift = re.search(r'givemon SPECIES_(\w+), (\d+)', body)
            wild = re.search(r'setwildbattle SPECIES_(\w+), (\d+)', body)
            item = re.search(r'(finditem|giveitem) (ITEM_\w+)', body)
            if gfx in OBSTACLES:
                add('Obstacle', OBSTACLES[gfx], o['x'], o['y'])
            elif battle and battle.group(1) in trainers:
                t = trainers[battle.group(1)]
                boss = t['class'] in ('Leader', 'Elite Four', 'Champion')
                party = ', '.join(f'{s} Lv{l}' for s, l in t['party'])
                add('Boss' if boss else 'Trainer', f'{t["class"]} {t["name"]}'.strip(), o['x'], o['y'], detail=party)
            elif gift:
                add('Gift Pokémon', species(gift.group(1)), o['x'], o['y'], detail=f'Lv{gift.group(2)}', flag=o.get('flag'))
            elif wild:
                add('Static Pokémon', species(wild.group(1)), o['x'], o['y'], detail=f'Lv{wild.group(2)}', flag=o.get('flag'))
            elif item and item.group(2) in items:
                info = items[item.group(2)]
                pocket = info['pocket']
                if gfx != 'OBJ_EVENT_GFX_ITEM_BALL':
                    kind = 'Gift Item'  # lo da un NPC
                else:
                    kind = 'TM/HM' if pocket == 'POCKET_TM_CASE' else 'Key Item' if pocket == 'POCKET_KEY_ITEMS' else 'Item'
                add(kind, info['name'], o['x'], o['y'], flag=o.get('flag'))
        for b in m.get('bg_events') or []:
            if b.get('type') == 'hidden_item' and b.get('item') in items:
                q = int(b.get('quantity') or 1)
                # ITEM_NONE con cantidad: las monedas escondidas del Casino.
                name = 'Coins' if b['item'] == 'ITEM_NONE' else items[b['item']]['name']
                add('Hidden Item', name + (f' ×{q}' if q > 1 else ''), b['x'], b['y'], flag=b.get('flag'))

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

    # Las puertas anchas son varias casillas de warp: se unen en una.
    merged = []
    for w in warps:
        near = next((o for o in merged if o['area'] == w['area'] and o['to'] == w['to'] and abs(o['at'][0] - w['at'][0]) <= 2 * B and abs(o['at'][1] - w['at'][1]) <= B), None)
        if not near:
            merged.append(w)

    json.dump({'areas': areas, 'warps': merged}, open(f'{OUT_DATA}/areas.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    json.dump(markers, open(f'{OUT_DATA}/markers.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))

    counts = defaultdict(int)
    for mk in markers:
        counts[mk['category']] += 1
    print(f'{len(areas)} areas, {len(merged)} warps, {len(markers)} marcadores:', dict(counts))


if __name__ == '__main__':
    main()
