"""Que objetos de FRLG piden una MO para llegar a ellos (Corte, Surf, Fuerza...).

Recorre los mapas de pret/pokefirered desde Pueblo Paleta con scripts/common/reach.py
y escribe public/frlg/data/hm-gates.json: por cada MO, los marcadores que
quedan detras (los objetos de la Ruta 2 tras los arboles de Corte).

Uso:  python scripts/frlg/reach-frlg.py [-v]
"""
import json, os, re, sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import decomp as d
from common.reach import Area, FLOOR, WALL, WATER, WATERFALL, near, needs_by_marker
from common.hm_gates import MOVES as HM_MOVES, write_gates
from common.nav import write_nav
import importlib.util
_spec = importlib.util.spec_from_file_location('build_frlg', os.path.join(os.path.dirname(__file__), 'build-frlg.py'))
bf = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bf)

OUT = 'public/frlg/data'
START = ('MAP_PALLET_TOWN', 6, 8)
OBSTACLE = {'OBJ_EVENT_GFX_CUT_TREE': 'cut', 'OBJ_EVENT_GFX_ROCK_SMASH_ROCK': 'smash', 'OBJ_EVENT_GFX_PUSHABLE_BOULDER': 'strength'}
MOVES = ['cut', 'surf', 'strength', 'smash', 'waterfall']


def behaviors():
    text = open(d.path('include/constants/metatile_behaviors.h'), encoding='utf-8').read()
    return {k: int(v, 16) for k, v in re.findall(r'#define (MB_\w+) (0x[0-9A-Fa-f]+)', text)}


def area(m, mb):
    l = d.layouts()[m['layout']]
    raw = d.blocks(m['layout']).astype(int)
    mid, coll, elev = raw & 0x3FF, (raw >> 10) & 3, raw >> 12
    p, s = d.tileset(l['primary_tileset']), d.tileset(l['secondary_tileset'])
    attr = np.where(mid < d.METATILES_PRIMARY, p.attributes[np.minimum(mid, len(p.attributes) - 1)],
                    s.attributes[np.clip(mid - d.METATILES_PRIMARY, 0, len(s.attributes) - 1)])
    beh = attr & 0x1FF
    water = {mb[k] for k in ('MB_POND_WATER', 'MB_FAST_WATER', 'MB_DEEP_WATER', 'MB_OCEAN_WATER', 'MB_UNUSED_WATER',
                             'MB_CYCLING_ROAD_WATER', 'MB_EASTWARD_CURRENT', 'MB_WESTWARD_CURRENT',
                             'MB_NORTHWARD_CURRENT', 'MB_SOUTHWARD_CURRENT')}
    ledge = {mb['MB_JUMP_NORTH']: 4, mb['MB_JUMP_SOUTH']: 5, mb['MB_JUMP_EAST']: 6, mb['MB_JUMP_WEST']: 7}
    kind = []
    for y in range(raw.shape[0]):
        row = []
        for x in range(raw.shape[1]):
            b = int(beh[y, x])
            if b == mb['MB_WATERFALL']:
                row.append(WATERFALL)
            elif b in ledge:
                row.append(ledge[b])
            elif coll[y, x]:
                row.append(WALL)
            elif b in water:
                row.append(WATER)
            else:
                row.append(FLOOR)
        kind.append(row)
    obstacles = {(o['x'], o['y']): OBSTACLE[o['graphics_id']] for o in m.get('object_events') or [] if o.get('graphics_id') in OBSTACLE}
    warps = [(w['x'], w['y'], w['dest_map'], int(w['dest_warp_id']) if str(w['dest_warp_id']).isdigit() else -1)
             for w in m.get('warp_events') or []]
    conns = [(c['direction'], int(c['offset']), c['map']) for c in m.get('connections') or [] if c['direction'] in ('up', 'down', 'left', 'right')]
    return Area(kind, elev.tolist(), obstacles, warps, conns)


