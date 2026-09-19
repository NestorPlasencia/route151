"""Asigna cada objeto a una zona y ordena las zonas segun el recorrido del juego.

Orden: las 17 partes del recorrido de Bulbapedia para Pokemon Amarillo
(https://bulbapedia.bulbagarden.net/wiki/Appendix:Yellow_walkthrough). Una zona
que el recorrido visita dos veces (Route 2, Route 10, Route 20) va en su primera
aparicion; Route 22 va con Victory Road, donde se completa.

Zona de cada objeto:
- dentro de una mazmorra o edificio: la zona de su piso (areas.json), y el piso
  como subseccion; el Gimnasio de Viridian es seccion propia porque se hace al
  final (parte 14), no al pasar por la ciudad;
- en Kanto: el lugar que nombra su texto ("Route 13 (Hidden)"); si nombra
  varios (los Pokemon listan todas sus rutas), el mas cercano de ellos; si no
  nombra ninguno, el lugar de Kanto mas cercano.

Uso:  python scripts/build-checklist.py
Salida: public/data/checklist.json
"""
import io, json, re

PARTS = [
    ('Pallet Town', ['Pallet Town']),
    ('Route 1 → Route 2', ['Route 1', 'Viridian City', 'Route 2']),
    ('Viridian Forest → Pewter City', ['Viridian Forest', 'Pewter City']),
    ('Route 3 → Mt. Moon → Route 4', ['Route 3', 'Mt. Moon', 'Route 4']),
    ('Cerulean City → Underground Path', ['Cerulean City', 'Route 24', 'Route 25', 'Route 5',
                                          'Underground Path (Rte 5-6)']),
    ('Route 6 → S.S. Anne', ['Route 6', 'Vermilion City', 'S.S. Anne']),
    ('Route 11 → Route 10', ['Route 11', "Diglett's Cave", 'Route 9', 'Route 10']),
    ('Rock Tunnel → Route 7', ['Rock Tunnel', 'Lavender Town', 'Route 8',
                               'Underground Path (Rte 7-8)', 'Route 7']),
    ('Celadon City → Pokémon Tower', ['Celadon City', 'Team Rocket Hideout', 'Pokémon Tower']),
    ('Saffron City → Silph Co.', ['Saffron City', 'Silph Co.']),
    ('Cycling Road → Safari Zone', ['Route 16', 'Route 17', 'Route 18', 'Fuchsia City',
                                    'Safari Zone']),
    ('Route 12 → Seafoam Islands', ['Route 12', 'Route 13', 'Route 14', 'Route 15', 'Route 19',
                                    'Route 20', 'Seafoam Islands']),
    ('Cinnabar Island → Route 21', ['Cinnabar Island', 'Pokémon Mansion', 'Route 21']),
    ('Power Plant → Viridian Gym', ['Power Plant', 'Viridian Gym']),
    ('Route 22 → Victory Road', ['Route 22', 'Route 23', 'Victory Road']),
    ('Indigo Plateau', ['Indigo Plateau']),
    ('Cerulean Cave', ['Cerulean Cave']),
]
# Pisos que forman seccion propia en vez de ir con su zona.
OWN_SECTION = {'Viridian Gym': 'Viridian Gym'}
PLACED = re.compile(r'\s*\(hidden\)\s*', re.I)


def floor_rank(label):
    """Orden de visita dentro de una mazmorra: 1F, pisos altos, y luego sotanos."""
    m = re.search(r'\b(B?)(\d+)F\b', label)
    if not m:
        return (3, 0)
    n = int(m.group(2))
    if m.group(1):
        return (2, n)          # B1F, B2F...
    return (0 if n == 1 else 1, n)


