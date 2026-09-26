"""Genera la Pokedex de Pokemon Yellow desde pret/pokeyellow y sus marcadores.

Igual que build-frlg-dex.py, pero todo sale del propio juego:
- nombres, tipos, figuritas (su sprite en color) y evoluciones: del juego;
- donde se encuentra: los marcadores cuya figurita es la especie (salvaje,
  fijo, regalo o intercambio), por zona y en orden de juego;
- si no tiene marcador: "evoluciona de" si su preevolucion se consigue; si no,
  hay que traerla de Red o Blue.

Yellow tiene un caso propio: el Pikachu que te da Oak no acepta la Piedra
Trueno y no hay otro en el juego, asi que Raichu tambien hay que traerlo.

Uso:  python scripts/yellow/build-yellow-dex.py   (despues de build-yellow.py)
Salida: public/yellow/data/pokedex-yellow.json
"""
import io, json, os, re, sys

sys.path.insert(0, os.path.dirname(__file__))
import decomp as d

DATA = 'public/yellow/data'
STONES = {'MOON_STONE': 'Moon Stone', 'FIRE_STONE': 'Fire Stone', 'WATER_STONE': 'Water Stone',
          'THUNDER_STONE': 'Thunder Stone', 'LEAF_STONE': 'Leaf Stone'}
# Especies que se consiguen pero no por la via normal (ver arriba).
REFUSES = {26: 'Your Pikachu refuses the Thunder Stone: trade a Raichu over from Red or Blue.'}


def how(m):
    if m['category'] == 'In-Game Trade':
        return 'Trade'
    if m['category'] == 'In-Game Gift Pokémon':
        return 'Gift'
    return 'Static' if 'Static encounter' in m['encounter']['methods'] else 'Wild'


def number(m):
    icon = m.get('icon') or ''
    return int(icon[len('yellow/pokemon/p'):-4]) if icon.startswith('yellow/pokemon/p') else None


def main():
    numbers, names = d.dex_numbers(), d.species_names()

    # Tipos de cada especie (PSYCHIC_TYPE -> psychic).
    types = {}
    for f in os.listdir(d.path('data/pokemon/base_stats')):
        text = d.read('data/pokemon/base_stats', f)
        dex = re.search(r'db DEX_(\w+)', text).group(1)
        a, b = re.search(r'db (\w+), (\w+) ; type', text).groups()
        types[numbers[dex]] = list(dict.fromkeys(t.removesuffix('_TYPE').lower() for t in (a, b)))

    # Evoluciones: la tabla de punteros va en el orden interno de las especies.
    internal = d.internal_order()
    text = d.read('data/pokemon/evos_moves.asm')
    pointers = re.findall(r'dw (\w+)EvosMoves', text)
    bodies = dict(re.findall(r'^(\w+)EvosMoves:\n(.*?)(?=^\w+EvosMoves:|\Z)', text, re.M | re.S))
    evolves = {}  # numero -> (de quien, como)
    for species, label in zip(internal, pointers):
        if species not in numbers:
            continue
        evos = bodies.get(label, '').split('db 0')[0]
        for kind, rest in re.findall(r'db EVOLVE_(LEVEL|ITEM|TRADE), (.+)', evos):
            args = [a.strip() for a in rest.split(';')[0].split(',')]
            into = numbers.get(args[-1])
            if not into:
                continue
            method = f'level {args[0]}' if kind == 'LEVEL' else STONES.get(args[0], args[0].title()) if kind == 'ITEM' else 'trade'
            evolves[into] = (numbers[species], method)

    markers = json.load(io.open(f'{DATA}/markers.json', encoding='utf-8'))
    check = json.load(io.open(f'{DATA}/checklist.json', encoding='utf-8'))
    rank = {z['name']: i for i, z in enumerate(check['zones'])}
    found_in = {}
    for m in markers:
        if m['category'] in ('Pokémon', 'In-Game Gift Pokémon', 'In-Game Trade') and number(m):
            found_in.setdefault(number(m), []).append(m)

    entries = {}
    for n in range(1, 152):
        found = {}
        for m in found_in.get(n, []):
            zone = check['markers'].get(m['id'], {}).get('zone', m['zone'])
            found.setdefault((zone, how(m)), []).append(m['id'])
        prev = evolves.get(n)
        entries[n] = {'n': n, 'name': names[n], 'icon': f'yellow/pokemon/p{n}.png', 'types': types[n],
                      'found': [{'zone': z, 'how': h, 'ids': ids} for (z, h), ids in sorted(found.items(), key=lambda kv: rank.get(kv[0][0], 999))],
                      'from': {'n': prev[0], 'method': prev[1]} if prev else None}

    def available(n):
        e = entries[n]
        return bool(e['found']) or (n not in REFUSES and bool(e['from'] and available(e['from']['n'])))
    for e in entries.values():
        e['get'] = 'found' if e['found'] else 'evo' if available(e['n']) else 'none'
        if e['get'] == 'none':
            e['note'] = REFUSES.get(e['n'], 'Not found in Yellow: trade it over from Red or Blue.')

    out = [entries[n] for n in sorted(entries)]
    io.open(f'{DATA}/pokedex-yellow.json', 'w', encoding='utf-8', newline='\n').write(
        json.dumps({'source': 'https://github.com/pret/pokeyellow', 'species': out}, ensure_ascii=False, separators=(',', ':')))
    by = {}
    for e in out:
        by.setdefault(e['get'], []).append(e['name'])
    print(f'Yellow: {len(out)} especies | con marcador {len(by.get("found", []))} | por evolucion {len(by.get("evo", []))} | '
          f'no disponibles {len(by.get("none", []))}: {", ".join(by.get("none", []))}')


if __name__ == '__main__':
    main()
