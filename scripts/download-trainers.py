"""Figuritas para los combates: sprite del entrenador o del Pokemon rival.

Los combates no traen icono. Su nombre dice la clase ("Youngster #3",
"Brock", "Rival #1"): los entrenadores usan su sprite de Amarillo del catalogo
de Pokemon Showdown (variante -gen1); los combates contra un Pokemon (Snorlax,
los pajaros legendarios...) reutilizan su figurita de Pokemon.

Uso:  python scripts/download-trainers.py
Salida: public/icons/trainer/*.png y public/data/trainer-icons.json
"""
import io, json, os, re, urllib.request

from PIL import Image

SPRITES = 'https://play.pokemonshowdown.com/sprites/trainers/{}-gen1.png'
TRAINERS = {
    'Rocket': 'rocket', 'Jr Trainer (M)': 'jrtrainer', 'Jr Trainer (F)': 'jrtrainerf', 'Lass': 'lass', 'Rival': 'blue',
    'Channeler': 'channeler', 'Hiker': 'hiker', 'Biker': 'biker', 'Swimmer': 'swimmer',
    'Bird Keeper': 'birdkeeper', 'Bug Catcher': 'bugcatcher', 'Beauty': 'beauty',
    'Youngster': 'youngster', 'Scientist': 'scientist', 'Fisher': 'fisherman',
    'Cooltrainer (M)': 'acetrainer', 'Cooltrainer (F)': 'acetrainerf', 'SuperNerd': 'supernerd', 'Cue Ball': 'cueball',
    'Blackbelt': 'blackbelt', 'Sailor': 'sailor', 'Pokémaniac': 'pokemaniac',
    'Juggler': 'juggler', 'Burglar': 'burglar', 'Gambler': 'gambler', 'Tamer': 'tamer',
    'Gentleman': 'gentleman', 'Psychic': 'psychic', 'Jessie & James': 'jessiejames',
    'Giovanni': 'giovanni', 'Engineer': 'engineer', 'Rocker': 'rocker', 'Bruno': 'bruno',
    'Brock': 'brock', 'Misty': 'misty', 'LtSurge': 'ltsurge', 'Erika': 'erika', 'Koga': 'koga',
    'Blaine': 'blaine', 'Sabrina': 'sabrina', 'Lorelei': 'lorelei', 'Agatha': 'agatha',
    'Lance': 'lance',
}
# Combates contra un Pokemon: numero de Pokedex para reutilizar su figurita.
POKEMON = {'Voltorb': 100, 'Electrode': 101, 'Snorlax': 143, 'Ghost Marowak': 105,
           'Articuno': 144, 'Zapdos': 145, 'Moltres': 146, 'Mewtwo': 150}


def trainer_class(name):
    """'Youngster #3' -> 'Youngster'; 'Rival #8 (Jolteon)' -> 'Rival'.

    El sexo se conserva ('Jr Trainer (F) #2' -> 'Jr Trainer (F)'): cambia el sprite.
    """
    return re.sub(r'\s*\((?![MF]\))[^)]*\)$', '', re.sub(r'\s*#\d+.*$', '', name)).strip()


def main():
    markers = json.load(io.open('public/data/yellow-map.json', encoding='utf-8'))['markers']
    classes = {trainer_class(m['name']) for m in markers if m['category'] == 'Battle'}
    unknown = classes - set(TRAINERS) - set(POKEMON)
    assert not unknown, 'clases de combate sin figurita: %s' % unknown

    os.makedirs('public/icons/trainer', exist_ok=True)
    icons = {}
    for cls, slug in TRAINERS.items():
        path = f'public/icons/trainer/{slug}.png'
        if not os.path.exists(path):
            req = urllib.request.Request(SPRITES.format(slug), headers={'user-agent': 'Ruta151'})
            img = Image.open(io.BytesIO(urllib.request.urlopen(req, timeout=30).read())).convert('RGBA')
            img.crop(img.getbbox()).save(path, optimize=True)   # sin el margen transparente
        icons[cls] = f'trainer/{slug}.png'
    for cls, n in POKEMON.items():
        icons[cls] = f'pokemon/p{n}.png'
        assert os.path.exists(f'public/icons/pokemon/p{n}.png'), n

    io.open('public/data/trainer-icons.json', 'w', encoding='utf-8', newline='\n').write(
        json.dumps(icons, ensure_ascii=False, indent=1) + '\n')
    covered = sum(1 for m in markers if m['category'] == 'Battle' and trainer_class(m['name']) in icons)
    print('clases: %d | combates con figurita: %d de %d'
          % (len(icons), covered, sum(1 for m in markers if m['category'] == 'Battle')))


main()
