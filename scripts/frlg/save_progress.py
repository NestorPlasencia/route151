"""Relaciona entradas existentes con pruebas persistentes de FRLG.

No ejecuta scripts del juego. Solo reconoce casos cuya señal se puede justificar
en los datos de pret; lo ambiguo se deja manual. No deduce capturas de la Pokédex.
"""
import ast
import json
import re
from pathlib import Path


def constants(text):
    expressions = dict(re.findall(r'^#define (\w+)[ \t]+([^\n]+)', text, re.M))
    values = {}

    def number(node):
        if isinstance(node, ast.Constant) and type(node.value) is int:
            return node.value
        if isinstance(node, ast.Name):
            return values[node.id]
        if isinstance(node, ast.BinOp):
            a, b = number(node.left), number(node.right)
            if isinstance(node.op, ast.Add):
                return a + b
            if isinstance(node.op, ast.Sub):
                return a - b
        raise ValueError('Unsupported constant expression')

    for _ in range(len(expressions)):
        before = len(values)
        for name, expression in expressions.items():
            if name in values:
                continue
            try:
                values[name] = number(ast.parse(expression.split('//')[0].strip(), mode='eval').body)
            except (SyntaxError, KeyError, ValueError):
                pass
        if len(values) == before:
            break
    return values


def version_text(text, version):
    out, keep = [], [True]
    for line in text.splitlines():
        m = re.match(r'\s*#(if|elif) defined\((\w+)\)|\s*\.(ifdef|ifndef) (\w+)', line)
        if m and m.group(1) == 'if':
            keep.append(m.group(2) == version)
        elif m and m.group(1) == 'elif':
            keep[-1] = m.group(2) == version
        elif m:
            keep.append((m.group(4) == version) == (m.group(3) == 'ifdef'))
        elif re.match(r'\s*[#.]else', line):
            keep[-1] = not keep[-1]
        elif re.match(r'\s*[#.]endif', line):
            keep.pop()
        elif all(keep):
            out.append(line.split('@')[0])
    return '\n'.join(out)


def script_blocks(text):
    parts = re.split(r'^(\w+)::\s*$', text, flags=re.M)
    return dict(zip(parts[1::2], parts[2::2]))


def reachable(scripts, label):
    prefix = label.split('_EventScript_')[0] + '_EventScript_'
    seen, todo, out = set(), [label], []
    while todo:
        current = todo.pop()
        if current in seen:
            continue
        seen.add(current)
        text = scripts.get(current, '')
        out.append(text)
        todo.extend(re.findall(r'\b' + re.escape(prefix) + r'\w+', text))
    return '\n'.join(out)


