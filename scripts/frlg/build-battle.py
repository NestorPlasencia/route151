"""Datos de combate de FireRed/LeafGreen para la pestana de equipo.

Del decomp salen: estadisticas base, tipos y habilidades de cada especie, los
ataques que aprende por nivel y por MT/MO, los datos de cada ataque, la tabla
de tipos y lo que cambia cada naturaleza. Con eso la app calcula el dano.

En la tercera generacion un ataque es fisico o especial segun su tipo, no segun
el ataque: aqui se marca igual que en el juego.

Uso:  python scripts/frlg/sync-decomp.py && python scripts/frlg/build-battle.py
Salida: public/frlg/data/battle.json
"""
import json, os, re, sys

sys.path.insert(0, os.path.dirname(__file__))
import decomp as d

OUT = 'public/frlg/data/battle.json'
# Hasta Celebi el numero interno es el de la Pokedex nacional; la app solo usa
# esas especies (Kanto y las de Johto de las Islas Sete).
LAST = 251
# Tipos fisicos y especiales de la tercera generacion.
PHYSICAL = {'NORMAL', 'FIGHTING', 'FLYING', 'POISON', 'GROUND', 'ROCK', 'BUG', 'GHOST', 'STEEL'}


def read(*parts):
    return open(d.path(*parts), encoding='utf-8').read()


def game_text(raw):
    """_("HYPER BEAM") -> 'Hyper Beam'."""
    return ' '.join(w[:1] + w[1:].lower() for w in raw.split())


def moves():
    """Ataque -> tipo, potencia, precision, PP y si es fisico o especial."""
    names = {k: game_text(v) for k, v in re.findall(r'\[MOVE_(\w+)\]\s*=\s*_\("([^"]*)"\)', read('src/data/text/move_names.h'))}
    out = {}
    for key, body in re.findall(r'\[MOVE_(\w+)\]\s*=\s*\{(.*?)\n    \}', read('src/data/battle_moves.h'), re.S):
        field = lambda name: re.search(r'\.' + name + r' = (\w+)', body)
        kind = field('type').group(1).removeprefix('TYPE_')
        if key == 'NONE':
            continue
        out[key] = {
            'name': names.get(key, key.title()),
            'type': kind.lower(),
            'power': int(field('power').group(1)),
            'accuracy': int(field('accuracy').group(1)),
            'pp': int(field('pp').group(1)),
            'effect': field('effect').group(1).removeprefix('EFFECT_'),
            'category': 'physical' if kind in PHYSICAL else 'special',
        }
    return out


def learnsets():
    """Especie -> [(nivel, ataque)] en orden."""
    text = read('src/data/pokemon/level_up_learnsets.h')
    tables = {name: re.findall(r'LEVEL_UP_MOVE\((\d+), MOVE_(\w+)\)', body)
              for name, body in re.findall(r'(s\w+LevelUpLearnset)\[\] = \{(.*?)\n\};', text, re.S)}
    out = {}
    for species, table in re.findall(r'\[SPECIES_(\w+)\] = (s\w+LevelUpLearnset)', read('src/data/pokemon/level_up_learnset_pointers.h')):
        out[species] = [(int(lvl), move) for lvl, move in tables.get(table, [])]
    return out


def tm_moves():
    """Especie -> ataques que aprende por MT o MO."""
    # ITEM_TM01_FOCUS_PUNCH ... el nombre del objeto lleva el ataque.
    out = {}
    # Cada especie ocupa varias lineas unidas por '|', asi que se parte por especie.
    chunks = re.split(r'\[SPECIES_(\w+)\]', read('src/data/pokemon/tmhm_learnsets.h'))
    for species, body in zip(chunks[1::2], chunks[2::2]):
        out[species] = [re.sub(r'^(TM|HM)\d+_', '', m) for m in re.findall(r'TMHM\((\w+)\)', body)]
    return out


