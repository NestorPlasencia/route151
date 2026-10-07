"""Donde cae cada mapa del juego en los mapas de la app, para seguir al jugador.

La RAM (SaveBlock1) dice el mapa actual por grupo y numero, y la casilla. Esta
tabla traduce "grupo.numero" al area de la app y su desplazamiento en pixeles,
con las mismas reglas que dibujan las areas (build-frlg.py): asi un punto del
juego cae exactamente sobre el mismo punto que sus marcadores.

Uso: python scripts/frlg/sync-decomp.py && python scripts/frlg/build-map-positions.py
"""
import importlib.util
import json
import os

HERE = os.path.dirname(__file__)
spec = importlib.util.spec_from_file_location('build_frlg', os.path.join(HERE, 'build-frlg.py'))
frlg = importlib.util.module_from_spec(spec)
spec.loader.exec_module(frlg)
d = frlg.d
OUT = 'public/frlg/data/map-positions.json'


def main():
    where = frlg.placements(frlg.build_regions())
    groups = json.load(open(d.path('data/maps/map_groups.json'), encoding='utf-8'))
    by_dir = {m['dir']: mid for mid, m in d.maps().items()}
    out = {}
    for g, name in enumerate(groups['group_order']):
        for n, folder in enumerate(groups[name]):
            mid = by_dir.get(folder)
            if mid in where:
                area, x, y = where[mid]
                out[f'{g}.{n}'] = {'id': mid, 'area': area, 'at': [x * frlg.B, y * frlg.B]}
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump({'version': 1, 'tile': frlg.B, 'maps': out}, f, ensure_ascii=False, separators=(',', ':'))
    print(f'{len(out)} mapas -> {OUT}')


if __name__ == '__main__':
    main()
