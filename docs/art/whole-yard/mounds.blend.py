# Builds the colony mound in three growth stages (Civ's cities grow on the map; so do our mounds) and writes
# them as compact mesh data the mock-up loads, plus a preview render.
#   "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b -P docs/art/whole-yard/mounds.blend.py
# Units: 1 = 1 cm. Feet at z = 0 (Blender is z-up; the JSON is converted to y-up).
import bpy, bmesh, json, math, random, os
from mathutils import Vector, noise

HERE = os.path.dirname(os.path.abspath(__file__))
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)

SOIL = [(0.55, 0.40, 0.26), (0.63, 0.47, 0.30), (0.71, 0.55, 0.36)]  # dug-out soil, darker low
CRATER = (0.24, 0.16, 0.10)
PEBBLE = [(0.78, 0.74, 0.66), (0.62, 0.60, 0.56), (0.83, 0.69, 0.52)]
TWIG = [(0.47, 0.33, 0.20), (0.58, 0.42, 0.25)]
LEAF = (0.55, 0.62, 0.25)

def mound(R, H, crater, seed):
    rnd = random.Random(seed)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1.0)
    # keep the top half, flatten the rest onto the ground
    for v in bm.verts:
        x, y, z = v.co
        z = max(z, 0.0)
        r = min(1.0, math.hypot(x, y))
        n = noise.noise(Vector((x * 2.3 + seed, y * 2.3, z * 2.3)))
        h = H * (1 - r * r) ** 1.3 * (1 + 0.12 * n) if z > 0 else 0.0
        rr = R * (1 + 0.1 * n)
        if r < 0.3 and z > 0:  # crater: a shallow bowl in the top with a lip
            h -= crater * math.cos(r / 0.3 * math.pi / 2) ** 2
        v.co = Vector((x * rr, y * rr, h))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.02)
    me = bpy.data.meshes.new('m'); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new('mound', me); bpy.context.collection.objects.link(ob)
    return ob

def part(kind, size, loc, rot=(0, 0, 0)):
    if kind == 'pebble':
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=size, location=loc)
    else:
        bpy.ops.mesh.primitive_cylinder_add(vertices=5, radius=size[0], depth=size[1], location=loc, rotation=rot)
    return bpy.context.active_object

def build(stage):
    R, H, crater = [(4.0, 2.2, 0.7), (6.5, 3.8, 1.0), (9.0, 5.6, 1.3)][stage]
    rnd = random.Random(7 + stage)
    objs = [(mound(R, H, crater, 3 + stage), 'soil')]
    for i in range(6 + stage * 6):  # pebbles carried out of the nest, round the foot
        a = rnd.random() * math.tau; d = R * (1.0 + rnd.random() * 0.3)
        objs.append((part('pebble', 0.25 + rnd.random() * 0.35, (math.cos(a) * d, math.sin(a) * d, 0.15)), 'pebble'))
    if stage >= 1:  # a big colony thatches its mound with twigs and leaf bits
        for i in range(10 + stage * 14):
            a = rnd.random() * math.tau; d = R * (0.32 + rnd.random() * 0.5)
            z = H * (1 - (d / R) ** 2) ** 1.3 * 0.95
            objs.append((part('twig', (0.12, 1.2 + rnd.random() * 1.6), (math.cos(a) * d, math.sin(a) * d, z),
                              (rnd.random() * 1.2 + 0.6, 0, a)), 'twig'))
    if stage == 2:
        for i in range(8):
            a = rnd.random() * math.tau; d = R * (0.3 + rnd.random() * 0.4)
            z = H * (1 - (d / R) ** 2) ** 1.3 * 1.0
            objs.append((part('pebble', 0.5, (math.cos(a) * d, math.sin(a) * d, z)), 'leaf'))
    out_pos, out_col = [], []
    face_cols = []
    dg = bpy.context.evaluated_depsgraph_get()
    for ob, kind in objs:
        me = ob.evaluated_get(dg).to_mesh()
        me.transform(ob.matrix_world)
        me.calc_loop_triangles()
        for tri in me.loop_triangles:
            cz = sum(me.vertices[i].co.z for i in tri.vertices) / 3
            cr = sum(math.hypot(me.vertices[i].co.x, me.vertices[i].co.y) for i in tri.vertices) / 3
            if kind == 'soil':
                if cr < R * 0.2 and cz > H - crater * 1.3:
                    c = CRATER
                else:
                    c = SOIL[min(2, int(cz / H * 3))]
            elif kind == 'pebble':
                c = PEBBLE[rnd.randrange(3)]
            elif kind == 'twig':
                c = TWIG[rnd.randrange(2)]
            else:
                c = LEAF
            j = 1 + (rnd.random() - 0.5) * 0.08
            for i in tri.vertices:
                v = me.vertices[i].co
                out_pos += [round(v.x, 2), round(v.z, 2), round(-v.y, 2)]  # to y-up
            out_col.append([round(min(1, x * j), 3) for x in c])
            face_cols.append((ob, tri.polygon_index, [min(1, x * j) for x in c]))
    for ob, _ in objs:
        if 'col' not in ob.data.color_attributes:
            ob.data.color_attributes.new('col', 'FLOAT_COLOR', 'CORNER')
    for ob, pi, c in face_cols:
        for li in ob.data.polygons[pi].loop_indices:
            ob.data.color_attributes["col"].data[li].color = (*[x ** 2.2 for x in c], 1)
    return {'pos': out_pos, 'tri': out_col, 'r': R, 'h': H}, [o for o, _ in objs]

