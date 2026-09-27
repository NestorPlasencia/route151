"""Nucleo comun de los generadores de mapas y marcadores (FRLG, Yellow...).

Cada juego tiene un adaptador que sabe leer su decompilacion (scripts/frlg,
scripts/yellow) y entrega lo que encuentra; aqui se hace, igual para todos:

- marcadores: su id y su uid (el progreso guardado), sin repetir regalos ni
  escenas, con zona, piso, detalle, encuentro y version;
- puertas: las anchas (varias casillas) se unen en una;
- lugares: cada zona de una region, en el centro de sus mapas;
- tablas de encuentros por zona (el panel "ir a");
- checklist: partes de la historia, zonas y pisos;
- los JSON de salida y el resumen.

Asi una mejora (por ejemplo, como se colocan o se cuentan los marcadores)
llega a todos los juegos a la vez.
"""
import json, re, unicodedata
from collections import defaultdict

import numpy as np


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


def spot(grid, kind, fallback, avoid=()):
    """Casilla de ese tipo (un valor o un conjunto) mas cercana al centro de
    todas ellas: cae sobre hierba, agua o suelo real aunque la zona tenga forma de L.
    `avoid`: casillas (x, y) ocupadas (un entrenador, un objeto), para que el pin
    no se junte con otro marcador."""
    mask = np.isin(grid, list(kind)) if isinstance(kind, (set, frozenset)) else grid == kind
    for x, y in avoid:
        if 0 <= y < mask.shape[0] and 0 <= x < mask.shape[1]:
            mask[y, x] = False
    ys, xs = np.nonzero(mask)
    if not len(xs):
        return fallback
    cx, cy = xs.mean(), ys.mean()
    i = int(np.argmin((xs - cx) ** 2 + (ys - cy) ** 2))
    return int(xs[i]), int(ys[i])


def places(spots):
    """[(zona, area, x, y)] del centro de cada mapa -> un lugar por zona, en la media."""
    out = {}
    for zone, area, x, y in spots:
        out.setdefault(zone, {'name': zone, 'area': area, 'pts': []})['pts'].append((x, y))
    return [{'name': p['name'], 'area': p['area'],
             'at': [round(sum(q[0] for q in p['pts']) / len(p['pts'])), round(sum(q[1] for q in p['pts']) / len(p['pts']))]}
            for p in out.values()]


