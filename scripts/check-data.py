"""Comprueba los datos generados de todos los juegos con las mismas reglas.

Lee la lista de juegos de app/games.ts (carpeta de datos, version, generacion),
asi que un juego nuevo queda cubierto sin tocar este script. Para cada uno:

- archivos: los mismos para todos (areas, marcadores, checklist, combate,
  encuentros y Pokedex de su version);
- marcadores: ids y uids unicos, su area existe, caen dentro de la imagen, su
  figurita existe, y los regalos e intercambios no estan en el centro del mapa
  por defecto (senal de que no se encontro a quien los da);
- puertas y lugares: su area existe y caen dentro;
- checklist: cada entrada es un marcador y los recuentos cuadran;
- Pokedex: sus marcadores existen, las evoluciones apuntan a especies de la
  Pokedex y las figuritas existen;
- combate: estan todas las especies que se consiguen, sus ataques existen y
  la tabla de tipos cubre sus tipos; los equipos de los entrenadores se leen
  ("Pidgey Lv9") y son especies conocidas.

Los errores rompen (salida 1); los avisos se cuentan y se muestran.
Uso:  python scripts/check-data.py [--verbose]
"""
import json, os, re, sys
from collections import Counter

PUBLIC = 'public'
VERBOSE = '--verbose' in sys.argv


def games():
    """Los juegos de app/games.ts: id, carpeta de datos, version y generacion."""
    text = open('app/games.ts', encoding='utf-8').read()
    return [dict(zip(('id', 'data', 'version', 'gen'), g)) for g in
            re.findall(r"\{id:'(\w+)'.*?data:'([^']+)',version:'(\w+)',gen:(\d)", text)]


def load(path):
    return json.load(open(path, encoding='utf-8'))


