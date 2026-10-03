"""Tablas para interpretar SAV de FRLG, desde el mismo commit que los mapas.

Uso: python scripts/frlg/sync-decomp.py && python scripts/frlg/build-save-catalog.py
No contiene partidas ni requiere una ROM.
"""
import json
import re
from pathlib import Path
from save_progress import build_checks

ROOT = Path('data/frlg/pokefirered')
OUT = Path('public/frlg/data/save-catalog.json')
COMMIT = 'c75f352304d529f6ba92d4f74b9cf8b5c3810788'


def read(path):
    return (ROOT / path).read_text(encoding='utf-8')


def constants(path):
    return {k: int(v, 0) for k, v in re.findall(r'^#define (\w+)\s+(0x[\da-fA-F]+|\d+)\b', read(path), re.M)}


def main():
    numbers = constants('include/constants/species.h')
    national = re.search(r'enum\s*\{(.*?)\};', read('include/constants/pokedex.h'), re.S).group(1)
    dex = {key: n for n, key in enumerate(re.findall(r'NATIONAL_DEX_(\w+)', national))}
    chunks = re.split(r'\[SPECIES_(\w+)\]', read('src/data/pokemon/species_info.h'))
    species = {}
    for key, body in zip(chunks[1::2], chunks[2::2]):
        if key not in dex or not 1 <= dex[key] <= 386:
            continue
        bases = [re.search(r'\.base' + stat + r' = (\d+)', body) for stat in ('HP', 'Attack', 'Defense', 'SpAttack', 'SpDefense', 'Speed')]
        growth = re.search(r'\.growthRate = GROWTH_(\w+)', body)
        abilities = re.search(r'\.abilities = \{ABILITY_(\w+), ABILITY_(\w+)\}', body)
        if not all(bases) or not growth or not abilities:
            raise ValueError(f'Missing species fields: {key}')
        name = {'NIDORAN_F': 'Nidoran♀', 'NIDORAN_M': 'Nidoran♂', 'MR_MIME': 'Mr. Mime', 'FARFETCHD': "Farfetch'd", 'HO_OH': 'Ho-Oh'}.get(key, key.replace('_', ' ').title())
        species[numbers['SPECIES_' + key]] = {'n': dex[key], 'name': name, 'base': [int(b.group(1)) for b in bases], 'growth': growth.group(1), 'abilities': [a.lower() for a in abilities.groups()]}
    moves = {n: key.removeprefix('MOVE_') for key, n in constants('include/constants/moves.h').items() if key.startswith('MOVE_') and 1 <= n <= 354}
    names = json.loads(read('src/data/items.json'))['items']
    item_names = {i['itemId']: i['english'].title() for i in names}
    items = {n: {'key': key, 'name': re.sub(r'^(Tm|Hm)(\d+)$', lambda m: m[1].upper() + m[2], item_names[key])} for key, n in constants('include/constants/items.h').items() if key in item_names and n > 0}
    natures = {n: key.removeprefix('NATURE_').title() for key, n in constants('include/constants/pokemon.h').items() if key.startswith('NATURE_') and n < 25}
    characters = {}
    for text, byte in re.findall(r"^'([^']*)'\s*=\s*([\dA-F]{2})\s*$", read('charmap.txt'), re.M):
        if len(text) == 1:
            characters.setdefault(int(byte, 16), text)  # La tabla japonesa reutiliza estos bytes.
    characters[0xB4] = "'"
    flags = constants('include/constants/flags.h')
    flags.update({f'FLAG_BADGE{i:02}_GET': 0x81F + i for i in range(1, 9)})
    flags.update({'FLAG_SYS_POKEMON_GET': 0x828, 'FLAG_SYS_POKEDEX_GET': 0x829, 'FLAG_SYS_GAME_CLEAR': 0x82C, 'FLAG_SYS_B_DASH': 0x82F, 'FLAG_SYS_NATIONAL_DEX': 0x840, 'FLAG_SYS_CAN_LINK_WITH_RS': 0x844})
    badges = [{'name': 'Leader ' + name, 'flag': flags[f'FLAG_BADGE{i:02}_GET']} for i, name in enumerate(['Brock', 'Misty', 'Lt. Surge', 'Erika', 'Koga', 'Sabrina', 'Blaine', 'Giovanni'], 1)]
    progress = [{'name': 'HM' + f'{i:02}', 'flag': flags[f'FLAG_GOT_HM{i:02}']} for i in range(1, 7)]
    progress += [{'name': name, 'flag': flags[flag]} for name, flag in [('Old Rod', 'FLAG_GOT_OLD_ROD'), ('Good Rod', 'FLAG_GOT_GOOD_ROD'), ('Super Rod', 'FLAG_GOT_SUPER_ROD'), ('Bicycle', 'FLAG_GOT_BICYCLE'), ('Bike Voucher', 'FLAG_GOT_BIKE_VOUCHER'), ('S.S. Ticket', 'FLAG_GOT_SS_TICKET'), ('Tea', 'FLAG_GOT_TEA'), ('Poké Flute', 'FLAG_GOT_POKE_FLUTE'), ('Champion', 'FLAG_SYS_GAME_CLEAR')]]
    goals = json.loads(Path('public/frlg/data/goals.json').read_text(encoding='utf-8'))['goals']
    story_flags = {'leave-house': 'FLAG_SYS_POKEMON_GET', 'oak-stops': 'FLAG_SYS_POKEMON_GET', 'deliver-parcel': 'FLAG_SYS_POKEDEX_GET', 'running-shoes': 'FLAG_SYS_B_DASH', 'rescue-fuji': 'FLAG_RESCUED_MR_FUJI', 'national-dex': 'FLAG_SYS_NATIONAL_DEX', 'sapphire-celio': 'FLAG_SYS_CAN_LINK_WITH_RS'}
    for goal in goals:
        if goal.get('step') in story_flags:
            progress.append({'id': f"{goal['map']}:story:{goal['step']}", 'flag': flags[story_flags[goal['step']]]})
    if len(species) != 386 or len(natures) != 25 or len(moves) != 354:
        raise ValueError('Incomplete save catalog')
    markers = json.loads(Path('public/frlg/data/markers.json').read_text(encoding='utf-8'))
    markers += [dict(id=f"{g['map']}:story:{g['step']}", map=g['map'], category='Story', name=g['step']) for g in goals if g.get('step')]
    checks = build_checks(ROOT, markers)
    OUT.write_text(json.dumps({'version': 1, 'source': f'https://github.com/pret/pokefirered/tree/{COMMIT}', 'species': species, 'moves': moves, 'items': items, 'natures': natures, 'characters': characters, 'badges': badges, 'progress': progress, 'checks': checks}, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print(f'SAV: {len(species)} especies, {len(moves)} movimientos, {len(items)} objetos, {len(checks)} entradas verificables -> {OUT}')


if __name__ == '__main__':
    main()