class World:
    """Marcadores, puertas y encuentros de un juego, con las mismas reglas para todos.

    `uid_prefix`: se antepone al texto del uid (Yellow usa 'yellow:' para que su
    progreso no choque con el de otros juegos)."""

    def __init__(self, tile=16, uid_prefix=''):
        self.tile, self.uid_prefix = tile, uid_prefix
        self.markers, self.warps = [], []
        self.placed = set()  # (mapa, clase, nombre, version) ya puestos
        self.zones = defaultdict(lambda: defaultdict(dict))  # version -> zona -> numero -> Pokemon

    def add(self, *, map_id, area, at, location, zone, category, name, x, y, floor=None, key=None, icon=None,
            detail=None, encounter=None, version=None, catch=None, once=False):
        """Un marcador en la casilla (x, y) de `map_id`, pintado en `area` en `at`.

        `catch`: especie de un Pokemon salvaje o fijo: todos los de una especie
        comparten uid, y atraparlo en un sitio lo completa en todos. `once`: si ya
        hay uno igual en el mapa no se repite (escenas en varias casillas); los
        regalos de objetos nunca se repiten en un mismo mapa."""
        kind = 'item' if category in ('Item In Map', 'Hidden Item', 'Item Gift') else category
        tag = (map_id, kind, name, version)
        if (once or category == 'Item Gift') and (tag in self.placed or (map_id, kind, name, None) in self.placed):
            return
        self.placed.add(tag)
        if encounter:
            encounter = {**encounter, 'zone': encounter.get('zone') or location}
        mid = f'{map_id}:{key or category}:{x},{y}' + (f':{version}' if version else '')
        mk = {'id': mid, 'uid': uid_of(self.uid_prefix + (f'catch:{catch}' if catch else mid)), 'category': category, 'name': name,
              'location': location, 'area': area, 'at': at, 'map': map_id, 'zone': zone, 'icon': icon}
        if floor:
            mk['floor'] = floor
        for k, v in (('detail', detail), ('encounter', encounter), ('version', version)):
            if v:
                mk[k] = v
        self.markers.append(mk)

    def warp(self, area, at, to, to_at):
        """Puerta o escalera entre dos areas distintas."""
        if area != to:
            self.warps.append({'area': area, 'at': at, 'to': to, 'toAt': to_at})

    def merged_warps(self, sizes=None):
        """Las puertas anchas son varias casillas de warp: se unen en una.

        sizes: {area: (ancho, alto)} en pixeles, para elegir entre casillas sueltas.
        """
        # Se juntan casillas pegadas (con cualquiera del grupo: la salida sur del
        # Bosque Verde son cuatro seguidas), no dos puertas con un hueco entre
        # ellas (las dos del Centro Comercial de Azulona). Tambien las que llevan
        # al mismo sitio a pocas casillas: las salidas del Tunel Roca tienen una
        # casilla en el borde, a la que no se llega, y otra tres mas adentro.
        groups, t = [], self.tile

        def joins(g, w):
            if g[0]['area'] != w['area'] or g[0]['to'] != w['to']:
                return False
            return any((abs(o['at'][0] - w['at'][0]) <= t and abs(o['at'][1] - w['at'][1]) <= t)
                       or (o['toAt'] == w['toAt'] and abs(o['at'][0] - w['at'][0]) + abs(o['at'][1] - w['at'][1]) <= 4 * t) for o in g)
        for w in self.warps:
            near = next((g for g in groups if joins(g, w)), None)
            if near:
                near.append(w)
            else:
                groups.append([w])

        def line(g):
            return len({o['at'][1] for o in g}) == 1 or len({o['at'][0] for o in g}) == 1

        def adjacent(g):
            pts = sorted(o['at'] for o in g)
            return all(abs(a[0] - b[0]) + abs(a[1] - b[1]) <= t for a, b in zip(pts, pts[1:]))

        def inner(g):
            # La casilla mas lejos del borde del mapa: la que se pisa.
            w, h = (sizes or {}).get(g[0]['area'], (0, 0))
            if not w:
                return g[0]
            return max(g, key=lambda o: min(o['at'][0], w - o['at'][0], o['at'][1], h - o['at'][1]))

        out = []
        for g in groups:
            if len(g) == 1:
                out.append(g[0])
            elif adjacent(g):
                out.append({**g[0], 'at': sorted(o['at'] for o in g)[len(g) // 2]} if len(g) > 2 and line(g) else g[0])
            else:
                out.append(inner(g))
        return out

    def encounter(self, version, zone, n, name, sprite, location, chance, lo, hi, method):
        """Una fila de la tabla de encuentros de la zona (el panel "ir a")."""
        mon = self.zones[version][zone].setdefault(n, {'id': n, 'name': name, 'sprite': sprite, 'types': [], 'areas': {}})
        a = mon['areas'].setdefault(location, {'area': location, 'maxChance': 0, 'encounters': []})
        a['encounters'].append({'chance': chance, 'minLevel': lo, 'maxLevel': hi, 'method': method})
        a['maxChance'] = max(a['maxChance'], chance)

    def encounter_zones(self, version):
        return {'zones': [{'name': z, 'pokemon': [{**mon, 'areas': list(mon['areas'].values())} for mon in sorted(mons.values(), key=lambda x: x['id'])]}
                          for z, mons in self.zones[version].items()]}

    def check(self):
        """Ids unicos, y cada uid de un solo marcador (o de una sola especie)."""
        ids = [mk['id'] for mk in self.markers]
        assert len(set(ids)) == len(ids), 'ids de marcador repetidos'
        owner = {}
        for mk in self.markers:
            key = f"catch:{mk['name']}" if mk['category'] == 'Pokémon' else mk['id']
            assert owner.setdefault(mk['uid'], key) == key, 'colision de uid: cambia uid_of'

    def summary(self, areas, warps, place_list):
        counts = defaultdict(int)
        for mk in self.markers:
            counts[mk['category']] += 1
        return f'{len(areas)} areas, {len(warps)} warps, {len(place_list)} lugares, {len(self.markers)} marcadores: {dict(counts)}'


def dump(path, value):
    json.dump(value, open(path, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))


# --- Checklist -------------------------------------------------------------------------

CHECKLIST = {'Pokémon', 'Item In Map', 'Hidden Item', 'Item Gift', 'In-Game Trade', 'In-Game Gift Pokémon', 'Battle'}


def build_checklist(markers, areas, parts, source, note):
    """Checklist en el orden de la historia: `parts` son (titulo, [zonas]); las
    zonas que no aparecen van al final, en "Other areas"."""
    listed = [mk for mk in markers if mk['category'] in CHECKLIST]
    zones_used = {mk['zone'] for mk in listed}
    order = [(i + 1, z) for i, (_, zs) in enumerate(parts) for z in zs]
    known = {z for _, z in order}
    extra = sorted(zones_used - known)
    part_list = [{'n': i + 1, 'title': t} for i, (t, _) in enumerate(parts)]
    if extra:
        part_list.append({'n': len(part_list) + 1, 'title': 'Other areas'})
        order += [(len(part_list), z) for z in extra]
    # Pisos de cada zona en el orden de los mapas del juego.
    floors = defaultdict(list)
    for a in areas:
        if a['kind'] == 'interior' and a['label'] != a['zone'] and a['label'] not in floors[a['zone']]:
            floors[a['zone']].append(a['label'])
    zones = [{'name': z, 'part': n, 'count': sum(mk['zone'] == z for mk in listed),
              'floors': [f for f in floors.get(z, []) if any(mk.get('floor') == f and mk['zone'] == z for mk in listed)]}
             for n, z in order if z in zones_used]
    return {'source': source, 'note': note, 'parts': part_list, 'zones': zones,
            'markers': {mk['id']: {'zone': mk['zone'], **({'floor': mk['floor']} if mk.get('floor') and mk['floor'] != mk['zone'] else {})} for mk in listed}}
