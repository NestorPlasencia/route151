"""Genera la Pokedex de un juego de la Gen 1 desde su decompilacion y sus
marcadores: una por version (Yellow; Red y Blue).

Igual que build-frlg-dex.py, pero todo sale del propio juego:
- nombres, tipos, figuritas (su sprite en color) y evoluciones: del juego;
- donde se encuentra: los marcadores cuya figurita es la especie (salvaje,
  fijo, regalo o intercambio) de esa version, por zona y en orden de juego;
- si no tiene marcador: "evoluciona de" si su preevolucion se consigue; si no,
  hay que traerla de otra version.

Yellow tiene un caso propio: el Pikachu que te da Oak no acepta la Piedra
Trueno y no hay otro en el juego, asi que Raichu tambien hay que traerlo.

Uso:  python scripts/gen1/build-dex.py yellow|rb   (despues de build.py)
Salida: public/<juego>/data/pokedex-<version>.json
"""
import io, json, os, re, sys

sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
import decomp as d
from common.dex import found_by_species, settle

STONES = {'MOON_STONE': 'Moon Stone', 'FIRE_STONE': 'Fire Stone', 'WATER_STONE': 'Water Stone',
          'THUNDER_STONE': 'Thunder Stone', 'LEAF_STONE': 'Leaf Stone'}
# Especies que se consiguen pero no por la via normal (ver arriba).
REFUSES = {'yellow': {26: 'Your Pikachu refuses the Thunder Stone: trade a Raichu over from Red or Blue.'}}
# De donde traer lo que falta en cada version.
MISSING = {'yellow': 'Not found in Yellow: trade it over from Red or Blue.',
           'red': 'Not found in Red: trade it over from Blue or Yellow.',
           'blue': 'Not found in Blue: trade it over from Red or Yellow.'}


def main():
    game = d.use()
    data = f'public/{d.OUT}/data'
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

    markers = json.load(io.open(f'{data}/markers.json', encoding='utf-8'))
    check = json.load(io.open(f'{data}/checklist.json', encoding='utf-8'))
    for version in game['versions']:
        refuses = REFUSES.get(version, {})
        # Donde se encuentra y si se consigue: comun a todos los juegos (common/dex.py).
        found = found_by_species(markers, check, version)
        entries = {}
        for n in range(1, 152):
            prev = evolves.get(n)
            entries[n] = {'n': n, 'name': names[n], 'icon': f'{d.OUT}/pokemon/p{n}.png', 'types': types[n],
                          'found': found.get(n, []),
                          'from': {'n': prev[0], 'method': prev[1]} if prev else None}

        settle(entries, blocked=refuses)
        for e in entries.values():
            if e['get'] == 'none':
                e['note'] = refuses.get(e['n'], MISSING[version])

        out = [entries[n] for n in sorted(entries)]
        io.open(f'{data}/pokedex-{version}.json', 'w', encoding='utf-8', newline='\n').write(
            json.dumps({'source': game['repo'], 'species': out}, ensure_ascii=False, separators=(',', ':')))
        by = {}
        for e in out:
            by.setdefault(e['get'], []).append(e['name'])
        print(f'{d.NAMES[version]}: {len(out)} especies | con marcador {len(by.get("found", []))} | por evolucion {len(by.get("evo", []))} | '
              f'no disponibles {len(by.get("none", []))}: {", ".join(by.get("none", []))}')


if __name__ == '__main__':
    main()
