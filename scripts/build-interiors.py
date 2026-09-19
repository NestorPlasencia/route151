"""Deriva las cajas de los interiores del mapa compuesto de Pokemon Amarillo.

El mapa es una sola imagen 8192x8192 con fondo transparente: el overworld de
Kanto es un unico componente conexo y cada interior/mazmorra es un bloque
aislado. Etiquetamos componentes y volcamos sus cajas en coordenadas Leaflet
(CRS.Simple, escala 1/8) junto con los marcadores que caen dentro de cada uno.

La fuente ademas publica `interactiveMap.mapLinks`: los segmentos punteados que
unen la puerta de cada mazmorra en el mapa global con la entrada del interior.
Resolvemos cada extremo contra su componente para saber que puerta abre que
bloque.

Uso:  python scripts/build-interiors.py
Salida: public/data/yellow-interiors.json
"""
import io, json, re
from collections import Counter, defaultdict

import numpy as np
from PIL import Image
from scipy import ndimage

Image.MAX_IMAGE_PIXELS = None
SCALE = 8           # 8192 px de imagen == 1024 unidades Leaflet
MIN_PX = 1000       # por debajo de esto son fragmentos sueltos, no bloques
PLACED = ('Item In Map', 'Battle')
HIDDEN = re.compile(r'\s*\(hidden\)\s*', re.I)
LISTING = re.compile(r'[,;]')      # "Viridian, Pewter...": lista de tiendas, no un sitio
# Correcciones hechas a mano, indexadas por la esquina NO del bloque en unidades
# Leaflet: no depende del numero de componente, que cambia si cambia la imagen.
OVERRIDES = 'data/zone-overrides.json'
# yellow-full.png son los tiles nativos unidos, asi que ya esta en el espacio
# de coordenadas de marcadores y puertas. (El full.png del CDN no: va 222 px
# desplazado respecto a los tiles; por eso no se usa.)
FULL = 'data/source-tiles/yellow-full.png'