def species():
    """Especie -> estadisticas base, tipos y habilidades."""
    out = {}
    # Se parte por especie: '[SPECIES_NONE] = {0}' no tiene cuerpo y, buscando
    # bloques, se llevaba por delante la etiqueta de Bulbasaur.
    chunks = re.split(r'\[SPECIES_(\w+)\]', read('src/data/pokemon/species_info.h'))
    for key, body in zip(chunks[1::2], chunks[2::2]):
        stat = lambda name: re.search(r'\.base' + name + r' = (\d+)', body)
        types = re.search(r'\.types = \{TYPE_(\w+), TYPE_(\w+)\}', body)
        if not stat('HP') or not types:
            continue
        abilities = re.search(r'\.abilities = \{ABILITY_(\w+), ABILITY_(\w+)\}', body)
        out[key] = {
            'base': [int(stat(s).group(1)) for s in ('HP', 'Attack', 'Defense', 'SpAttack', 'SpDefense', 'Speed')],
            'types': list(dict.fromkeys([types.group(1).lower(), types.group(2).lower()])),
            'abilities': [a.lower() for a in abilities.groups() if a != 'NONE'] if abilities else [],
        }
    return out


def type_chart():
    """(ataque, defensor) -> multiplicador, como lo aplica el juego."""
    body = re.search(r'gTypeEffectiveness\[\d+\] =\s*\{(.*?)\n\};', read('src/battle_main.c'), re.S).group(1)
    mult = {'TYPE_MUL_NO_EFFECT': 0, 'TYPE_MUL_NOT_EFFECTIVE': .5, 'TYPE_MUL_NORMAL': 1, 'TYPE_MUL_SUPER_EFFECTIVE': 2}
    chart = {}
    for atk, dfn, value in re.findall(r'TYPE_(\w+), TYPE_(\w+), (TYPE_MUL_\w+)', body):
        if atk == 'FORESIGHT' or dfn == 'FORESIGHT':
            continue
        chart.setdefault(atk.lower(), {})[dfn.lower()] = mult[value]
    return chart


def natures():
    """Naturaleza -> estadistica que sube y la que baja."""
    body = re.search(r'sNatureStatTable\[NUM_NATURES\]\[NUM_NATURE_STATS\] =\s*\{(.*?)\n\};', read('src/pokemon.c'), re.S).group(1)
    stats = ['atk', 'def', 'spe', 'spa', 'spd']
    out = {}
    for key, values in re.findall(r'\[NATURE_(\w+)\]\s*= \{([^}]*)\}', body):
        nums = [int(v) for v in re.findall(r'[+-]?\d+', values)]
        up = next((stats[i] for i, v in enumerate(nums) if v > 0), None)
        down = next((stats[i] for i, v in enumerate(nums) if v < 0), None)
        out[key.title()] = [up, down]
    return out


def abilities():
    names = re.findall(r'\[ABILITY_(\w+)\]\s*=\s*_\("([^"]*)"\)', read('src/data/text/abilities.h'))
    return {k.lower(): game_text(v) for k, v in names if k != 'NONE'}


def main():
    numbers, info, level_up, tms = d.species_numbers(), species(), learnsets(), tm_moves()
    move_data = moves()
    mons = {}
    for key, entry in info.items():
        n = numbers.get('SPECIES_' + key)
        if not n or n > LAST:
            continue
        learn = [[lvl, m] for lvl, m in level_up.get(key, []) if m in move_data]
        mons[n] = {**entry, 'learn': learn, 'tms': [m for m in tms.get(key, []) if m in move_data]}

    used = {m for mon in mons.values() for _, m in mon['learn']} | {m for mon in mons.values() for m in mon['tms']}
    data = {'species': dict(sorted(mons.items())), 'moves': {k: v for k, v in sorted(move_data.items()) if k in used},
            'abilities': abilities(), 'natures': natures(), 'chart': type_chart()}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    open(OUT, 'w', encoding='utf-8', newline='\n').write(json.dumps(data, ensure_ascii=False, separators=(',', ':')))
    print(f'{len(data["species"])} especies, {len(data["moves"])} ataques, {len(data["abilities"])} habilidades, '
          f'{len(data["natures"])} naturalezas -> {OUT} ({os.path.getsize(OUT) // 1024} KB)')


if __name__ == '__main__':
    main()
