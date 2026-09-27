"""Alcance: que se puede pisar desde el inicio con cada juego de MO.

Comun a todos los juegos. Cada juego describe sus mapas con `Area` (rejilla de
casillas, puertas, bordes y obstaculos) y aqui se recorre el mundo entero desde
el inicio, con las MO como llaves: sin Corte el arbol es un muro, sin Surf el
agua tambien. Asi sale que objetos estan detras de un arbol (los de la Ruta 2
en FRLG) sin tener que listarlos a mano.

Lo que no sale de la rejilla (guardias, Snorlax, puertas con tarjeta) se queda
en gates.json, escrito a mano.
"""
from collections import deque
from itertools import combinations

# Casillas.
WALL, FLOOR, WATER, WATERFALL = 0, 1, 2, 3
# Saltos: se cruzan solo en su direccion, cayendo una casilla mas alla.
LEDGE = {4: (0, -1), 5: (0, 1), 6: (1, 0), 7: (-1, 0)}  # norte, sur, este, oeste
STEPS = ((0, -1), (0, 1), (-1, 0), (1, 0))
SIDE = {(0, -1): 'up', (0, 1): 'down', (-1, 0): 'left', (1, 0): 'right'}


class Area:
    """Un mapa del juego.

    kind[y][x]: WALL, FLOOR, WATER, WATERFALL o un salto (LEDGE).
    elev[y][x]: altura (FRLG); 0 y 15 valen para cualquiera. None si el juego no la tiene.
    obstacles: {(x, y): 'cut' | 'strength' | 'smash'}.
    warps: [(x, y, mapa destino, indice de su puerta)].
    connections: [(lado, desplazamiento, mapa)], como en los decomp.
    tiles, pairs: en la Gen 1 el desnivel no es una altura sino parejas de tiles
    entre las que no se puede pasar (tiles[y][x] y {(tile, tile)}).
    """

    def __init__(self, kind, elev=None, obstacles=None, warps=None, connections=None, tiles=None, pairs=()):
        self.kind, self.elev = kind, elev
        self.tiles, self.pairs = tiles, pairs
        self.h, self.w = len(kind), len(kind[0]) if kind else 0
        self.obstacles = obstacles or {}
        self.warps = warps or []
        # Donde se aparece al llegar por la puerta n: la lista original, aunque
        # luego cada juego desdoble las salidas de "vuelve a donde viniste".
        self.doors = [(w[0], w[1]) for w in self.warps]
        self.connections = connections or []


def _e(area, x, y):
    return area.elev[y][x] if area.elev is not None else 0


def _elev_ok(cur, to):
    return cur in (0, 15) or to in (0, 15) or cur == to


def reach(areas, starts, can):
    """Casillas pisables desde `starts` [(mapa, x, y)] con las MO de `can`.

    Devuelve {mapa: set((x, y))}.
    """
    seen, out = set(), {}
    queue = deque()

    def push(m, x, y, e, surf):
        s = (m, x, y, e, surf)
        if s not in seen:
            seen.add(s)
            out.setdefault(m, set()).add((x, y))
            queue.append(s)

    def arrive(m, x, y):
        a = areas.get(m)
        if a and 0 <= x < a.w and 0 <= y < a.h:
            push(m, x, y, _e(a, x, y), a.kind[y][x] in (WATER, WATERFALL))

    for m, x, y in starts:
        arrive(m, x, y)
    while queue:
        m, x, y, e, surf = queue.popleft()
        a = areas[m]
        for w in a.warps:
            if (w[0], w[1]) == (x, y):
                _warp(areas, w, arrive)
        for dx, dy in STEPS:
            nx, ny = x + dx, y + dy
            if not (0 <= nx < a.w and 0 <= ny < a.h):
                _cross(areas, m, a, nx, ny, dx, dy, e, surf, can, push)
                continue
            _step(areas, m, a, nx, ny, dx, dy, e, surf, can, push, arrive)
    return out


def _warp(areas, w, arrive):
    dest = areas.get(w[2])
    if dest is None:
        return
    for dx, dy in dest.doors[w[3]:w[3] + 1] if w[3] >= 0 else []:
        arrive(w[2], dx, dy)