def main():
    img = np.asarray(Image.open(FULL).convert('RGBA'))
    lab, n = ndimage.label(img[:, :, 3] > 0)
    boxes = ndimage.find_objects(lab)
    sizes = ndimage.sum(img[:, :, 3] > 0, lab, range(1, n + 1))
    overworld = int(np.argmax(sizes)) + 1

    data = json.load(io.open('public/data/yellow-map.json', encoding='utf-8'))
    raw = json.load(io.open('data/yellow-completion.raw.json',
                            encoding='utf-8'))['data']

    # Alias -> nombre canonico, con el alias mas largo primero para que
    # "Cerulean Cave" gane a "Cerulean" y no se confundan zonas anidadas.
    pairs = []
    names = {l['name'] for l in data['locations']}
    for l in data['locations']:
        for a in [l['name']] + l['aliases']:
            # Un alias que ademas es una zona propia pertenece a esa zona.
            pairs.append((a, a if a in names else l['name']))
    pairs.sort(key=lambda p: -len(p[0]))

    def zones_in(text):
        text, found, spans = (text or '').lower(), set(), []
        for alias, canon in pairs:
            pat = r'(?<![a-z0-9])' + re.escape(alias.lower()) + r'(?![a-z0-9])'
            for m in re.finditer(pat, text):
                if any(m.start() < e and s < m.end() for s, e in spans):
                    continue  # ya cubierto por un alias mas largo
                spans.append((m.start(), m.end()))
                found.add(canon)
        return found

    def comp_at(lat, lng, reach=200):
        px, py = int(round(lng * SCALE)), int(round(-lat * SCALE))
        for r in range(0, reach, 6):
            w = lab[max(0, py - r):py + r + 1, max(0, px - r):px + r + 1]
            nz = w[w > 0]
            if nz.size:
                v, c = np.unique(nz, return_counts=True)
                return int(v[np.argmax(c)])
        return 0

    # Los fragmentos minusculos (<MIN_PX) no son bloques propios: absorbemos sus
    # marcadores en el bloque significativo mas cercano para no perder ninguno.
    big = {i + 1 for i in range(n) if sizes[i] >= MIN_PX}
    centers = {c: ((boxes[c - 1][0].start + boxes[c - 1][0].stop) / 2,
                   (boxes[c - 1][1].start + boxes[c - 1][1].stop) / 2)
               for c in big}

    def resolve(lat, lng):
        c = comp_at(lat, lng)
        if c in big:
            return c
        py, px = -lat * SCALE, lng * SCALE
        return min(big, key=lambda k: (centers[k][0] - py) ** 2
                                      + (centers[k][1] - px) ** 2)

    members = defaultdict(list)
    for m in data['markers']:
        members[resolve(*m['position'])].append(m)

    # Puertas: un extremo en el overworld, el otro dentro de un interior.
    doors = defaultdict(list)
    for a, b in raw['interactiveMap']['mapLinks']:
        ca, cb = resolve(*a), resolve(*b)
        if (ca == overworld) == (cb == overworld):
            continue  # overworld<->overworld o interior<->interior
        if ca == overworld:
            doors[cb].append({'at': a, 'to': b})
        else:
            doors[ca].append({'at': b, 'to': a})

    try:
        overrides = json.load(io.open(OVERRIDES, encoding='utf-8'))
    except FileNotFoundError:
        overrides = {}

    blocks, orphans = [], len(members.get(0, []))
    for cid in sorted(big):
        if cid == overworld:
            continue
        ms = members.get(cid, [])
        sets = [s for s in (zones_in(m['location']) for m in ms) if s]
        inter = set.intersection(*sets) if sets else set()
        votes = Counter(z for s in sets for z in s)
        if len(inter) == 1:
            zone, sure = inter.pop(), True
        elif inter:
            zone, sure = max(inter, key=lambda z: votes[z]), True
        elif votes:
            zone, sure = votes.most_common(1)[0][0], False
        else:
            zone, sure = None, False
        # Los objetos colocados en el mapa y los combates nombran el sitio exacto
        # donde estan ("Silph Co. 7F"), a diferencia de los Pokemon, que listan
        # todas las zonas donde aparece la especie. Si hay, mandan ellos.
        placed = Counter(HIDDEN.sub('', m['location']).strip() for m in ms
                         if m['category'] in PLACED and m['location']
                         and not LISTING.search(m['location']))
        label = placed.most_common(1)[0][0] if placed else zone
        if placed:
            named = zones_in(label)
            if len(named) == 1:
                zone = named.pop()
            sure = True
        sy, sx = boxes[cid - 1]
        key = '%.2f,%.2f' % (-sy.start / SCALE, sx.start / SCALE)
        fix = overrides.get(key)
        order = None
        if fix:
            label, zone, sure = fix['label'], fix.get('zone', zone), True
            order = fix.get('order')    # recorrido del juego cuando no hay pisos
        blocks.append({
            'id': cid,
            'key': key,
            'label': label,
            'zone': zone,
            'certain': sure,
            'order': order,
            # Leaflet CRS.Simple: lat crece hacia arriba, de ahi el signo.
            'bounds': [[-sy.stop / SCALE, sx.start / SCALE],
                       [-sy.start / SCALE, sx.stop / SCALE]],
            'ids': sorted(m['id'] for m in ms),
            'doors': doors.get(cid, []),
            # Tiras de 1-2 unidades de grosor: bordes de muro o barandillas
            # separados por un pixel transparente, no habitaciones.
            'sliver': min(sy.stop - sy.start, sx.stop - sx.start) <= 2 * SCALE,
        })
    blocks.sort(key=lambda b: (b['zone'] or '~~', -len(b['ids'])))

    sy, sx = boxes[overworld - 1]
    out = {
        'overworld': {
            'bounds': [[-sy.stop / SCALE, sx.start / SCALE],
                       [-sy.start / SCALE, sx.stop / SCALE]],
            'ids': sorted(m['id'] for m in members[overworld]),
        },
        'blocks': blocks,
    }
    io.open('public/data/yellow-interiors.json', 'w', encoding='utf-8',
            newline='\n').write(json.dumps(out, ensure_ascii=False))

    hidden = sum(len(b['ids']) for b in blocks)
    print('componentes: %d | bloques interiores: %d (con marcadores: %d)'
          % (n, len(blocks), sum(1 for b in blocks if b['ids'])))
    print('marcadores overworld: %d | ocultos en interiores: %d | sin bloque: %d'
          % (len(out['overworld']['ids']), hidden, orphans))
    print('zonas con interior: %d | bloques con zona dudosa: %d'
          % (len({b['zone'] for b in blocks if b['zone']}),
             sum(1 for b in blocks if not b['certain'])))
    print('bloques con puerta: %d | puertas totales: %d'
          % (sum(1 for b in blocks if b['doors']),
             sum(len(b['doors']) for b in blocks)))
    # `uid` se repite entre instancias del mismo objeto/Pokemon, asi que el
    # reparto se indexa por `id`, que si es unico por marcador.
    assert len(out['overworld']['ids']) + hidden == len(data['markers']),         'se perdieron marcadores'

main()
