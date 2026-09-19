"""Genera la Pokedex de FireRed y de LeafGreen (una por version).

Especies: la Pokedex de Kanto (1-151) mas las de Johto que se pueden atrapar en
las Islas Sete, con sus evoluciones.
- Donde se encuentra: los marcadores de esa version cuya figurita es la especie
  (salvaje, fijo, regalo o intercambio), por zona y en orden de juego.
- Si no tiene marcador: si su preevolucion se consigue, "evoluciona de"; si
  solo sale en la otra version, se indica; si no, no esta disponible.
Nombres, tipos y evoluciones salen de PokeAPI (igual que build-pokedex.py de
Yellow); tambien se descargan las figuritas que falten.

Uso:  python scripts/frlg/build-frlg-dex.py   (despues de build-frlg.py)
Salida: public/frlg/data/pokedex-{firered,leafgreen}.json y public/icons/pokemon/p{n}.png
"""
import io, json, os, urllib.request
from concurrent.futures import ThreadPoolExecutor

API = 'https://pokeapi.co/api/v2'
ICON = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-vii/icons/{}.png'
DATA = 'public/frlg/data'
VERSIONS = {'firered': 'FireRed', 'leafgreen': 'LeafGreen'}
ITEMS = {'moon-stone': 'Moon Stone', 'fire-stone': 'Fire Stone', 'water-stone': 'Water Stone',
         'thunder-stone': 'Thunder Stone', 'leaf-stone': 'Leaf Stone', 'sun-stone': 'Sun Stone'}


def how(m):
    if m['category'] == 'In-Game Trade':
        return 'Trade'
    if m['category'] == 'In-Game Gift Pokémon':
        return 'Gift'
    return 'Static' if 'Static encounter' in m['encounter']['methods'] else 'Wild'


def get(url):
    req = urllib.request.Request(url, headers={'user-agent': 'Ruta151 pokedex sync'})
    return json.loads(urllib.request.urlopen(req, timeout=30).read())


def num(url):
    return int(url.rstrip('/').rsplit('/', 1)[1])


def number(m):
    icon = m.get('icon') or ''
    return int(icon[len('pokemon/p'):-4]) if icon.startswith('pokemon/p') else None


def main():
    markers = json.load(io.open(f'{DATA}/markers.json', encoding='utf-8'))
    check = json.load(io.open(f'{DATA}/checklist.json', encoding='utf-8'))
    rank = {z['name']: i for i, z in enumerate(check['zones'])}
    mons = [m for m in markers if m['category'] in ('Pokémon', 'In-Game Gift Pokémon', 'In-Game Trade') and number(m)]

    # Kanto completo mas lo que se atrapa en las Islas Sete (Johto).
    wanted = set(range(1, 152)) | {number(m) for m in mons}
    with ThreadPoolExecutor(8) as pool:
        species = {s['id']: s for s in pool.map(lambda n: get(f'{API}/pokemon-species/{n}'), sorted(wanted))}
        chains = {c['id']: c for c in pool.map(get, {s['evolution_chain']['url'] for s in species.values()})}

    # Evoluciones de lo que se consigue, dentro de las dos primeras generaciones.
    method, family = {}, {}

    def walk(node, root):
        for nxt in node['evolves_to']:
            n = num(nxt['species']['url'])
            d = (nxt['evolution_details'] or [{}])[0]
            trig = (d.get('trigger') or {}).get('name')
            if trig == 'level-up' and d.get('min_level'):
                method[n] = 'level %d' % d['min_level']
            elif trig == 'use-item':
                method[n] = ITEMS.get(d['item']['name'], d['item']['name'].replace('-', ' ').title())
            elif trig == 'trade':
                method[n] = 'trade'
            else:
                method[n] = 'level up'
            family.setdefault(root, []).append(n)
            walk(nxt, root)
    for c in chains.values():
        walk(c['chain'], num(c['chain']['species']['url']))
    johto = {n for n in wanted if n > 151}
    for root, members in family.items():
        if root in johto or any(m in johto for m in members):
            wanted |= {m for m in members if m <= 251}
    wanted |= {num(c['chain']['species']['url']) for c in chains.values() if num(c['chain']['species']['url']) in johto}
    missing = sorted(wanted - set(species))
    with ThreadPoolExecutor(8) as pool:
        species.update({s['id']: s for s in pool.map(lambda n: get(f'{API}/pokemon-species/{n}'), missing)})
        types = dict(zip(sorted(wanted), pool.map(lambda n: [t['type']['name'] for t in get(f'{API}/pokemon/{n}')['types']], sorted(wanted))))

    found_in = {v: {} for v in VERSIONS}
    for m in mons:
        for v in VERSIONS:
            if m.get('version') in (None, v):
                found_in[v].setdefault(number(m), []).append(m)

    def build(v):
        entries = {}
        for n in sorted(wanted):
            s = species[n]
            found = {}
            for m in found_in[v].get(n, []):
                zone = check['markers'].get(m['id'], {}).get('zone', m['zone'])
                found.setdefault((zone, how(m)), []).append(m['id'])
            prev = s['evolves_from_species']
            prev = num(prev['url']) if prev else None
            entries[n] = {'n': n, 'name': next(x['name'] for x in s['names'] if x['language']['name'] == 'en'),
                          'icon': f'pokemon/p{n}.png', 'types': types[n],
                          'found': [{'zone': z, 'how': h, 'ids': ids} for (z, h), ids in sorted(found.items(), key=lambda kv: rank.get(kv[0][0], 999))],
                          'from': {'n': prev, 'method': method.get(n)} if prev in wanted else None}

        def available(n):
            e = entries[n]
            return bool(e['found']) or bool(e['from'] and available(e['from']['n']))
        for e in entries.values():
            e['get'] = 'found' if e['found'] else 'evo' if available(e['n']) else 'none'
        return entries

    dex = {v: build(v) for v in VERSIONS}
    for v, label in VERSIONS.items():
        other = next(o for o in VERSIONS if o != v)
        entries = dex[v]
        for e in entries.values():
            if e['get'] == 'none':
                e['note'] = (f'Only in {VERSIONS[other]}: trade it over.' if dex[other][e['n']]['get'] != 'none'
                             else f'Not found in {label}: trade it over from another game.')
        out = [entries[n] for n in sorted(entries)]
        io.open(f'{DATA}/pokedex-{v}.json', 'w', encoding='utf-8', newline='\n').write(
            json.dumps({'source': API, 'species': out}, ensure_ascii=False, separators=(',', ':')))
        by = {}
        for e in out:
            by.setdefault(e['get'], []).append(e['name'])
        print(f'{label}: {len(out)} especies | con marcador {len(by.get("found", []))} | por evolucion {len(by.get("evo", []))} | no disponibles {len(by.get("none", []))}')

    os.makedirs('public/icons/pokemon', exist_ok=True)
    fetched = 0
    for n in sorted(wanted):
        p = f'public/icons/pokemon/p{n}.png'
        if not os.path.exists(p):
            urllib.request.urlretrieve(ICON.format(n), p)
            fetched += 1
    print('figuritas nuevas descargadas: %d' % fetched)


if __name__ == '__main__':
    main()
