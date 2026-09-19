"""Descarga lo necesario de pret/pokefirered, la decompilacion de FireRed/LeafGreen.

Solo baja las carpetas que usan los demas scripts de FRLG (mapas, disenos,
tilesets, encuentros y scripts de objetos) con un clon parcial de git, asi que
pesa unos 15 MB en vez de los ~150 MB del repositorio completo.

El commit queda fijado en COMMIT para que los datos sean reproducibles; para
actualizar, cambia COMMIT (o pasa --latest) y vuelve a generar todo.

Uso:  python scripts/frlg/sync-decomp.py [--latest]
Salida: data/frlg/pokefirered/ (ignorado por git)
"""
import os, subprocess, sys

REPO = 'https://github.com/pret/pokefirered.git'
COMMIT = 'c75f352304d529f6ba92d4f74b9cf8b5c3810788'
DEST = 'data/frlg/pokefirered'
PATHS = [
    '/data/maps/',
    '/data/layouts/',
    '/data/tilesets/',
    '/data/scripts/',
    '/src/data/tilesets/',
    '/src/data/wild_encounters.json',
    '/src/data/region_map/',
    '/include/fieldmap.h',
    '/src/data/items.json',
    '/src/data/trainers.h',
    '/src/data/trainer_parties.h',
]


def git(*args, cwd=DEST):
    # MSYS_NO_PATHCONV: en Git Bash para Windows, las rutas '/data/...' del
    # sparse-checkout se convertirian en rutas de Windows.
    env = {**os.environ, 'MSYS_NO_PATHCONV': '1'}
    return subprocess.run(['git', *args], cwd=cwd, env=env, check=True, capture_output=True, text=True).stdout.strip()


def main():
    ref = 'master' if '--latest' in sys.argv else COMMIT
    if not os.path.isdir(os.path.join(DEST, '.git')):
        os.makedirs(os.path.dirname(DEST), exist_ok=True)
        git('clone', '--filter=blob:none', '--no-checkout', REPO, DEST, cwd='.')
    git('sparse-checkout', 'set', '--no-cone', *PATHS)
    git('fetch', '--depth', '1', 'origin', ref)
    git('checkout', '--detach', 'FETCH_HEAD')
    print(f'pokefirered en {DEST} @ {git("rev-parse", "--short", "HEAD")}')


if __name__ == '__main__':
    main()
