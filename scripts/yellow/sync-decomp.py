"""Descarga lo necesario de pret/pokeyellow, la decompilacion de Pokemon Yellow.

Igual que sync-decomp.py de FRLG: un clon parcial de git con solo las
carpetas que usan los scripts de Yellow (mapas, graficos de mapas y
personajes, datos de Pokemon, entrenadores, objetos y encuentros).

El commit queda fijado en COMMIT para que los datos sean reproducibles; para
actualizar, cambia COMMIT (o pasa --latest) y vuelve a generar todo.

Uso:  python scripts/yellow/sync-decomp.py [--latest]
Salida: data/yellow/pokeyellow/ (ignorado por git)
"""
import os, subprocess, sys

REPO = 'https://github.com/pret/pokeyellow.git'
COMMIT = 'e89ead154b9968aa50eed9328ff2b38b6c194382'
DEST = 'data/yellow/pokeyellow'
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
    '/gfx/*.asm',
    '/maps.asm',
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
    print(f'pokeyellow en {DEST} @ {git("rev-parse", "--short", "HEAD")}')


if __name__ == '__main__':
    main()
