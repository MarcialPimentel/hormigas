# Writes the hero ant from hero-ant.blend into the game: client/src/components/nest3d/ant.json.
#   "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b art/meshy/hero-ant/hero-ant.blend -P art/meshy/hero-ant/export_ant.py
# Touch-ups made in the .blend (moving vertices, reshaping parts) come through, as long as the part names stay.
# Each part: game-axis positions and smooth normals (rounded to 1/10000), triangles, and a tone per vertex.
# Object locations are ignored (the crowd ant sits beside the close-up one only for viewing), but rotation and
# scale set on an object are kept.
import bpy, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, '..', '..', '..', 'client', 'src', 'components', 'nest3d', 'ant.json'))
R = 10000

data = {}
for lod in ('close', 'crowd'):
    col = bpy.data.collections['ant_' + lod]
    parts = {}
    for ob in sorted(col.objects, key=lambda o: o.name):
        if ob.type != 'MESH':
            continue
        name = ob.name if lod == 'close' else ob.name.rsplit('_' + lod, 1)[0]
        me = ob.data.copy()
        rs = ob.matrix_basis.to_3x3()
        me.transform(rs.to_4x4())
        me.calc_loop_triangles()
        tone = me.attributes.get('tone')
        p, n, t, idx = [], [], [], []
        for v in me.vertices:
            x, y, z = v.co
            p += [round(x * R), round(z * R), round(-y * R)]
            nx, ny, nz = v.normal
            n += [round(nx * 1000), round(nz * 1000), round(-ny * 1000)]
            t.append(round(tone.data[v.index].value, 2) if tone else 1)
        for tri in me.loop_triangles:
            idx += list(tri.vertices)
        bpy.data.meshes.remove(me)
        entry = {'p': p, 'n': n, 'i': idx}
        if any(x != 1 for x in t):
            entry['t'] = t
        parts[name] = entry
    data[lod] = parts
with open(OUT, 'w') as f:
    json.dump(data, f, separators=(',', ':'))
print('EXPORTED', OUT, {lod: sum(len(e['i']) // 3 for e in d.values()) for lod, d in data.items()}, os.path.getsize(OUT), 'bytes')