def _enter(a, nx, ny, dx, dy, e, surf, can):
    """(x, y, altura, surfeando) al moverse a (nx, ny), o None si no se puede."""
    k = a.kind[ny][nx]
    ob = a.obstacles.get((nx, ny))
    # 'switch': una reja que abre un interruptor; se pasa siempre (se pulsa).
    # 'plate': barrera que abre una roca sobre un interruptor: pide Fuerza.
    if ob and ob != 'switch' and ('strength' if ob == 'plate' else ob) not in can:
        return None
    ne = _e(a, nx, ny)
    if k in (WATER, WATERFALL):
        if 'surf' not in can or (k == WATERFALL and 'waterfall' not in can):
            return None
        return nx, ny, ne, True
    if k in LEDGE:
        if LEDGE[k] != (dx, dy):
            return None
        lx, ly = nx + dx, ny + dy
        if not (0 <= lx < a.w and 0 <= ly < a.h) or a.kind[ly][lx] != FLOOR:
            return None
        return lx, ly, _e(a, lx, ly), False
    if k != FLOOR:
        return None
    # Bajar del agua vale a cualquier orilla; andando manda la altura.
    if not surf and not _elev_ok(e, ne):
        return None
    return nx, ny, (e if ne == 15 else ne), False


def _step(areas, m, a, nx, ny, dx, dy, e, surf, can, push, arrive):
    if a.pairs:
        t, nt = a.tiles[ny - dy][nx - dx], a.tiles[ny][nx]
        if (t, nt) in a.pairs or (nt, t) in a.pairs:
            return
    # Una puerta se cruza aunque su casilla sea muro (las puertas de las casas).
    for w in a.warps:
        if (w[0], w[1]) == (nx, ny) and a.kind[ny][nx] not in (WATER, WATERFALL):
            push(m, nx, ny, e, False)
            return
    to = _enter(a, nx, ny, dx, dy, e, surf, can)
    if to:
        push(m, *to)


def _cross(areas, m, a, nx, ny, dx, dy, e, surf, can, push):
    """Salir por el borde del mapa al vecino que toca por ese lado."""
    side = SIDE[(dx, dy)]
    for s, off, dest in a.connections:
        b = areas.get(dest)
        if s != side or b is None:
            continue
        if side in ('up', 'down'):
            tx, ty = nx - off, b.h - 1 if side == 'up' else 0
        else:
            tx, ty = b.w - 1 if side == 'left' else 0, ny - off
        if 0 <= tx < b.w and 0 <= ty < b.h:
            to = _enter(b, tx, ty, dx, dy, e, surf, can)
            if to:
                push(dest, *to)


def near(reached, m, x, y, far=False):
    """Se llega a un marcador si se pisa su casilla o una de al lado (los
    objetos se cogen desde la casilla vecina). A la gente (`far`) tambien se le
    habla a dos casillas en linea, por encima de un mostrador."""
    tiles = reached.get(m, set())
    return (x, y) in tiles or any((x + dx * k, y + dy * k) in tiles for dx, dy in STEPS for k in ((1, 2) if far else (1,)))


def needs_by_marker(areas, starts, markers, moves, order):
    """Para cada marcador, las MO minimas para llegar a el.

    markers: [(id, mapa, x, y, far)]. moves: MO que se prueban. order: cuales se
    consiguen antes, para elegir entre dos caminos (Corte o Surf: Corte).
    Devuelve {id: tupla de MO} solo para los que piden alguna; los que no se
    alcanzan ni con todas quedan fuera (dependen de scripts, no de la rejilla).
    """
    reached = {}
    for n in range(len(moves) + 1):
        for combo in combinations(moves, n):
            reached[combo] = reach(areas, starts, set(combo))
    out = {}
    for mid, m, x, y, far in markers:
        ok = [c for c, r in reached.items() if near(r, m, x, y, far)]
        if not ok or () in ok:
            continue
        minimal = [c for c in ok if not any(set(o) < set(c) for o in ok)]
        out[mid] = min(minimal, key=lambda c: sorted(order.index(v) for v in c)[::-1])
    return out, reached
