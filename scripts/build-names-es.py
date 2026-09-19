"""Nombres en espanol de los objetos, desde PokeAPI.

La app muestra los objetos con el nombre ingles que traen los datos de cada
juego ('Old Amber', 'TM26', 'Thunderstone'). Aqui se busca cada uno en PokeAPI
y se guarda su nombre en espanol ('Ambar Viejo', 'MT26', 'Piedra Trueno'). Las
MT y MO de Amarillo llevan el movimiento en el nombre ('TM01 - Mega Punch'), y
el movimiento tambien se traduce.

PokeAPI no tiene los lugares en espanol (solo ingles, frances y aleman): esos
nombres estan escritos a mano en app/i18n.ts.

Uso:  python scripts/build-names-es.py
Salida: public/data/names-es.json
"""
import io, json, re, unicodedata, urllib.request
from concurrent.futures import ThreadPoolExecutor

API = 'https://pokeapi.co/api/v2'
OUT = 'public/data/names-es.json'
# Nombres que no coinciden con el identificador de PokeAPI.
ALIASES = {
    'Itemfinder': 'dowsing-machine', 'Parlyz Heal': 'paralyze-heal', 'Max Elixer': 'max-elixir',
    'Elixer': 'elixir', 'Nevermeltice': 'never-melt-ice', 'Energypowder': 'energy-powder',
    'Thunderstone': 'thunder-stone', 'Tri-pass': 'tri-pass', 'Teachy Tv': 'teachy-tv',
    'Parcel': 'oaks-parcel', "Oak's Parcel": 'oaks-parcel', 'Coin Case': 'coin-case',
    'Up-grade': 'up-grade', 'Blackglasses': 'black-glasses', 'Exp. All': 'exp-share',
    'S.S. Ticket': 'ss-ticket', 'Poké Doll': 'poke-doll', 'Pokédex': 'pokedex',
    'Guard Spec.': 'guard-spec', 'Rainbow Pass': 'rainbow-pass', 'Powder Jar': 'powder-jar',
    "King's Rock": 'kings-rock', 'Tinymushroom': 'tiny-mushroom', 'X Defend': 'x-defense',
}
# Sin equivalente en PokeAPI: el dinero del Casino y objetos clave de Amarillo.
MANUAL = {'Coins': 'Monedas', 'Pokédex': 'Pokédex', 'X Special': 'Especial X'}


def get(url):
    req = urllib.request.Request(url, headers={'user-agent': 'Ruta151 names sync'})
    return json.loads(urllib.request.urlopen(req, timeout=30).read())


def slug(name):
    name = unicodedata.normalize('NFKD', name).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')


def spanish(entry):
    return next((n['name'] for n in entry['names'] if n['language']['name'] == 'es'), None)


def wanted_items():
    """Objetos que muestran los juegos: los de FRLG y los de Amarillo."""
    names = set()
    frlg = json.load(io.open('public/frlg/data/markers.json', encoding='utf-8'))
    for m in frlg:
        if m['category'] in ('Item In Map', 'Hidden Item', 'Item Gift'):
            names.add(re.sub(r' ×\d+$', '', m['name']))
        if m['category'] == 'Shop' and m.get('detail'):
            names.update(m['detail'].removeprefix('Sells ').split(', '))
    yellow = json.load(io.open('public/data/yellow-map.json', encoding='utf-8'))
    for m in yellow['markers']:
        if m['category'] in ('Item', 'Item In Map', 'Item Gift'):
            names.add(m['name'])
    return sorted(names)


def main():
    known = {i['name'] for i in get(f'{API}/item?limit=3000')['results']}
    moves = {m['name'] for m in get(f'{API}/move?limit=2000')['results']}

    items, missing, move_names = {}, [], {}
    # 'TM01 - Mega Punch' o 'TM01 (Mega Punch)': la MT y el movimiento se traducen
    # por separado. Amarillo ademas numera los repetidos ('Potion #2').
    pairs, extra = {}, {}
    for full in wanted_items():
        name = re.sub(r' #\d+$', '', full)
        extra[full] = full[len(name):]
        coins = re.fullmatch(r'(\d+) coins', name)
        if coins:
            items[full] = f'{coins.group(1)} monedas{extra[full]}'
            continue
        move = None
        parts = re.fullmatch(r'(TM\d+|HM\d+)(?: - | \()(.+?)\)?', name)
        if parts:
            name, move = parts.group(1), parts.group(2)
        base = name
        key = ALIASES.get(base, slug(base))
        if key in known:
            pairs[full] = (key, slug(move) if move and slug(move) in moves else None)
        elif base in MANUAL:
            items[full] = MANUAL[base] + extra[full]
        else:
            missing.append(full)

    with ThreadPoolExecutor(8) as pool:
        need_items = sorted({k for k, _ in pairs.values()})
        need_moves = sorted({m for _, m in pairs.values() if m})
        es_items = dict(zip(need_items, pool.map(lambda s: spanish(get(f'{API}/item/{s}')), need_items)))
        move_names = dict(zip(need_moves, pool.map(lambda s: spanish(get(f'{API}/move/{s}')), need_moves)))

    for full, (key, move) in pairs.items():
        es = es_items.get(key)
        if not es:
            missing.append(full)
            continue
        items[full] = (f'{es} - {move_names[move]}' if move and move_names.get(move) else es) + extra[full]

    io.open(OUT, 'w', encoding='utf-8', newline='\n').write(
        json.dumps({'items': dict(sorted(items.items()))}, ensure_ascii=False, separators=(',', ':')))
    print(f'{len(items)} objetos en espanol -> {OUT}')
    if missing:
        print(f'sin traduccion ({len(missing)}):', ', '.join(sorted(missing)))


if __name__ == '__main__':
    main()