stages, keep = [], []
for s in range(3):
    data, objs = build(s)
    stages.append(data)
    for o in objs:
        o.location.x += [-16, 0, 20][s]
    keep += objs

with open(os.path.join(HERE, 'mounds.json'), 'w') as f:
    json.dump(stages, f, separators=(',', ':'))
print('tris', [len(s['tri']) for s in stages])

# ---------- preview render (vertex colours shown through a simple material)
mat = bpy.data.materials.new('soil'); mat.use_nodes = True
bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
ca = mat.node_tree.nodes.new('ShaderNodeVertexColor'); ca.layer_name = 'col'
mat.node_tree.links.new(ca.outputs['Color'], bsdf.inputs['Base Color'])
bsdf.inputs['Roughness'].default_value = 0.9
for o in keep:
    o.data.materials.clear(); o.data.materials.append(mat)
    for p in o.data.polygons: p.use_smooth = False
bpy.ops.mesh.primitive_plane_add(size=120, location=(2, 0, 0))
g = bpy.context.active_object
gm = bpy.data.materials.new('ground'); gm.use_nodes = True
next(n for n in gm.node_tree.nodes if n.type == 'BSDF_PRINCIPLED').inputs['Base Color'].default_value = (0.36, 0.52, 0.22, 1)
g.data.materials.append(gm)
bpy.ops.object.light_add(type='SUN', location=(0, 0, 30), rotation=(math.radians(50), 0, math.radians(-35)))
bpy.context.active_object.data.energy = 4
bpy.ops.object.camera_add(location=(3, -60, 30), rotation=(math.radians(64), 0, 0))
cam = bpy.context.active_object; cam.data.lens = 50
sc = bpy.context.scene; sc.camera = cam
try:
    sc.render.engine = 'BLENDER_EEVEE'
except TypeError:
    sc.render.engine = 'BLENDER_EEVEE_NEXT'
sc.world = bpy.data.worlds.new('w'); sc.world.use_nodes = True
bg = next(n for n in sc.world.node_tree.nodes if n.type == 'BACKGROUND'); bg.inputs[0].default_value = (0.75, 0.86, 0.95, 1); bg.inputs[1].default_value = 0.6
sc.view_settings.view_transform = 'Standard'
sc.render.resolution_x, sc.render.resolution_y = 1200, 480
sc.render.image_settings.file_format = 'PNG'
sc.render.filepath = os.path.join(HERE, 'mounds-preview.png')
bpy.ops.render.render(write_still=True)
print('rendered')
