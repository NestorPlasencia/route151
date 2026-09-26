"""Datos de combate de Pokemon Yellow para el equipo y el ranking.

Mismo formato que scripts/frlg/build-battle.py, con `gen: 1` para que la app
aplique las reglas de la primera generacion:
- una sola estadistica Especial: se guarda en las dos casillas de ataque y
  defensa especial, asi que el orden de las bases es el de siempre
  (PS, Ataque, Defensa, Especial, Especial, Velocidad);
- sin naturalezas ni habilidades;
- fisico o especial segun el tipo del ataque, como en la tercera generacion;
- la tabla de tipos del juego, con sus rarezas (Fantasma no afecta a
  Psiquico, Bicho y Veneno se golpean al doble).

Uso:  python scripts/yellow/sync-decomp.py && python scripts/yellow/build-yellow-battle.py
Salida: public/yellow/data/battle.json
"""
import json, os, re, sys

sys.path.insert(0, os.path.dirname(__file__))
import decomp as d

OUT = 'public/yellow/data/battle.json'
PHYSICAL = {'NORMAL', 'FIGHTING', 'FLYING', 'POISON', 'GROUND', 'ROCK', 'BUG', 'GHOST'}
MULT = {'SUPER_EFFECTIVE': 2, 'NOT_VERY_EFFECTIVE': .5, 'NO_EFFECT': 0}
# Efectos de Gen 1 con el nombre que usa la app (el de FRLG), para resumir los
# ataques de estado y elegir el mejor de ellos.
EFFECTS = {'SLEEP_EFFECT': 'SLEEP', 'PARALYZE_EFFECT': 'PARALYZE', 'POISON_EFFECT': 'POISON', 'CONFUSION_EFFECT': 'CONFUSE',
           'LEECH_SEED_EFFECT': 'LEECH_SEED', 'LIGHT_SCREEN_EFFECT': 'LIGHT_SCREEN', 'REFLECT_EFFECT': 'REFLECT', 'HEAL_EFFECT': 'RESTORE_HP'}


def type_name(t):
    return t.removesuffix('_TYPE').lower()


def effect(e):
    """ATTACK_UP1_EFFECT -> ATTACK_UP; DEFENSE_DOWN2_EFFECT -> DEFENSE_DOWN_2."""
    if e in EFFECTS:
        return EFFECTS[e]
    found = re.fullmatch(r'(ATTACK|DEFENSE|SPEED|SPECIAL|ACCURACY|EVASION)_(UP|DOWN)([12])_EFFECT', e)
    if found:
        return f'{found[1]}_{found[2]}' + ('_2' if found[3] == '2' else '')
    return e.removesuffix('_EFFECT')


def title(s):
    return ' '.join(w[:1] + w[1:].lower() for w in s.split())


def main():
    numbers = d.dex_numbers()
    consts = re.findall(r'^\s*const (\w+)', d.read('constants/move_constants.asm').split('DEF NUM_ATTACKS')[0], re.M)[1:]
    names = re.findall(r'li "([^"]*)"', d.read('data/moves/names.asm'))
    moves = {}
    for const, name, (eff, power, kind, acc, pp) in zip(consts, names, re.findall(
            r'^\s*move \w+,\s*(\w+),\s*(\d+),\s*(\w+),\s*(\d+),\s*(\d+)', d.read('data/moves/moves.asm'), re.M)):
        moves[const] = {'name': title(name), 'type': type_name(kind), 'power': int(power), 'accuracy': int(acc), 'pp': int(pp),
                        'effect': effect(eff), 'category': 'physical' if kind in PHYSICAL else 'special'}

    # Ataques por nivel: evos_moves.asm va en el orden interno de las especies.
    text = d.read('data/pokemon/evos_moves.asm')
    pointers = re.findall(r'dw (\w+)EvosMoves', text)
    bodies = dict(re.findall(r'^(\w+)EvosMoves:\n(.*?)(?=^\w+EvosMoves:|\Z)', text, re.M | re.S))
    learnsets = {}
    for const, label in zip(d.internal_order(), pointers):
        if const in numbers:
            learn = bodies.get(label, '').split('db 0', 1)[1] if 'db 0' in bodies.get(label, '') else ''
            learnsets[numbers[const]] = [[int(lv), m] for lv, m in re.findall(r'db (\d+), (\w+)', learn.split('db 0')[0])]

    species = {}
    for f in sorted(os.listdir(d.path('data/pokemon/base_stats'))):
        body = d.read('data/pokemon/base_stats', f)
        n = numbers[re.search(r'db DEX_(\w+)', body)[1]]
        hp, atk, df, spe, spc = map(int, re.search(r'db\s+(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+)\s*\n\s*;\s*hp', body).groups())
        a, b = re.search(r'db (\w+), (\w+) ; type', body).groups()
        start = [m for m in re.search(r'db (.+?) ; level 1 learnset', body)[1].split(', ') if m != 'NO_MOVE']
        tms = re.findall(r'\b([A-Z][A-Z0-9_]+)\b', body.split('tmhm', 1)[1].split('; end')[0]) if 'tmhm' in body else []
        learn = [[1, m] for m in start] + learnsets.get(n, [])
        species[n] = {'base': [hp, atk, df, spc, spc, spe], 'types': list(dict.fromkeys([type_name(a), type_name(b)])), 'abilities': [],
                      'learn': [[lv, m] for lv, m in learn if m in moves], 'tms': [m for m in tms if m in moves]}

    chart = {}
    for atk, dfn, mult in re.findall(r'db (\w+),\s*(\w+),\s*(\w+)', d.read('data/types/type_matchups.asm')):
        if mult in MULT:
            chart.setdefault(type_name(atk), {})[type_name(dfn)] = MULT[mult]

    used = {m for s in species.values() for _, m in s['learn']} | {m for s in species.values() for m in s['tms']}
    data = {'gen': 1, 'species': dict(sorted(species.items())), 'moves': {k: v for k, v in sorted(moves.items()) if k in used},
            'abilities': {}, 'natures': {'Hardy': [None, None]}, 'chart': chart}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    open(OUT, 'w', encoding='utf-8', newline='\n').write(json.dumps(data, ensure_ascii=False, separators=(',', ':')))
    print(f'{len(species)} especies, {len(data["moves"])} ataques, {sum(len(v) for v in chart.values())} relaciones de tipo -> {OUT} ({os.path.getsize(OUT) // 1024} KB)')


if __name__ == '__main__':
    main()
