# Builds docs/art/whole-yard-mockup.html from page.src.html + scene.js, the Blender mounds (mounds.json) and the
# Blender preview render. Base page styles come from the Sunlit Microcosm mock-up so the two pages match.
#   python docs/art/whole-yard/build.py
import base64, io, json, pathlib, re
here = pathlib.Path(__file__).parent
base = (here.parent / 'sunlit-microcosm' / 'page.src.html').read_text(encoding='utf-8')
base_css = re.search(r'<style>(.*?)</style>', base, re.S).group(1)
src = (here / 'page.src.html').read_text(encoding='utf-8')
mounds = json.loads((here / 'mounds.json').read_text())
scene = (here / 'scene.js').read_text(encoding='utf-8').replace('__MOUNDS__', json.dumps(mounds, separators=(',', ':')))
png = here / 'mounds-preview.png'
try:
    from PIL import Image
    im = Image.open(png).convert('RGB')
    buf = io.BytesIO(); im.save(buf, 'JPEG', quality=82)
    img = 'data:image/jpeg;base64,' + base64.b64encode(buf.getvalue()).decode()
except ImportError:
    img = 'data:image/png;base64,' + base64.b64encode(png.read_bytes()).decode()
src = src.replace('{{BASE_CSS}}', base_css).replace('{{SCENE}}', scene).replace('{{BLENDER_PREVIEW}}', img)
skel = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>:root{color-scheme:light}body{margin:0}[hidden]{display:none!important}</style></head><body>' + src + '</body></html>'
(here.parent / 'whole-yard-mockup.html').write_text(skel, encoding='utf-8')
(here / 'artifact.html').write_text(src, encoding='utf-8')
print(len(skel))