def main():
    data = json.load(io.open('public/data/yellow-map.json', encoding='utf-8'))
    areas = json.load(io.open('public/data/areas.json', encoding='utf-8'))
    order = [z for _, zs in PARTS for z in zs]
    part_of = {z: i + 1 for i, (_, zs) in enumerate(PARTS) for z in zs}
    names = {l['name'] for l in data['locations']}
    missing = names - set(order)
    assert not missing, 'zonas sin parte: %s' % missing

    # Alias mas largo primero, para que "Cerulean Cave" gane a "Cerulean".
    pairs = sorted(((a, l['name']) for l in data['locations'] for a in [l['name']] + l['aliases']),
                   key=lambda p: -len(p[0]))

    def zones_in(text):
        text, found, spans = (text or '').lower(), [], []
        for alias, canon in pairs:
            for m in re.finditer(r'(?<![a-z0-9])' + re.escape(alias.lower()) + r'(?![a-z0-9])', text):
                if any(m.start() < e and s < m.end() for s, e in spans):
                    continue
                spans.append((m.start(), m.end()))
                if canon not in found:
                    found.append(canon)
        return found

    # Lugares de Kanto, en px del mapa completo: los que no caen dentro de un
    # piso. (No vale excluir por nombre de zona: las ciudades con gimnasio
    # tambien tienen interiores y se quedarian fuera.)
    boxes = [(f['origin'][0], f['origin'][1], f['width'], f['height'])
             for d in areas['dungeons'] for f in d['floors']]
    inside = lambda x, y: any(bx <= x < bx + w and by <= y < by + h for bx, by, w, h in boxes)
    places = {l['name']: (l['position'][1] * 8, -l['position'][0] * 8) for l in data['locations']}
    places = {k: v for k, v in places.items() if not inside(*v)}
    pos = {m['id']: (m['position'][1] * 8, -m['position'][0] * 8) for m in data['markers']}
    byid = {m['id']: m for m in data['markers']}

    def nearest(p, among):
        return min(among, key=lambda z: (places[z][0] - p[0]) ** 2 + (places[z][1] - p[1]) ** 2)

    out, floors_of = {}, {}
    # En empate (salas sin numero de piso) manda el orden de areas.json, que ya
    # recoge el recorrido fijado a mano (p. ej. las salas del Alto Mando).
    seen = {f['label']: i for i, f in enumerate(f for d in areas['dungeons'] for f in d['floors'])}
    for m in areas['kanto']['markers']:
        mk = byid[m['id']]
        named = [z for z in zones_in(PLACED.sub('', mk['location'])) if z in places]
        zone = named[0] if len(named) == 1 else nearest(pos[m['id']], named or list(places))
        out[m['id']] = {'zone': zone}
    for d in areas['dungeons']:
        for f in d['floors']:
            zone = OWN_SECTION.get(f['label'], d['zone'])
            floors_of.setdefault(zone, set()).add(f['label'])
            for m in f['markers']:
                out[m['id']] = {'zone': zone, 'floor': f['label']}

    zones = []
    for z in order:
        count = sum(1 for v in out.values() if v['zone'] == z)
        zones.append({'name': z, 'part': part_of[z], 'count': count,
                      'floors': sorted(floors_of.get(z, ()), key=lambda l: (floor_rank(l), seen[l]))})
    result = {'source': 'https://bulbapedia.bulbagarden.net/wiki/Appendix:Yellow_walkthrough',
              'parts': [{'n': i + 1, 'title': t} for i, (t, _) in enumerate(PARTS)],
              'zones': zones, 'markers': out}
    io.open('public/data/checklist.json', 'w', encoding='utf-8', newline='\n').write(
        json.dumps(result, ensure_ascii=False, separators=(',', ':')))

    print('objetos asignados: %d de %d' % (len(out), len(data['markers'])))
    empty = [z['name'] for z in zones if not z['count']]
    print('zonas: %d | sin objetos: %s' % (len(zones), ', '.join(empty) or 'ninguna'))
    for z in zones:
        if z['floors']:
            print('  %-24s %s' % (z['name'], ' > '.join(z['floors'])))


main()
