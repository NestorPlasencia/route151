"""Genera la Pokedex de Amarillo: las 151 especies y como conseguir cada una.

- Donde se encuentra: los marcadores cuya figurita es esa especie (salvaje,
  regalo, intercambio...), con su zona segun checklist.json, en orden de juego.
- Si no tiene marcador: si su preevolucion se puede conseguir, "evoluciona de";
  si no, no esta disponible en Amarillo (hay que traerla por intercambio).
Nombres, tipos y evoluciones salen de PokeAPI; tambien se descargan las
figuritas de las especies que no tienen ningun marcador.

Uso:  python scripts/build-pokedex.py
Salida: public/data/pokedex.json y public/icons/pokemon/p{n}.png
"""
import io, json, os, re, urllib.request
from concurrent.futures import ThreadPoolExecutor

API = 'https://pokeapi.co/api/v2'
ICON = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-vii/icons/{}.png'
HOW = {'Pokémon': 'Wild', 'In-Game Gift Pokémon': 'Gift', 'In-Game Trade': 'Trade',
       'Miscellaneous Task': 'Event'}
ITEMS = {'moon-stone': 'Moon Stone', 'fire-stone': 'Fire Stone', 'water-stone': 'Water Stone',
         'thunder-stone': 'Thunder Stone', 'leaf-stone': 'Leaf Stone'}
# La categoria 'Pokémon' mezcla salvajes con regalos y fosiles; su texto lo aclara.
KIND = [(re.compile(r'^(Received|Starter)'), 'Gift'), (re.compile(r'^Revive'), 'Fossil'),
        (re.compile(r'^Trade'), 'Trade'), (re.compile(r'^Fighting Dojo'), 'Gift')]


def how(m):
    if m['category'] != 'Pokémon':
        return HOW.get(m['category'], m['category'])
    return next((k for rx, k in KIND if rx.search(m['location'] or '')), 'Wild')


# Rarezas de Amarillo que PokeAPI no refleja.
NOTES = {26: 'Your Pikachu refuses to evolve in Yellow and there is no other one: trade only.'}


def get(url):
    req = urllib.request.Request(url, headers={'user-agent': 'Ruta151 pokedex sync'})
    return json.loads(urllib.request.urlopen(req, timeout=30).read())


def num(url):
    return int(url.rstrip('/').rsplit('/', 1)[1])


def main():
    data = json.load(io.open('public/data/yellow-map.json', encoding='utf-8'))
    check = json.load(io.open('public/data/checklist.json', encoding='utf-8'))
    rank = {z['name']: i for i, z in enumerate(check['zones'])}

    with ThreadPoolExecutor(8) as pool:
        species = list(pool.map(lambda n: get(f'{API}/pokemon-species/{n}'), range(1, 152)))
        mons = list(pool.map(lambda n: get(f'{API}/pokemon/{n}'), range(1, 152)))
        chains = {c['id']: c for c in pool.map(get, {s['evolution_chain']['url'] for s in species})}

    # Metodo con el que cada especie evoluciona desde su preevolucion.
    method = {}

    def walk(node):
        for nxt in node['evolves_to']:
            d = (nxt['evolution_details'] or [{}])[0]
            trig = (d.get('trigger') or {}).get('name')
            if trig == 'level-up' and d.get('min_level'):
                how = 'level %d' % d['min_level']
            elif trig == 'use-item':
                how = ITEMS.get(d['item']['name'], d['item']['name'])
            elif trig == 'trade':
                how = 'trade'
            else:
                how = 'level up'
            method[num(nxt['species']['url'])] = how
            walk(nxt)
    for c in chains.values():
        walk(c['chain'])

    ids_of = {}
    for m in data['markers']:
        if (m.get('icon') or '').startswith('pokemon/p'):
            n = int(m['icon'][len('pokemon/p'):-4])
            ids_of.setdefault(n, []).append(m)

    entries = {}
    for s, p in zip(species, mons):
        n = s['id']
        name = next(x['name'] for x in s['names'] if x['language']['name'] == 'en')
        found = {}
        for m in ids_of.get(n, []):
            zone = check['markers'][m['id']]['zone']
            key = (zone, how(m))
            found.setdefault(key, []).append(m['id'])
        prev = s['evolves_from_species']
        prev = num(prev['url']) if prev else None
        entries[n] = {'n': n, 'name': name, 'icon': f'pokemon/p{n}.png',
                      'types': [t['type']['name'] for t in p['types']],
                      'found': [{'zone': z, 'how': h, 'ids': ids}
                                for (z, h), ids in sorted(found.items(), key=lambda kv: rank[kv[0][0]])],
                      'from': {'n': prev, 'method': method.get(n)} if prev and prev <= 151 else None}
        if n in NOTES:
            entries[n]['note'] = NOTES[n]

    # Disponible si tiene marcador o si su preevolucion lo esta (en cadena).
    def available(n):
        e = entries[n]
        if n in NOTES:
            return False
        return bool(e['found']) or bool(e['from'] and available(e['from']['n']))
    for e in entries.values():
        e['get'] = 'found' if e['found'] else 'evo' if available(e['n']) else 'none'

    os.makedirs('public/icons/pokemon', exist_ok=True)
    fetched = 0
    for n in entries:
        path = f'public/icons/pokemon/p{n}.png'
        if not os.path.exists(path):
            urllib.request.urlretrieve(ICON.format(n), path)
            fetched += 1

    out = [entries[n] for n in sorted(entries)]
    io.open('public/data/pokedex.json', 'w', encoding='utf-8', newline='\n').write(
        json.dumps({'source': API, 'species': out}, ensure_ascii=False, separators=(',', ':')))
    by = {}
    for e in out:
        by.setdefault(e['get'], []).append(e['name'])
    print('especies: %d | con marcador: %d | por evolucion: %d | no disponibles: %d'
          % (len(out), len(by.get('found', [])), len(by.get('evo', [])), len(by.get('none', []))))
    print('no disponibles en Amarillo:', ', '.join(by.get('none', [])))
    print('figuritas nuevas descargadas: %d' % fetched)


main()
