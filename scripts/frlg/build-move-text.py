"""Que hace cada ataque, en ingles y espanol, desde PokeAPI.

El decomp sabe tipo, potencia y PP, pero no explica los ataques de estado
('Growl baja el Ataque'). PokeAPI trae ese texto en los dos idiomas: se toma el
de FireRed/LeafGreen si esta, y si no el mas reciente.

Uso:  python scripts/frlg/build-battle.py && python scripts/frlg/build-move-text.py
Salida: public/frlg/data/move-text.json
"""
import io, json, re, sys, unicodedata, urllib.request
from concurrent.futures import ThreadPoolExecutor

API = 'https://pokeapi.co/api/v2'
BATTLE = 'public/frlg/data/battle.json'
OUT = 'public/frlg/data/move-text.json'
VERSIONS = ('firered-leafgreen', 'emerald', 'ruby-sapphire')
# Ataques cuyo identificador en PokeAPI no coincide con el del juego.
ALIASES = {
    'HI_JUMP_KICK': 'high-jump-kick', 'FAINT_ATTACK': 'feint-attack', 'VICE_GRIP': 'vice-grip',
    'SMELLING_SALT': 'smelling-salts',
}


def get(url):
    req = urllib.request.Request(url, headers={'user-agent': 'Ruta151 move text sync'})
    return json.loads(urllib.request.urlopen(req, timeout=30).read())


def slug(key):
    return re.sub(r'[^a-z0-9]+', '-', unicodedata.normalize('NFKD', key).encode('ascii', 'ignore').decode().lower()).strip('-')


# PokeAPI rellena muchas entradas en espanol de los juegos de tercera
# generacion con el aviso que sale al intentar usar un ataque inutilizable.
# No describe nada, asi que esas se descartan.
FILLER = 'no se puede usar'


def text(entries, lang):
    """El texto del juego en ese idioma: el de FRLG si esta, y si no el mas nuevo."""
    same = [e for e in entries if e['language']['name'] == lang
            and FILLER not in ' '.join(e['flavor_text'].split())]
    for version in VERSIONS:
        for e in same:
            if e['version_group']['name'] == version:
                return ' '.join(e['flavor_text'].split())
    return ' '.join(same[-1]['flavor_text'].split()) if same else None


def main():
    moves = json.load(io.open(BATTLE, encoding='utf-8'))['moves']
    with ThreadPoolExecutor(8) as pool:
        keys = sorted(moves)
        got = dict(zip(keys, pool.map(lambda k: fetch(f'{API}/move/{ALIASES.get(k, slug(k))}'), keys)))

    out, missing = {}, []
    for key, entry in got.items():
        if not entry:
            missing.append(key)
            continue
        en, es = text(entry['flavor_text_entries'], 'en'), text(entry['flavor_text_entries'], 'es')
        if en or es:
            out[key] = {'en': en or '', 'es': es or en or ''}
        else:
            missing.append(key)

    io.open(OUT, 'w', encoding='utf-8', newline='\n').write(json.dumps(out, ensure_ascii=False, separators=(',', ':')))
    print(f'{len(out)} ataques descritos -> {OUT}')
    if missing:
        print(f'sin texto ({len(missing)}):', ', '.join(sorted(missing)))


def fetch(url):
    try:
        return get(url)
    except Exception:
        return None


if __name__ == '__main__':
    main()