def check(game):
    errors, warnings = [], []
    err = lambda msg: errors.append(msg)
    warn = lambda msg: warnings.append(msg)
    base = PUBLIC + game['data']
    files = {'areas': 'areas.json', 'markers': 'markers.json', 'checklist': 'checklist.json', 'battle': 'battle.json',
             'encounters': f"encounters-{game['version']}.json", 'dex': f"pokedex-{game['version']}.json"}
    missing = [f for f in files.values() if not os.path.exists(f'{base}/{f}')]
    if missing:
        return [f'faltan archivos: {missing}'], []
    d = {k: load(f'{base}/{f}') for k, f in files.items()}
    areas = {a['id']: a for a in d['areas']['areas']}
    markers = [m for m in d['markers'] if not m.get('version') or m['version'] == game['version']]
    by_id = {m['id']: m for m in markers}

    def inside(area_id, pt, what):
        a = areas.get(area_id)
        if not a:
            return err(f'{what}: area inexistente {area_id}')
        if not (0 <= pt[0] < a['width'] and 0 <= pt[1] < a['height']):
            err(f'{what}: fuera de {area_id} ({pt} en {a["width"]}x{a["height"]})')

    # Marcadores.
    ids = Counter(m['id'] for m in d['markers'])
    for i, n in ids.items():
        if n > 1:
            err(f'id repetido: {i}')
    owner = {}
    for m in d['markers']:
        key = f"catch:{m['name']}" if m['category'] == 'Pokémon' else m['id']
        if owner.setdefault(m['uid'], key) != key:
            err(f"uid {m['uid']} compartido por {owner[m['uid']]} y {key}")
    for m in markers:
        what = f"{m['category']} {m['name']} @ {m.get('location')}"
        if m.get('area'):
            inside(m['area'], m['at'], what)
        icon = m.get('icon')
        if not icon:
            warn(f'sin figurita: {what}')
        elif not os.path.exists(f'{PUBLIC}/icons/{icon}'):
            err(f'figurita inexistente {icon}: {what}')
        if m['category'] in ('Item Gift', 'In-Game Gift Pokémon', 'In-Game Trade') and m.get('area') in areas:
            a = areas[m['area']]
            if a['kind'] == 'interior' and a['width'] > 64 and m['at'] == [a['width'] // 2 + 8, a['height'] // 2 + 8]:
                warn(f'en el centro del mapa (sin quien lo de): {what}')
        if m['category'] == 'Battle' and m.get('detail'):
            for part in m['detail'].split(', '):
                if not re.fullmatch(r'.+? Lv\d+', part):
                    err(f'equipo ilegible "{part}": {what}')

    # Un pin de salvajes no comparte casilla con otro marcador: se juntarian en
    # un grupo. Salvo las rocas de Golpe Roca, donde salen a proposito.
    spots = {}
    for m in markers:
        if m.get('area'):
            spots.setdefault((m['area'], tuple(m['at'])), []).append(m)
    for group in spots.values():
        wild = [m for m in group if ':wild:' in m['id']]
        others = [m for m in group if m['category'] != 'Pokémon' and m['name'] != 'Rock Smash rock']
        if wild and others:
            err(f"salvajes de {wild[0]['location']} en la casilla de {others[0]['category']} {others[0]['name']}")

    # Puertas y lugares.
    for w in d['areas']['warps']:
        inside(w['area'], w['at'], f"puerta en {w['area']}")
        inside(w['to'], w['toAt'], f"destino de puerta {w['area']} -> {w['to']}")
    for p in d['areas']['places']:
        if p['area'] not in areas:
            err(f"lugar {p['name']}: area inexistente")
        elif p.get('at'):
            inside(p['area'], p['at'], f"lugar {p['name']}")

    # Checklist.
    check = d['checklist']
    for i in check['markers']:
        if i not in {m['id'] for m in d['markers']}:
            err(f'checklist: {i} no es un marcador')
    counts = Counter(v['zone'] for i, v in check['markers'].items() if i in by_id)
    for z in check['zones']:
        if z['count'] < counts.get(z['name'], 0):
            err(f"checklist: {z['name']} dice {z['count']} y tiene {counts[z['name']]}")

    # Pokedex.
    dex = {s['n']: s for s in d['dex']['species']}
    for s in dex.values():
        for f in s['found']:
            for i in f['ids']:
                if i not in by_id:
                    err(f"Pokedex {s['name']}: marcador {i} inexistente")
        if s.get('from') and s['from']['n'] not in dex:
            err(f"Pokedex {s['name']}: evoluciona de {s['from']['n']}, que no esta")
        if s.get('get') not in ('found', 'evo', 'none'):
            err(f"Pokedex {s['name']}: get={s.get('get')}")
        if not os.path.exists(f"{PUBLIC}/icons/{s['icon']}"):
            err(f"Pokedex {s['name']}: figurita {s['icon']} inexistente")

    # Encuentros: sprites locales que existan; los externos, aviso (no van sin conexion).
    for z in d['encounters']['zones']:
        for p in z['pokemon']:
            sprite = p.get('sprite', '')
            if sprite.startswith('/'):
                if not os.path.exists(PUBLIC + sprite):
                    err(f"sprite inexistente {sprite} ({p['name']} en {z['name']})")
            elif sprite:
                warn(f"sprite externo (no va sin conexion): {p['name']}")

    # Combate.
    b = d['battle']
    if int(b.get('gen', 3)) != int(game['gen']):
        err(f"battle.json es de gen {b.get('gen', 3)} y el juego dice {game['gen']}")
    species = {int(k): v for k, v in b['species'].items()}
    for n, s in dex.items():
        if s['get'] != 'none' and n not in species:
            err(f"combate: falta {s['name']}")
    for n, s in species.items():
        for _, mv in s['learn']:
            if mv not in b['moves']:
                err(f'combate: {n} aprende {mv}, que no esta')
        for mv in s['tms']:
            if mv not in b['moves']:
                err(f'combate: {n} tiene la MT {mv}, que no esta')
        for t in s['types']:
            if t not in b['chart'] and not any(t in row for row in b['chart'].values()):
                warn(f'combate: el tipo {t} no aparece en la tabla')
    names = {re.sub(r'[^a-z0-9]', '', s['name'].lower().replace('♀', 'f').replace('♂', 'm')) for s in dex.values()}
    for m in markers:
        if m['category'] == 'Battle' and m.get('detail'):
            for part in m['detail'].split(', '):
                name = re.sub(r'\s+Lv\d+$', '', part)
                # Aviso, no error: el consejo de combate del mapa no puede con ellos.
                if re.sub(r'[^a-z0-9]', '', name.lower().replace('♀', 'f').replace('♂', 'm')) not in names:
                    warn(f'especie de un equipo fuera de la Pokedex (sin consejo de combate): {name} de {m["name"]} @ {m.get("location")}')
    # Bloqueos de la historia (opcionales): lo que piden son nombres de marcadores
    # del juego, y sus zonas y mapas existen; si no, nunca se abririan o no harian nada.
    # hm-gates.json sale de los scripts reach-* y nombra marcadores sueltos.
    for file in ('gates.json', 'hm-gates.json'):
        if not os.path.exists(f'{base}/{file}'):
            continue
        marker_names = {m['name'] for m in markers}
        zones = {m.get('zone') for m in markers}
        maps = {m.get('map') for m in markers}
        for g in load(f'{base}/{file}')['gates']:
            for mid in g.get('markers', []):
                if mid not in by_id:
                    err(f"bloqueo {g['id']}: marcador inexistente {mid}")
            for n in g['needs']:
                if n not in marker_names:
                    err(f"bloqueo {g['id']}: pide {n}, que no es ningun marcador")
            for z in g.get('zones', []):
                if z not in zones:
                    err(f"bloqueo {g['id']}: zona inexistente {z}")
            for mp in g.get('maps', []):
                if mp not in maps:
                    err(f"bloqueo {g['id']}: mapa sin marcadores {mp}")
            if not all(g['why'].get(lang) for lang in ('en', 'es')):
                err(f"bloqueo {g['id']}: falta el motivo en algun idioma")
        # Elige uno: cada opcion son marcadores del juego.
        for c in load(f'{base}/{file}').get('choices', []):
            for mid in (x for o in c['options'] for x in o):
                if mid not in by_id:
                    err(f"eleccion {c['id']}: marcador inexistente {mid}")
    return errors, warnings


def main():
    failed = False
    for game in games():
        errors, warnings = check(game)
        failed |= bool(errors)
        print(f"{game['id']:10} {'OK' if not errors else 'ERROR'}  {len(errors)} errores, {len(warnings)} avisos")
        for e in errors[:30]:
            print('   x', e)
        kinds = Counter(re.sub(r':.*', '', w) for w in warnings)
        for k, n in kinds.items():
            print(f'   - {n} x {k}')
        if VERBOSE:
            for w in warnings:
                print('     ', w)
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