def build_checks(root: Path, markers):
    read = lambda p: (root / p).read_text(encoding='utf-8')
    opponents = constants(read('include/constants/opponents.h'))
    flags = constants(read('include/constants/flags.h') + '\n' + read('include/constants/opponents.h'))
    variables = constants(read('include/constants/vars.h'))
    if flags.get('TRAINER_FLAGS_START') != 0x500 or variables.get('VAR_STARTER_MON') != 0x4031:
        raise ValueError('Unexpected FRLG save layout')
    maps = [json.loads(p.read_text(encoding='utf-8')) for p in sorted((root / 'data/maps').glob('*/map.json'))]
    map_names = {m['name']: m['id'] for m in maps}
    files = sorted((root / 'data/maps').glob('*/scripts.inc')) + sorted((root / 'data/scripts').glob('*.inc'))
    texts = [p.read_text(encoding='utf-8') for p in files]
    by_id = {m['id']: m for m in markers}
    rules = {}

    def add(marker, conditions, source):
        if marker is None or not conditions:
            return
        rule = rules.setdefault(marker['id'], {'id': marker['id'], 'any': [], 'sources': []})
        if conditions not in rule['any']:
            rule['any'].append(conditions)
        if source not in rule['sources']:
            rule['sources'].append(source)

    def f(name, value=True):
        flag = flags[name]
        if not 0x20 <= flag < 0x900:
            raise ValueError(f'Non-persistent flag: {name}')
        return {'flag': flag, **({'set': False} if not value else {})}

    def v(name, **comparison):
        var = variables[name]
        if not 0x4030 <= var <= 0x40FF:
            raise ValueError(f'Non-persistent variable: {name}')
        return {'var': var, **comparison}

    def matching(mid, category, name):
        return [m for m in markers if m['map'] == mid and m['category'] == category and m['name'] == name]

    for version in ('firered', 'leafgreen'):
        scripts = {}
        for text in texts:
            scripts.update(script_blocks(version_text(text, version.upper())))
        # Una desaparición también puede venir de una escena: no usar esas flags
        # de visibilidad como prueba genérica de recoger un objeto del suelo.
        explicitly_set = set(re.findall(r'^\s*setflag (FLAG_\w+)', '\n'.join(scripts.values()), re.M))
        for m in maps:
            mid = m['id']
            for o in m.get('object_events') or []:
                body = reachable(scripts, o.get('script', ''))
                ids = [f'{mid}:Battle:{o["x"]},{o["y"]}', f'{mid}:Battle:{o["x"]},{o["y"]}:{version}']
                for trainer in dict.fromkeys(re.findall(r'^\s*trainerbattle_\w+ (TRAINER_\w+)', body, re.M)):
                    if trainer not in opponents:
                        raise ValueError(f'Unknown trainer: {trainer}')
                    flag = flags['TRAINER_FLAGS_START'] + opponents[trainer]
                    if not 0x500 <= flag < 0x800:
                        raise ValueError(f'Invalid trainer flag: {trainer}')
                    for id_ in ids:
                        add(by_id.get(id_), [{'flag': flag}], o['script'])
                flag = o.get('flag')
                if o.get('graphics_id') == 'OBJ_EVENT_GFX_ITEM_BALL' and flag in flags and flag not in explicitly_set:
                    if re.search(r'^\s*finditem ITEM_\w+', body, re.M) and not re.search(r'^\s*(givemon|giveegg)', body, re.M):
                        for id_ in [f'{mid}:Item In Map:{o["x"]},{o["y"]}', f'{mid}:Item In Map:{o["x"]},{o["y"]}:{version}']:
                            add(by_id.get(id_), [f(flag)], o['script'])
                # Cada intercambio tiene una marca propia; no usar posesión de
                # la especie, porque pudo obtenerse en otra consola o por captura.
                trade_flags = set(re.findall(r'^\s*setflag (FLAG_DID_\w+_TRADE)', body, re.M))
                if len(trade_flags) == 1:
                    for id_ in [f'{mid}:In-Game Trade:{o["x"]},{o["y"]}', f'{mid}:In-Game Trade:{o["x"]},{o["y"]}:{version}']:
                        add(by_id.get(id_), [f(next(iter(trade_flags)))], o['script'])
            for b in m.get('bg_events') or []:
                if b.get('type') == 'hidden_item' and b.get('flag') in flags:
                    add(by_id.get(f'{mid}:Hidden Item:{b["x"]},{b["y"]}'), [f(b['flag'])], f'{m["name"]}/map.json')

        # Una sola entrega literal y su FLAG_GOT en el mismo bloque de script.
        # No recorrer ramas aquí: podría relacionar el premio con otra elección.
        item_names = {i['itemId']: i['english'].title() for i in json.loads(read('src/data/items.json'))['items']}
        for label, body in scripts.items():
            mid = map_names.get(label.split('_EventScript_')[0])
            given = re.findall(r'^\s*(?:giveitem|additem) (ITEM_\w+)\b|^\s*giveitem_msg \w+, (ITEM_\w+)\b', body, re.M)
            items = {a or b for a, b in given}
            got = set(re.findall(r'^\s*setflag (FLAG_(?:GOT|BOUGHT)_\w+)', body, re.M))
            if mid and len(items) == 1 and len(got) == 1:
                item = next(iter(items))
                if item in item_names:
                    name = re.sub(r'^(Tm|Hm)(\d+)$', lambda m: m[1].upper() + m[2], item_names[item])
                    for marker in matching(mid, 'Item Gift', name):
                        # Elecciones de fósiles se resuelven explícitamente abajo.
                        if item not in ('ITEM_DOME_FOSSIL', 'ITEM_HELIX_FOSSIL'):
                            add(marker, [f(next(iter(got)))], label)

    def named(mid, category, name, conditions, source):
        for marker in matching(mid, category, name):
            add(marker, conditions, source)

    # La entrega del paquete cambia la escena de la tienda de 0 a 1; al
    # recibir la Pokédex pasa a 2. Su ausencia en la mochila después de
    # entregarlo a Oak no debe volver a dejar este objetivo pendiente.
    named('MAP_VIRIDIAN_CITY_MART', 'Item Gift', "Oak's Parcel",
          [v('VAR_MAP_SCENE_VIRIDIAN_CITY_MART', gte=1)], 'ViridianCity_Mart_EventScript_ParcelScene')
    named('MAP_VIRIDIAN_CITY_MART', 'Item Gift', "Oak's Parcel",
          [f('FLAG_SYS_POKEDEX_GET')], 'PalletTown_ProfessorOaksLab_EventScript_ReceiveDexScene')

    # Elecciones persistentes: la Pokédex y las flags de ocultación por sí solas
    # nunca permiten seleccionar todos los iniciales o todos los fósiles.
    for n, name in enumerate(('Bulbasaur', 'Squirtle', 'Charmander')):
        named('MAP_PALLET_TOWN_PROFESSOR_OAKS_LAB', 'In-Game Gift Pokémon', name,
              [f('FLAG_SYS_POKEMON_GET'), v('VAR_STARTER_MON', eq=n)], 'PalletTown_ProfessorOaksLab_EventScript_ChoseStarter')
    for name, own, other in [('Dome Fossil', 'DOME', 'HELIX'), ('Helix Fossil', 'HELIX', 'DOME')]:
        named('MAP_MT_MOON_B2F', 'Item Gift', name,
              [f(f'FLAG_GOT_{own}_FOSSIL'), f(f'FLAG_GOT_{other}_FOSSIL', False)], f'MtMoon_B2F_EventScript_{own.title()}Fossil')
    for name, own, other in [('Hitmonlee', 'HITMONLEE', 'HITMONCHAN'), ('Hitmonchan', 'HITMONCHAN', 'HITMONLEE')]:
        named('MAP_SAFFRON_CITY_DOJO', 'In-Game Gift Pokémon', name,
              [f('FLAG_GOT_HITMON_FROM_DOJO'), f(f'FLAG_HIDE_DOJO_{own}_BALL'), f(f'FLAG_HIDE_DOJO_{other}_BALL', False)], 'SaffronCity_Dojo_EventScript_ReceivedHitmonParty')
    for mid, name, flag in [
        ('MAP_ROUTE4_POKEMON_CENTER_1F', 'Magikarp', 'FLAG_BOUGHT_MAGIKARP'),
        ('MAP_CELADON_CITY_CONDOMINIUMS_ROOF_ROOM', 'Eevee', 'FLAG_GOT_EEVEE'),
        ('MAP_SILPH_CO_7F', 'Lapras', 'FLAG_GOT_LAPRAS_FROM_SILPH'),
        ('MAP_CINNABAR_ISLAND_POKEMON_LAB_EXPERIMENT_ROOM', 'Omanyte', 'FLAG_REVIVED_HELIX'),
        ('MAP_CINNABAR_ISLAND_POKEMON_LAB_EXPERIMENT_ROOM', 'Kabuto', 'FLAG_REVIVED_DOME'),
        ('MAP_CINNABAR_ISLAND_POKEMON_LAB_EXPERIMENT_ROOM', 'Aerodactyl', 'FLAG_REVIVED_AMBER'),
    ]:
        named(mid, 'In-Game Gift Pokémon', name, [f(flag)], flag)

    # Combates disparados por escenas, que el generador coloca junto al actor
    # con id scene:* en vez de en la casilla original del objeto. En el rival
    # se admiten las tres variantes del mismo encuentro, nunca las de otro mapa.
    scenes = [
        ('MAP_PALLET_TOWN_PROFESSOR_OAKS_LAB', 'Rival', 'TRAINER_RIVAL_OAKS_LAB_'),
        ('MAP_CERULEAN_CITY', 'Rival', 'TRAINER_RIVAL_CERULEAN_'),
        ('MAP_ROUTE22', 'Rival', 'TRAINER_RIVAL_ROUTE22_EARLY_'),
        ('MAP_POKEMON_TOWER_2F', 'Rival', 'TRAINER_RIVAL_POKEMON_TOWER_'),
        ('MAP_SSANNE_2F_CORRIDOR', 'Rival', 'TRAINER_RIVAL_SS_ANNE_'),
        ('MAP_SILPH_CO_7F', 'Rival', 'TRAINER_RIVAL_SILPH_'),
        ('MAP_POKEMON_LEAGUE_CHAMPIONS_ROOM', 'Champion', 'TRAINER_CHAMPION_FIRST_'),
        ('MAP_SILPH_CO_11F', 'Boss Giovanni', 'TRAINER_BOSS_GIOVANNI_2'),
        ('MAP_FOUR_ISLAND_ICEFALL_CAVE_BACK', 'Team Rocket Grunt', 'TRAINER_TEAM_ROCKET_GRUNT_45'),
        ('MAP_FIVE_ISLAND_LOST_CAVE_ROOM10', 'Lady Selphy', 'TRAINER_LADY_SELPHY'),
        ('MAP_THREE_ISLAND', 'Biker Goon', 'TRAINER_BIKER_GOON'),
    ]
    for mid, name, trainer in scenes:
        trainers = [key for key in opponents if key.startswith(trainer)] if trainer.endswith('_') else [trainer]
        if not trainers:
            raise ValueError(f'Missing scene trainers: {trainer}')
        for marker in matching(mid, 'Battle', name):
            for key in trainers:
                add(marker, [{'flag': flags['TRAINER_FLAGS_START'] + opponents[key]}], key)

    # Pasos de historia que tienen estado explícito. Cruzar una ruta o capturar
    # un legendario sigue siendo manual: una medalla o un sprite ausente no prueba eso.
    story = {
        'old-man': [v('VAR_MAP_SCENE_VIRIDIAN_CITY_OLD_MAN', gte=2)],
        'vs-seeker': [f('FLAG_GOT_VS_SEEKER')],
        'rocket-poster': [f('FLAG_OPENED_ROCKET_HIDEOUT')],
        'marowak': [v('VAR_MAP_SCENE_POKEMON_TOWER_6F', gte=1)],
        'wake-snorlax-12': [f('FLAG_WOKE_UP_ROUTE_12_SNORLAX')],
        'wake-snorlax-16': [f('FLAG_HIDE_ROUTE_16_SNORLAX')],
        'bill-sevii': [f('FLAG_SYS_SEVII_MAP_123')],
    }
    for marker in markers:
        step = marker['id'].split(':story:')[-1]
        if step in story:
            add(marker, story[step], f'story:{step}')
    if not any('Battle:' in id_ for id_ in rules) or not any('Hidden Item:' in id_ for id_ in rules):
        raise ValueError('No trainer or hidden-item evidence found')
    return sorted(rules.values(), key=lambda r: r['id'])
