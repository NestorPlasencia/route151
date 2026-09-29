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
from common.hm_gates import MOVES as HM_MOVES, write_gates
from common.nav import write_nav

_spec = importlib.util.spec_from_file_location('build_yellow', os.path.join(os.path.dirname(__file__), 'build-yellow.py'))
by = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(by)

OUT = 'public/yellow/data'
MOVES = ['cut', 'flute', 'surf', 'strength']  # en el orden en que se consiguen
# Donde empieza la partida: tu cuarto, en el piso de arriba de tu casa.
START = ('REDS_HOUSE_2F', 3, 6)
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
                # La orilla ($48, $32) tambien se surfea (IsNextTileShoreOrWater),
                # salvo en el muelle, los gimnasios y el Dojo: por ahi se desembarca
                # en la isla de las Islas Espuma viniendo de Fucsia.
                elif ts in wet and ts not in ('SHIP_PORT', 'GYM', 'DOJO') and t in (0x48, 0x32) and t not in ok:
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
            elif o['sprite'] == 'SPRITE_SNORLAX':
                obstacles[(o['x'], o['y'])] = 'flute'
        conns = [(SIDES[s], 2 * o, t) for s, t, o in m['connections'] if s in SIDES]
        areas[c] = Area(kind, None, obstacles, [(x, y, dest, n - 1) for x, y, dest, n in warps], conns, grid, pair.get(ts, set()))
    # Mansion Pokemon: el interruptor de las estatuas cambia bloques (lb bc, fila,
    # columna; un bloque son 2x2 casillas) entre suelo y reja. Uno que algun
    # estado deja libre cuenta como suelo: se pulsa cuando hace falta.
    for floor in ('1F', '2F', '3F', 'B1F'):
        a = areas.get(f'POKEMON_MANSION_{floor}')
        for by_, bx in re.findall(r'lb bc, (\d+), (\d+)', by.asm(f'scripts/PokemonMansion{floor}.asm')) if a else []:
            for y in (2 * int(by_), 2 * int(by_) + 1):
                for x in (2 * int(bx), 2 * int(bx) + 1):
                    if y < len(a.kind) and x < len(a.kind[0]):
                        a.kind[y][x] = FLOOR
                        a.obstacles[(x, y)] = 'switch'
    # Calle Victoria: una roca sobre el interruptor del suelo abre una barrera
    # (el script cambia ese bloque por suelo). Se pasa con Fuerza: 'plate'.
    for floor in ('1F', '2F', '3F'):
        a = areas.get(f'VICTORY_ROAD_{floor}')
        for by_, bx in re.findall(r'lb bc, (\d+), (\d+)', by.asm(f'scripts/VictoryRoad{floor}.asm')) if a else []:
            for y in (2 * int(by_), 2 * int(by_) + 1):
                for x in (2 * int(bx), 2 * int(bx) + 1):
                    if y < len(a.kind) and x < len(a.kind[0]) and a.kind[y][x] == WALL:
                        a.kind[y][x] = FLOOR
                        a.obstacles[(x, y)] = 'plate'
    # LAST_MAP: la salida vuelve al exterior del que viniste; se enlaza con cada
    # mapa que tiene una puerta hacia aqui. Su numero es la puerta de fuera a la
    # que sale: la principal de la Mansion Azulona da a la de delante, no a la de
    # atras. Si ese numero no es una puerta hacia aqui, vale cualquiera.
    back = {}
    for c, a in areas.items():
        for i, (x, y, dest, k) in enumerate(a.warps):
            if not maps[c]['indoor']:
                back.setdefault(dest, []).append((c, i))

    def exits(c, k):
        doors = back.get(c, [])
        return [(src, i) for src, i in doors if i == k] or doors
    # Un ascensor: su puerta lleva al piso que eliges (lo pone un script), no al
    # que dicen sus datos. Sale a cada piso que tiene una puerta hacia el.
    floors = {}
    for c, a in areas.items():
        for i, (x, y, dest, k) in enumerate(a.warps):
            floors.setdefault(dest, []).append((c, i))
    for c, a in areas.items():
        if 'ELEVATOR' in c:
            a.warps = [(x, y, src, i) for x, y, _, _ in a.warps for src, i in floors.get(c, [])]
        else:
            a.warps = [(x, y, src, i) for x, y, dest, k in a.warps for src, i in (exits(c, k) if dest == 'LAST_MAP' else [(dest, k)])]
    return areas


def placed():
    """Mapa -> (zona, area de la app, x, y en casillas), como en build-yellow.py."""
    maps = d.maps()
    outdoor, indoor = by.zone_names()

    def zone(c):
        m = maps[c]
        if not m['indoor']:
            return outdoor[m['index']] if m['index'] < len(outdoor) else by.title(c.replace('_', ' '))
        return by.split_zone(indoor.get(m.get('outside'), by.title((m.get('outside') or c).replace('_', ' '))), c)

    out = {c: (zone(c), 'kanto', x * 2, y * 2) for c, (x, y) in by.place_kanto(maps).items()}
    reachable = {dest for c, m in maps.items() for _, _, dest, _ in by.parse_objects(m['label'])[0]}
    for c in maps:
        if c not in out and c in reachable and not c.startswith(('UNUSED', 'TRADE_CENTER', 'COLOSSEUM')):
            out[c] = (zone(c), c, 0, 0)
    return out


def main():
    areas = world()
    markers = json.load(open(f'{OUT}/markers.json', encoding='utf-8'))
    people = ('Item Gift', 'In-Game Trade', 'Battle', 'In-Game Gift Pokémon', 'Shop')
    todo = [(m['id'], m['map'], *map(int, m['id'].rsplit(':', 1)[1].split(',')), m['category'] in people)
            for m in markers if m['category'] not in ('Pokémon', 'Obstacle') and re.search(r':\d+,\d+$', m['id'])]
    needs, reached = needs_by_marker(areas, [START], todo, MOVES, MOVES)
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
    write_nav(f'{OUT}/nav.json', areas, placed(), {mv: HM_MOVES[mv] for mv in MOVES}, starts=[START])


if __name__ == '__main__':
    main()
