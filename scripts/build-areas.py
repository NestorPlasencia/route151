"""Separa el mapa completo en una imagen por area: Kanto y cada piso interior.

Parte de yellow-full.png (los tiles nativos unidos, ya en el espacio de
coordenadas de los marcadores) y de yellow-interiors.json (que bloque es cada
piso y que objetos contiene). Cada area sale recortada a su caja, con todo lo
ajeno transparente, y con sus objetos y puertas en pixeles locales.

Reparto de pixeles:
- cada bloque se queda con su componente principal;
- las tiras sueltas (bordes, barandillas) se unen al bloque mas cercano;
- los fragmentos minusculos van al area cuyos pixeles tocan; las motas que no
  tocan nada (basura en el vacio) se descartan.
El recorte de cada area abarca tambien sus objetos y puertas: algunos estan fijados sobre
el vacio (el combate del Campeon, encima de la sala de Lance, cuya sala no esta
dibujada en el mapa).

Uso:  python scripts/build-areas.py
Salida: public/areas/**.png y public/data/areas.json
"""
import io, json, os, re, shutil, unicodedata

import numpy as np
from PIL import Image
from scipy import ndimage

Image.MAX_IMAGE_PIXELS = None
FULL = 'data/source-tiles/yellow-full.png'
INTERIORS = 'public/data/yellow-interiors.json'
OUT_DIR = 'public/areas'
OUT_JSON = 'public/data/areas.json'
# Interiores dibujados pegados a Kanto (comparten componente con el overworld),
# asi que la conectividad no los separa: se recortan por un rectangulo fijo.
MERGED = 'data/merged-interiors.json'
# Puertas que la fuente no trae como linea punteada (p. ej. la Safari Zone),
# para pisos que ya existen. Coordenadas en px del mapa completo.
MANUAL_DOORS = 'data/manual-doors.json'
SCALE = 8                # 1 unidad Leaflet = 8 px de imagen
NEAR = 8                 # px: una mota a esta distancia de los pixeles de un area es suya
PAD = 16                 # px de margen para objetos que caen fuera de los pixeles


def slug(text):
    text = unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', '-', text.lower()).strip('-')


def floor_order(label, order=None):
    """B4F < ... < B1F < 1F < 2F ...; lo que no es un piso va despues, salvo que
    una correccion manual fije su lugar en el recorrido (`order`)."""
    if order is not None:
        return (0, order)
    m =re.search(r'\b(B?)(\d+)F\b', label or '')
    if not m:
        return (1, 0)
    n = int(m.group(2))
    return (0, -n if m.group(1) else n)


def save_png(rgba, path):
    """PNG con paleta: los 255 colores mas usados exactos + 1 transparente.

    Estos mapas tienen pocos colores (Kanto: 322, y el 99.9% de sus pixeles usa
    67), asi que la paleta pesa ~70% menos que RGBA. Si hay mas de 255 colores,
    los sobrantes -- un punado de pixeles -- toman el color de paleta mas cercano.
    """
    visible = rgba[:, :, 3] > 0
    rgb = rgba[:, :, :3].reshape(-1, 3).astype(np.int32)
    code = (rgb[:, 0] << 16) | (rgb[:, 1] << 8) | rgb[:, 2]
    flat = visible.ravel()
    colors, inverse, counts = np.unique(code[flat], return_inverse=True, return_counts=True)
    keep = np.argsort(-counts)[:255]
    split = lambda c: np.stack([(c >> 16) & 255, (c >> 8) & 255, c & 255], 1)
    palette = split(colors[keep])
    nearest = np.argmin(((split(colors)[:, None, :] - palette[None, :, :]) ** 2).sum(2), 1)
    index = np.full(code.shape, 255, np.uint8)
    index[flat] = nearest[inverse]
    img = Image.fromarray(index.reshape(rgba.shape[:2]), 'P')
    img.putpalette(np.vstack([palette, [[0, 0, 0]]]).astype(np.uint8).ravel().tolist())
    img.save(path, optimize=True, transparency=255)
    return len(colors) - len(keep)          # colores aproximados (0 = sin perdida)


def box_px(bounds):
    (s, w), (n, e) = bounds
    return (round(-n * SCALE), round(w * SCALE), round(-s * SCALE), round(e * SCALE))