def world():
    mb = behaviors()
    maps = d.maps()
    areas = {mid: area(m, mb) for mid, m in maps.items() if m.get('layout') in d.layouts()}
    # MAP_DYNAMIC: la salida vuelve a donde entraste; se enlaza con cada mapa que
    # tiene una puerta hacia aqui.
    back = {}
    for mid, a in areas.items():
        for x, y, dest, k in a.warps:
            back.setdefault(dest, []).append((mid, x, y))
    for mid, a in areas.items():
        fixed = []
        for x, y, dest, k in a.warps:
            if dest == 'MAP_DYNAMIC':
                for src, sx, sy in back.get(mid, []):
                    fixed.append((x, y, src, areas[src].doors.index((sx, sy))))
            else:
                fixed.append((x, y, dest, k))
        a.warps = fixed
    return areas


def ferry_starts(areas):
    """Donde atraca el barco de las Islas Sete (src/seagallop.c): Carmin, Canela
    y cada puerto. No son puertas del mapa, asi que se siembran a mano. Sin los
    islotes de evento (Ombligo, Isla Origen) ni Canela: su muelle solo se usa
    despues de las islas, y a Canela se llega antes con Surf."""
    text = open(d.path('src/seagallop.c'), encoding='utf-8').read()
    return [(mid, int(x, 16), int(y, 16)) for mid, x, y in re.findall(r'\{MAP\((MAP_\w+)\),\s*(0x\w+),\s*(0x\w+)\}', text)
            if mid in areas and not re.search('NAVEL|BIRTH|CINNABAR', mid)]


def placed():
    """Mapa -> (zona, area de la app, x, y en casillas), como en build-frlg.py."""
    maps = d.maps()
    mapsecs = {s['id']: bf.title(s['name']) for s in json.load(open(d.path('src/data/region_map/region_map_sections.json'), encoding='utf-8'))['map_sections'] if 'name' in s}
    zone = lambda mid: mapsecs.get(maps[mid]['region_map_section'], 'Other')
    out = {}
    for rid, r in bf.build_regions().items():
        for m, (x, y) in r['maps'].items():
            out[m] = (zone(m), rid, x, y)
    for alias, (target, dx, dy) in bf.ALIAS.items():
        _, rid, x, y = out[target]
        out[alias] = (zone(alias), rid, x - dx, y - dy)
    for mid in maps:
        if mid not in out and not bf.SKIP.match(mid):
            out[mid] = (zone(mid), mid, 0, 0)
    return out


def main():
    areas = world()
    markers = json.load(open(f'{OUT}/markers.json', encoding='utf-8'))
    people = ('Item Gift', 'In-Game Trade', 'Battle', 'In-Game Gift Pokémon', 'Shop')
    todo = [(m['id'], m['map'], *map(int, m['id'].rsplit(':', 1)[1].split(',')), m['category'] in people)
            for m in markers if m['category'] not in ('Pokémon', 'Obstacle') and re.search(r':\d+,\d+$', m['id'])]
    starts = [START] + ferry_starts(areas)
    needs, reached = needs_by_marker(areas, starts, todo, MOVES, MOVES)
    full = reached[tuple(MOVES)]
    lost = [m for m in todo if not near(full, *m[1:])]
    by_id = {m['id']: m for m in markers}
    if '-v' in sys.argv:
        for mid, n in sorted(needs.items()):
            print('+'.join(n).ljust(18), by_id[mid]['name'], '@', by_id[mid]['location'])
        print('--- sin alcanzar ni con todas las MO:', len(lost))
        for m in lost:
            print('   ', by_id[m[0]]['name'], '@', by_id[m[0]]['location'])
    write_gates(f'{OUT}/hm-gates.json', needs, 'FireRed/LeafGreen')
    write_nav(f'{OUT}/nav.json', areas, placed(), {mv: HM_MOVES[mv] for mv in MOVES}, starts=[START], ferry=ferry_starts(areas))


if __name__ == '__main__':
    main()
