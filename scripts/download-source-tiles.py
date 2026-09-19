"""Descarga el juego de tiles original del mapa de Pokemon Amarillo.

Patron: https://pokemonmap.b-cdn.net/yellow/{z}_{x}_{y}.png?v=1
El nivel z cubre 8192 >> (z - 1) px con tiles de 512, asi que la rejilla es
16x16 en z=1 (resolucion nativa) y se reduce a la mitad hasta 1x1 en z=5.
Los tiles vacios devuelven 404 y simplemente no existen en el origen.

Despues une los 256 tiles nativos (z=1) en una sola imagen de 8192x8192:
yellow-full.png, la fuente de la que salen todos los mapas de la app. Esta
imagen ya esta en el espacio de coordenadas de marcadores y puertas.

Uso:  python scripts/download-source-tiles.py
Salida: data/source-tiles/tiles/{z}_{x}_{y}.png, data/source-tiles/yellow-full.png
        y una copia en public/maps/yellow-full.png (la usa /full-map)
"""
import os, shutil, urllib.error, urllib.request
from concurrent.futures import ThreadPoolExecutor

from PIL import Image

URL = 'https://pokemonmap.b-cdn.net/yellow/{z}_{x}_{y}.png?v=1'
OUT = 'data/source-tiles/tiles'
FULL = 'data/source-tiles/yellow-full.png'
PUBLIC = 'public/maps/yellow-full.png'
LEVELS = {1: 16, 2: 8, 3: 4, 4: 2, 5: 1}   # z -> tiles por lado


def fetch(job):
    z, x, y = job
    path = f'{OUT}/{z}_{x}_{y}.png'
    if os.path.exists(path):
        return 'cached'
    try:
        req = urllib.request.Request(URL.format(z=z, x=x, y=y),
                                     headers={'user-agent': 'Ruta151 tile sync'})
        data = urllib.request.urlopen(req, timeout=30).read()
    except urllib.error.HTTPError as e:
        return 'missing' if e.code == 404 else f'error {e.code}'
    with open(path, 'wb') as f:
        f.write(data)
    return 'ok'


def main():
    os.makedirs(OUT, exist_ok=True)
    jobs = [(z, x, y) for z, n in LEVELS.items()
            for y in range(n) for x in range(n)]
    with ThreadPoolExecutor(8) as pool:
        results = list(pool.map(fetch, jobs))
    for z, n in LEVELS.items():
        mine = [r for (jz, _, _), r in zip(jobs, results) if jz == z]
        print('z=%d  %3d tiles: %3d descargados, %3d en cache, %3d vacios (404)%s'
              % (z, n * n, mine.count('ok'), mine.count('cached'),
                 mine.count('missing'),
                 '' if all(r in ('ok', 'cached', 'missing') for r in mine)
                 else '  ERRORES: %s' % [r for r in mine if r.startswith('error')]))
    size = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
    print('total: %d archivos, %.1f MB en %s' % (len(os.listdir(OUT)), size / 1e6, OUT))

    # RGBA y no paleta: cada tile trae su propia paleta y juntos pasan de 256
    # colores, asi que cuantizar perderia informacion.
    n = LEVELS[1]
    full = Image.new('RGBA', (n * 512, n * 512), (0, 0, 0, 0))
    for y in range(n):
        for x in range(n):
            full.paste(Image.open(f'{OUT}/1_{x}_{y}.png').convert('RGBA'), (x * 512, y * 512))
    full.save(FULL, optimize=True)
    os.makedirs(os.path.dirname(PUBLIC), exist_ok=True)
    shutil.copyfile(FULL, PUBLIC)
    print('%s: %dx%d, %.1f MB (copiado a %s)' % (FULL, full.width, full.height,
                                                os.path.getsize(FULL) / 1e6, PUBLIC))


main()
