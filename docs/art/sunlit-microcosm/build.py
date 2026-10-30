import re, pathlib
here = pathlib.Path(__file__).parent
src = (here / 'page.src.html').read_text(encoding='utf-8')
src = re.sub(r'\{\{ICON:([\w-]+)\}\}', lambda m: (here.parent / 'icons' / f'{m.group(1)}.svg').read_text(encoding='utf-8').strip(), src)
src = src.replace('{{SCENE}}', (here / 'scene.js').read_text(encoding='utf-8'))
skel = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>:root{color-scheme:light}body{margin:0}[hidden]{display:none!important}</style></head><body>' + src + '</body></html>'
(here.parent / 'sunlit-microcosm-mockup.html').write_text(skel, encoding='utf-8')
print(len(src))