def main():
    img = np.asarray(Image.open(FULL).convert('RGBA'))
    lab, n = ndimage.label(img[:, :, 3] > 0)
    objs = ndimage.find_objects(lab)
    sizes = np.bincount(lab.ravel())
    sizes[0] = 0
    overworld = int(np.argmax(sizes))
    inter = json.load(io.open(INTERIORS, encoding='utf-8'))
    blocks = inter['blocks']

    # Componente principal de cada bloque: el que mas pixeles tiene en su caja.
    main_of, boxes = {}, {}
    for b in blocks:
        y0, x0, y1, x1 = box_px(b['bounds'])
        counts = np.bincount(lab[y0:y1, x0:x1].ravel(), minlength=n + 1)
        counts[0] = counts[overworld] = 0
        main_of[b['id']] = int(np.argmax(counts))
        boxes[b['id']] = [y0, x0, y1, x1]

    rooms = [b for b in blocks if not b.get('sliver')]
    owner = {main_of[b['id']]: b['id'] for b in rooms}

    def dist(box, y, x):
        y0, x0, y1, x1 = box
        return max(y0 - y, 0, y - y1) + max(x0 - x, 0, x - x1)

    # Las tiras se pegan al piso mas cercano y amplian su caja.
    for b in blocks:
        if not b.get('sliver'):
            continue
        y0, x0, y1, x1 = boxes[b['id']]
        cy, cx = (y0 + y1) / 2, (x0 + x1) / 2
        host = min(rooms, key=lambda r: dist(boxes[r['id']], cy, cx))['id']
        owner[main_of[b['id']]] = host
        hb = boxes[host]
        boxes[host] = [min(hb[0], y0), min(hb[1], x0), max(hb[2], y1), max(hb[3], x1)]

    KANTO = 'kanto'
    owner[overworld] = KANTO
    ids = [KANTO] + [r['id'] for r in rooms]
    index = {a: i + 1 for i, a in enumerate(ids)}

    # Fragmentos sueltos: se quedan con el area cuyos PIXELES tocan (a NEAR px
    # o menos), p. ej. un sprite suelto dentro de una sala. Mirar la caja no
    # sirve: la de Kanto abarca todo el vacio central y se tragaba las motas
    # perdidas en el. Lo que no toca nada es basura y se descarta.
    main_of_comp = np.zeros(n + 1, dtype=np.int32)
    for c, a in owner.items():
        main_of_comp[c] = index[a]
    main_map = main_of_comp[lab]
    names = {i: a for a, i in index.items()}
    stray, dropped = {}, 0
    H, W = lab.shape
    for c in range(1, n + 1):
        if c in owner:
            continue
        sy, sx = objs[c - 1]
        win = main_map[max(sy.start - NEAR, 0):min(sy.stop + NEAR, H),
                       max(sx.start - NEAR, 0):min(sx.stop + NEAR, W)]
        near = win[win > 0]
        if not near.size:
            dropped += int(sizes[c])
            continue
        home = names[int(np.bincount(near).argmax())]
        owner[c] = home
        stray[home] = stray.get(home, 0) + int(sizes[c])
    stray.setdefault(KANTO, 0)

    area_of = np.zeros(n + 1, dtype=np.int32)          # 0 = sin area
    for c, a in owner.items():
        area_of[c] = index[a]
    area_map = area_of[lab]

    markers = {m['id']: m['position'] for m in
               json.load(io.open('public/data/yellow-map.json', encoding='utf-8'))['markers']}
    kanto_ids = list(inter['overworld']['ids'])
    try:
        merged = json.load(io.open(MERGED, encoding='utf-8'))
    except FileNotFoundError:
        merged = []
    for i, m in enumerate(merged):
        x0, y0, x1, y1 = m['rect']
        fid = -(i + 1)                    # ids negativos: no chocan con componentes
        index[fid] = len(index) + 1
        win = area_map[y0:y1, x0:x1]
        win[win == index[KANTO]] = index[fid]
        inside = [k for k in kanto_ids
                  if x0 <= markers[k][1] * SCALE < x1 and y0 <= -markers[k][0] * SCALE < y1]
        kanto_ids = [k for k in kanto_ids if k not in inside]
        # La fuente no trae linea punteada para estos: la puerta se da a mano, en
        # px del mapa completo, y se pasa a [lat, lng] como las de mapLinks.
        doors = [{'at': [-m['door']['at'][1] / SCALE, m['door']['at'][0] / SCALE],
                  'to': [-m['door']['to'][1] / SCALE, m['door']['to'][0] / SCALE]}] if 'door' in m else []
        rooms.append({'id': fid, 'key': 'merged:' + m['label'], 'label': m['label'],
                      'zone': m['zone'], 'ids': inside, 'doors': doors, 'order': None})
        print('interior fusionado %s: %d objetos sacados de Kanto' % (m['label'], len(inside)))

    try:
        manual = json.load(io.open(MANUAL_DOORS, encoding='utf-8'))
    except FileNotFoundError:
        manual = []
    for m in manual:
        room = next((r for r in rooms if (r['label'] or r['zone']) == m['floor']), None)
        if room is None:
            raise SystemExit('puerta manual: no existe el piso %r' % m['floor'])
        room['doors'] = list(room['doors']) + [{'at': [-m['at'][1] / SCALE, m['at'][0] / SCALE],
                                                'to': [-m['to'][1] / SCALE, m['to'][0] / SCALE]}]
        print('puerta manual: %s' % m['floor'])

    shutil.rmtree(OUT_DIR, ignore_errors=True)

    def extract(area, path, points):
        mask = area_map == index[area]
        ys, xs = np.where(mask)
        y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
        for lat, lng in points:
            px, py = lng * SCALE, -lat * SCALE
            y0, y1 = min(y0, int(py) - PAD), max(y1, int(py) + PAD)
            x0, x1 = min(x0, int(px) - PAD), max(x1, int(px) + PAD)
        y0, x0 = max(y0, 0), max(x0, 0)
        y1, x1 = min(y1, mask.shape[0]), min(x1, mask.shape[1])
        crop = img[y0:y1, x0:x1].copy()
        crop[:, :, 3] = np.where(mask[y0:y1, x0:x1], crop[:, :, 3], 0)
        os.makedirs(os.path.dirname(f'{OUT_DIR}/{path}'), exist_ok=True)
        approx = save_png(crop, f'{OUT_DIR}/{path}')
        if approx:
            print('  %s: %d colores raros aproximados' % (path, approx))
        return int(x0), int(y0), int(x1 - x0), int(y1 - y0)

    def local(pos, x0, y0):
        lat, lng = pos
        return [round(lng * SCALE - x0, 1), round(-lat * SCALE - y0, 1)]

    kx, ky, kw, kh = extract(KANTO, 'kanto.png',
                             [markers[i] for i in kanto_ids]
                             + [d['at'] for r in rooms for d in r['doors']])
    # origin: esquina de la imagen en px del mapa completo, para convertir
    # cualquier posicion global (p. ej. las zonas del selector) a local.
    kanto = {'image': '/areas/kanto.png', 'width': kw, 'height': kh, 'origin': [kx, ky],
             'markers': [{'id': i, 'at': local(markers[i], kx, ky)}
                         for i in kanto_ids],
             'doors': []}

    groups, used = {}, set()
    for r in rooms:
        zone = r['zone'] or 'Other'
        name = r['label'] or zone
        base = f'{slug(zone)}/{slug(name)}'
        path = base if base not in used else f'{base}-{r["id"]}'
        used.add(path)
        x0, y0, w, h = extract(r['id'], f'{path}.png',
                               [markers[i] for i in r['ids']]
                               + [d['to'] for d in r['doors']])
        floor = {'id': r['id'], 'key': r['key'], 'label': name, 'order': r.get('order'),
                 'image': f'/areas/{path}.png', 'width': w, 'height': h, 'origin': [x0, y0],
                 'markers': [{'id': i, 'at': local(markers[i], x0, y0)} for i in r['ids']],
                 'exits': []}
        # Cada puerta: un pin en Kanto que entra al piso y una salida de vuelta.
        for d in r['doors']:
            floor['exits'].append({'at': local(d['to'], x0, y0),
                                   'to': local(d['at'], kx, ky)})
            kanto['doors'].append({'at': local(d['at'], kx, ky),
                                   'floor': r['id'], 'to': local(d['to'], x0, y0)})
        groups.setdefault(zone, []).append(floor)

    dungeons = []
    for zone in sorted(groups):
        floors = sorted(groups[zone], key=lambda f: floor_order(f['label'], f['order']))
        for f in floors:
            del f['order']
        dungeons.append({'zone': zone, 'slug': slug(zone), 'floors': floors})

    out = {'kanto': kanto, 'dungeons': dungeons}
    io.open(OUT_JSON, 'w', encoding='utf-8', newline='\n').write(
        json.dumps(out, ensure_ascii=False, separators=(',', ':')))

    total = len(kanto_ids) + sum(len(r['ids']) for r in rooms)
    files = [os.path.join(d, f) for d, _, fs in os.walk(OUT_DIR) for f in fs]
    print('kanto: %dx%d px, %d objetos, %d puertas, %d px sueltos absorbidos'
          % (kw, kh, len(kanto['markers']), len(kanto['doors']), stray[KANTO]))
    print('mazmorras/zonas: %d | pisos: %d | objetos en pisos: %d'
          % (len(dungeons), len(rooms), sum(len(r['ids']) for r in rooms)))
    print('objetos totales: %d (de %d) | px sueltos descartados: %d'
          % (total, len(markers), dropped))
    print('imagenes: %d, %.1f MB' % (len(files), sum(map(os.path.getsize, files)) / 1e6))


main()
