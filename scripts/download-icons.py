"""Descarga las figuritas de los marcadores desde el repositorio de sprites de PokeAPI.

Los marcadores traen `icon` como ruta relativa ("pokemon/p1.png",
"item/Coin_Case.png"). Se guarda cada icono en public/icons/ con esa misma ruta,
asi el cliente solo antepone "/icons/".

- Pokemon: iconos de menu (generation-vii/icons), el formato "figurita".
- Objetos: sprites de objeto, con el nombre pasado al slug de PokeAPI.

Uso:  python scripts/download-icons.py
"""
import io, json, os, urllib.error, urllib.request
from concurrent.futures import ThreadPoolExecutor

SPRITES = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites'
OUT = 'public/icons'
# Nombres del sitio que no coinciden con el slug de PokeAPI.
ITEM_SLUGS = {'SS_Ticket': 'ss-ticket', 'Parcel': 'oaks-parcel',
              'Itemfinder': 'dowsing-machine', 'TM_Normal': 'tm-normal'}


def sources(icon):
    kind, name = icon.split('/', 1)
    name = name.rsplit('.', 1)[0]
    if kind == 'pokemon':
        n = name.lstrip('p')
        return [f'{SPRITES}/pokemon/versions/generation-vii/icons/{n}.png',
                f'{SPRITES}/pokemon/{n}.png']
    slug = ITEM_SLUGS.get(name, name.lower().replace('_', '-'))
    return [f'{SPRITES}/items/{slug}.png']


def fetch(icon):
    path = f'{OUT}/{icon}'
    if os.path.exists(path):
        return icon, 'cache'
    for url in sources(icon):
        try:
            data = urllib.request.urlopen(url, timeout=30).read()
        except urllib.error.HTTPError:
            continue
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'wb') as f:
            f.write(data)
        return icon, 'ok' if url == sources(icon)[0] else 'alternativa'
    return icon, 'falta'


def main():
    markers = json.load(io.open('public/data/yellow-map.json', encoding='utf-8'))['markers']
    icons = sorted({m['icon'] for m in markers if m.get('icon')})
    with ThreadPoolExecutor(8) as pool:
        results = list(pool.map(fetch, icons))
    by = {}
    for icon, state in results:
        by.setdefault(state, []).append(icon)
    for state, items in sorted(by.items()):
        print('%-11s %3d' % (state, len(items)), '' if state in ('ok', 'cache') else items)


main()
