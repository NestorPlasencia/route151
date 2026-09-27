"""Que objetos de Yellow piden una MO para llegar a ellos (Corte, Surf, Fuerza).

Recorre los mapas de pret/pokeyellow desde Pueblo Paleta con scripts/common/reach.py
y escribe public/yellow/data/hm-gates.json. En la Gen 1 cada casilla de 16 px
se juzga por su tile de abajo a la izquierda, como hace el juego.

Uso:  python scripts/yellow/reach-yellow.py [-v]
"""
import importlib.util, json, os, re, sys

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import decomp as d
from common.reach import Area, FLOOR, WALL, WATER, near, needs_by_marker
from common.hm_gates import write_gates

_spec = importlib.util.spec_from_file_location('build_yellow', os.path.join(os.path.dirname(__file__), 'build-yellow.py'))
by = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(by)

OUT = 'public/yellow/data'
MOVES = ['cut', 'surf', 'strength']
WATER_TILE = 0x14
# Tile del arbol que se corta (engine: $3d en exteriores, $50 en gimnasios).
CUT_TILES = {'OVERWORLD': 0x3D, 'GYM': 0x50}
SIDES = {'north': 'up', 'south': 'down', 'west': 'left', 'east': 'right'}


def ledges():
    """Tile del salto -> su direccion (data/tilesets/ledge_tiles.asm; solo exteriores)."""
    kind = {'DOWN': 5, 'UP': 4, 'RIGHT': 6, 'LEFT': 7}
    return {int(t, 16): kind[f] for f, t in re.findall(r'db SPRITE_FACING_(\w+),\s*\$\w+,\s*\$(\w+)', by.asm('data/tilesets/ledge_tiles.asm'))}


def pairs():
    """Tileset -> parejas de tiles entre las que no se pasa (desniveles)."""
    out = {}
    for ts, a, b in re.findall(r'db (\w+), \$(\w+), \$(\w+)', by.asm('data/tilesets/pair_collision_tile_ids.asm')):
        out.setdefault(ts, set()).add((int(a, 16), int(b, 16)))
    return out


def water_tilesets():
    body = by.asm('data/tilesets/water_tilesets.asm').split('WaterTilesets:')[1].split('db -1')[0]
    return set(re.findall(r'db (\w+)', body))


def world():
    maps = d.maps()
    walkable, ledge, pair, wet = by.walkable_tiles(), ledges(), pairs(), water_tilesets()
    objects = {c: by.parse_objects(m['label']) for c, m in maps.items()}
    areas = {}
    for c, m in maps.items():
        grid = by.tile_grid(m).tolist()
        ts = m['tileset']
        ok = walkable.get(ts, set())
        kind, obstacles = [], {}
        for y, row in enumerate(grid):
            line = []
            for x, t in enumerate(row):
                if ts in CUT_TILES and t == CUT_TILES[ts]:
                    line.append(FLOOR)
                    obstacles[(x, y)] = 'cut'
                elif ts in wet and t == WATER_TILE:
                    line.append(WATER)
                elif ts == 'OVERWORLD' and t in ledge:
                    line.append(ledge[t])
                else:
                    line.append(FLOOR if t in ok else WALL)
            kind.append(line)
        warps, objs = objects[c]
        for o in objs:
            if o['sprite'] == 'SPRITE_BOULDER':
                obstacles[(o['x'], o['y'])] = 'strength'
        conns = [(SIDES[s], 2 * o, t) for s, t, o in m['connections'] if s in SIDES]
        areas[c] = Area(kind, None, obstacles, [(x, y, dest, n - 1) for x, y, dest, n in warps], conns, grid, pair.get(ts, set()))
    # LAST_MAP: la salida vuelve al exterior del que viniste; se enlaza con cada
    # mapa que tiene una puerta hacia aqui.
    back = {}
    for c, a in areas.items():
        for i, (x, y, dest, k) in enumerate(a.warps):
            if not maps[c]['indoor']:
                back.setdefault(dest, []).append((c, i))
    for c, a in areas.items():
        a.warps = [(x, y, src, i) for x, y, dest, k in a.warps for src, i in (back.get(c, []) if dest == 'LAST_MAP' else [(dest, k)])]
    return areas


def main():
    areas = world()
    markers = json.load(open(f'{OUT}/markers.json', encoding='utf-8'))
    people = ('Item Gift', 'In-Game Trade', 'Battle', 'In-Game Gift Pokémon', 'Shop')
    todo = [(m['id'], m['map'], *map(int, m['id'].rsplit(':', 1)[1].split(',')), m['category'] in people)
            for m in markers if m['category'] not in ('Pokémon', 'Obstacle') and re.search(r':\d+,\d+$', m['id'])]
    home = areas['PALLET_TOWN'].warps[0]
    needs, reached = needs_by_marker(areas, [('PALLET_TOWN', home[0], home[1])], todo, MOVES, MOVES)
    full = reached[tuple(MOVES)]
    lost = [m for m in todo if not near(full, *m[1:])]
    by_id = {m['id']: m for m in markers}
    if '-v' in sys.argv:
        for mid, n in sorted(needs.items(), key=lambda i: by_id[i[0]]['location']):
            print('+'.join(n).ljust(18), by_id[mid]['name'], '@', by_id[mid]['location'])
        print('--- sin alcanzar ni con todas las MO:', len(lost))
        for m in lost:
            print('   ', by_id[m[0]]['name'], '@', by_id[m[0]]['location'])
    write_gates(f'{OUT}/hm-gates.json', needs, 'Yellow')


if __name__ == '__main__':
    main()
