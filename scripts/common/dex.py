"""Nucleo comun de las Pokedex (FRLG, Yellow...).

Cada juego sabe sus especies (nombres, tipos, de quien evolucionan y como); aqui
se hace, igual para todos, lo que sale de sus marcadores:

- que especie es cada marcador (por su figurita) y como se consigue: salvaje,
  fijo, regalo o intercambio;
- donde se encuentra cada especie: por zona y en el orden de la historia;
- si se consigue ('found'), sale de evolucionar una que se consigue ('evo') o
  no esta en el juego ('none').
"""
import re


def number(m):
    """Numero de Pokedex de un marcador, por su figurita ('pokemon/p25.png',
    'yellow/pokemon/p25.png'), o None si no es un Pokemon."""
    found = re.search(r'(?:^|/)pokemon/p(\d+)\.png$', m.get('icon') or '')
    return int(found[1]) if found else None


def how(m):
    if m['category'] == 'In-Game Trade':
        return 'Trade'
    if m['category'] == 'In-Game Gift Pokémon':
        return 'Gift'
    return 'Static' if 'Static encounter' in m['encounter']['methods'] else 'Wild'


def found_by_species(markers, checklist, version=None):
    """Numero -> [{'zone', 'how', 'ids'}] de los marcadores de esa version, por
    zona (la de la checklist) y en el orden de la historia."""
    rank = {z['name']: i for i, z in enumerate(checklist['zones'])}
    groups = {}
    for m in markers:
        n = number(m)
        if not n or m['category'] not in ('Pokémon', 'In-Game Gift Pokémon', 'In-Game Trade'):
            continue
        if version and m.get('version') not in (None, version):
            continue
        zone = checklist['markers'].get(m['id'], {}).get('zone', m['zone'])
        groups.setdefault(n, {}).setdefault((zone, how(m)), []).append(m['id'])
    return {n: [{'zone': z, 'how': h, 'ids': ids} for (z, h), ids in sorted(found.items(), key=lambda kv: rank.get(kv[0][0], 999))]
            for n, found in groups.items()}


def settle(entries, blocked=()):
    """Pone `get` a cada especie: 'found' si tiene marcador, 'evo' si sale de una
    que se consigue (salvo las de `blocked`, que el juego no deja evolucionar:
    Raichu en Yellow), y 'none' si no."""
    def available(n):
        e = entries[n]
        return bool(e['found']) or (n not in blocked and bool(e['from'] and available(e['from']['n'])))
    for e in entries.values():
        e['get'] = 'found' if e['found'] else 'evo' if available(e['n']) else 'none'
    return entries
