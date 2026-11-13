"""Descarga lo necesario de una decompilacion de la Gen 1: pret/pokeyellow
(Yellow) o pret/pokered (Red y Blue, los dos en el mismo codigo).

Igual que sync-decomp.py de FRLG: un clon parcial de git con solo las
carpetas que usan los scripts de scripts/gen1 (mapas, graficos de mapas y
personajes, datos de Pokemon, entrenadores, objetos y encuentros).

El commit de cada juego queda fijado en decomp.GAMES para que los datos sean
reproducibles; para actualizar, cambia ese commit (o pasa --latest) y vuelve a
generar todo.

Uso:  python scripts/gen1/sync-decomp.py yellow|rb [--latest]
Salida: data/yellow/pokeyellow/ o data/rb/pokered/ (ignorados por git)
"""
import os, subprocess, sys

sys.path.insert(0, os.path.dirname(__file__))
import decomp as d

PATHS = [
    '/maps/',
    '/data/',
    '/constants/',
    '/scripts/',
    '/text/',
    '/gfx/tilesets/',
    '/gfx/blocksets/',
    '/gfx/sprites/',
    '/gfx/icons/',
    '/gfx/pokemon/front/',
    '/gfx/*.asm',
    '/maps.asm',
]


def git(*args, cwd=None):
    # MSYS_NO_PATHCONV: en Git Bash para Windows, las rutas '/data/...' del
    # sparse-checkout se convertirian en rutas de Windows.
    env = {**os.environ, 'MSYS_NO_PATHCONV': '1'}
    return subprocess.run(['git', *args], cwd=cwd or d.ROOT, env=env, check=True, capture_output=True, text=True).stdout.strip()


def main():
    game = d.use()
    ref = 'master' if '--latest' in sys.argv else game['commit']
    if not os.path.isdir(os.path.join(d.ROOT, '.git')):
        os.makedirs(os.path.dirname(d.ROOT), exist_ok=True)
        git('clone', '--filter=blob:none', '--no-checkout', game['repo'] + '.git', d.ROOT, cwd='.')
    git('sparse-checkout', 'set', '--no-cone', *PATHS)
    git('fetch', '--depth', '1', 'origin', ref)
    git('checkout', '--detach', 'FETCH_HEAD')
    print(f'{os.path.basename(d.ROOT)} en {d.ROOT} @ {git("rev-parse", "--short", "HEAD")}')


if __name__ == '__main__':
    main()
