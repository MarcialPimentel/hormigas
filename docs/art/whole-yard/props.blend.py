# Builds the Whole Yard's small models (grass clumps, tussocks, reeds, flowers, shrubs, rocks, stepping stones, logs,
# bark chips, leaf litter) and writes them as compact mesh data the yard loads, plus a preview render.
#   "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b -P docs/art/whole-yard/props.blend.py
# Units: 1 = 1 cm. Feet at z = 0 (Blender is z-up; the JSON is converted to y-up). Colours are sRGB per vertex,
# so a blade of grass can run dark at the root to light at the tip. "Tint" models are drawn near-white so the game
# can colour each copy (flower petals, blossom).
import bpy, bmesh, json, math, random, os
from mathutils import Vector, noise

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, '..', '..', '..', 'client', 'src', 'components', 'yard3d', 'props.json'))
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)


def hexc(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


def mix(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def shade(c, k):
    return tuple(max(0.0, min(1.0, x * k)) for x in c)


class Model:
    def __init__(self):
        self.tris = []  # (a, b, c, ca, cb, cc), positions as Vectors (z-up), colours sRGB

    def tri(self, a, b, c, ca, cb=None, cc=None):
        self.tris.append((Vector(a), Vector(b), Vector(c), ca, cb or ca, cc or ca))

    def quad(self, a, b, c, d, ca, cb, cc, cd):
        self.tri(a, b, c, ca, cb, cc)
        self.tri(a, c, d, ca, cc, cd)


_ico = {}


def ico(sub):
    """triangles of a unit icosphere"""
    if sub not in _ico:
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1.0)
        bmesh.ops.triangulate(bm, faces=bm.faces)
        _ico[sub] = [[v.co.copy() for v in f.verts] for f in bm.faces]
        bm.free()
    return _ico[sub]


def blade(m, base, yaw, h, w, lean, root, tip, seg=3, twist=0.0):
    """a tapered, curved grass blade; double-sided in the game"""
    d = Vector((math.cos(yaw), math.sin(yaw), 0))
    side = Vector((-d.y, d.x, 0))
    side = (side * math.cos(twist) + Vector((0, 0, 1)) * math.sin(twist) * 0.2).normalized()
    pts = []
    for i in range(seg + 1):
        t = i / seg
        c = Vector(base) + d * (lean * h * t * t) + Vector((0, 0, h * t * (1 - 0.35 * lean * t)))
        ww = w * (1 - t) ** 0.9 * (0.6 + 0.4 * math.sin(min(1.0, t * 4 + 0.3) * math.pi / 2))
        pts.append((c - side * ww / 2, c + side * ww / 2, mix(root, tip, t)))
    for i in range(seg):
        (l0, r0, c0), (l1, r1, c1) = pts[i], pts[i + 1]
        if i == seg - 1:
            tp = (l1 + r1) / 2
            m.tri(l0, r0, tp, c0, c0, c1)
        else:
            m.quad(l0, r0, r1, l1, c0, c0, c1, c1)


def clump(m, rnd, n, r, h, w, lean, root, tip, seg=3):
    for i in range(n):
        a = rnd.random() * math.tau
        d = math.sqrt(rnd.random()) * r
        base = (math.cos(a) * d, math.sin(a) * d, 0)
        yaw = a + (rnd.random() - 0.5) * 1.4
        k = 0.92 + rnd.random() * 0.16
        blade(m, base, yaw, h * (0.6 + rnd.random() * 0.5), w * (0.8 + rnd.random() * 0.4),
              lean[0] + rnd.random() * (lean[1] - lean[0]), shade(root, k), shade(tip, k), seg, rnd.random() - 0.5)


def prism(m, a, b, r, sides, col, col_top=None, r_top=None):
    a, b = Vector(a), Vector(b)
    ax = (b - a).normalized()
    u = ax.orthogonal().normalized()
    v = ax.cross(u)
    rt = r if r_top is None else r_top
    ring = lambda c, rr: [c + (u * math.cos(i / sides * math.tau) + v * math.sin(i / sides * math.tau)) * rr for i in range(sides)]
    A, B = ring(a, r), ring(b, rt)
    ct = col_top or col
    for i in range(sides):
        j = (i + 1) % sides
        m.quad(A[i], A[j], B[j], B[i], col, col, ct, ct)
    for i in range(1, sides - 1):
        m.tri(B[0], B[i], B[i + 1], ct)


def blob(m, centre, rx, ry, rz, sub, colf, rnd, rough=0.0, seed=0.0, floor=None):
    """an icosphere, stretched and roughened; colf(face centre z-up local, normal) -> colour"""
    for tri in ico(sub):
        ps = []
        for p in tri:
            n = noise.noise(p * 1.7 + Vector((seed, seed * 0.7, 0))) if rough else 0
            q = Vector((p.x * rx, p.y * ry, p.z * rz)) * (1 + rough * n)
            q = q + Vector(centre)
            if floor is not None:
                q.z = max(q.z, floor)
            ps.append(q)
        nrm = (ps[1] - ps[0]).cross(ps[2] - ps[0])
        if nrm.length < 1e-9:
            continue
        nrm.normalize()
        c = colf((ps[0] + ps[1] + ps[2]) / 3 - Vector(centre), nrm)
        m.tri(ps[0], ps[1], ps[2], c)


def petals(m, centre, n, length, width, tilt, col, rnd, base_dark=0.86):
    cx, cy, cz = centre
    for i in range(n):
        a = i / n * math.tau + rnd.random() * 0.2
        d = Vector((math.cos(a), math.sin(a), 0))
        s = Vector((-d.y, d.x, 0))
        up = Vector((0, 0, 1))
        o = Vector(centre)
        tipv = o + (d * math.cos(tilt) + up * math.sin(tilt)) * length
        midv = o + (d * math.cos(tilt * 0.6) + up * math.sin(tilt * 0.6)) * length * 0.5
        cb = shade(col, base_dark)
        m.tri(o, midv - s * width / 2, midv + s * width / 2, cb, col, col)
        m.tri(midv - s * width / 2, tipv, midv + s * width / 2, col, col, col)


# ---------------------------------------------------------------- models
models = {}

# grass: three clump sizes. The game tints each bed (lawn, flowerbed, creek bank, long grass).
for name, n, r, h, w, lean, root, tip, seed in [
    ('grass_short', 10, 1.0, 5.0, 0.95, (0.15, 0.45), '#3F6B27', '#8FC152', 1),
    ('grass_mid', 11, 1.4, 9.0, 1.15, (0.2, 0.55), '#3A6826', '#97C657', 2),
    ('grass_tall', 12, 1.8, 11.0, 1.05, (0.25, 0.65), '#355F22', '#B2C865', 3),
]:
    m = Model()
    clump(m, random.Random(seed), n, r, h, w, lean, hexc(root), hexc(tip))
    models[name] = m

# a Long Grass tussock: arching blades and a few straw seed heads, reads from the top
m = Model(); rnd = random.Random(11)
clump(m, rnd, 24, 5.0, 44.0, 2.4, (0.35, 0.9), hexc('#4A762A'), hexc('#B9C46C'), seg=4)
for i in range(5):
    a = rnd.random() * math.tau; d = rnd.random() * 3
    b = Vector((math.cos(a) * d, math.sin(a) * d, 0))
    top = b + Vector((math.cos(a) * 6, math.sin(a) * 6, 46 + rnd.random() * 12))
    prism(m, b, top, 0.35, 3, hexc('#8E9A4A'), hexc('#C8B871'))
    blob(m, top + Vector((0, 0, 4)), 1.3, 1.3, 5.0, 1, lambda p, n: mix(hexc('#C9AE62'), hexc('#E3CF8A'), max(0, n.z)), rnd)
models['tussock'] = m

# creek reeds: stems with cattail heads and long leaves
m = Model(); rnd = random.Random(12)
for i in range(7):
    a = rnd.random() * math.tau; d = rnd.random() * 3.5
    b = Vector((math.cos(a) * d, math.sin(a) * d, 0))
    hgt = 36 + rnd.random() * 16
    top = b + Vector(((rnd.random() - 0.5) * 4, (rnd.random() - 0.5) * 4, hgt))
    prism(m, b, top, 0.55, 4, hexc('#3C6B3E'), hexc('#6E9A5A'), 0.35)
    if i < 4:
        hz = top - Vector((0, 0, 6))
        blob(m, hz, 1.5, 1.5, 4.5, 1, lambda p, n: mix(hexc('#5A3A20'), hexc('#7A5232'), max(0, n.z) * 0.6 + 0.2), rnd)
        prism(m, top, top + Vector((0, 0, 4)), 0.2, 3, hexc('#7A6A48'))
clump(m, rnd, 8, 3.0, 34.0, 1.8, (0.25, 0.7), hexc('#386440'), hexc('#86AE6C'), seg=4)
models['reeds'] = m

# (the garden flower is a Meshy daisy since 6 Nov 2026: art/meshy/garden-flower/)

# a flowering shrub: lumpy leaf mass, darker underneath; its blossom sits on the same shape
SHRUB = [((0, 0, 7), 9), ((6, 3, 6), 7), ((-5, 4, 6), 7), ((3, -6, 5), 6.5), ((-4, -5, 5), 6), ((1, 1, 12), 6.5)]
m = Model(); rnd = random.Random(15)
for k, (c, r) in enumerate(SHRUB):
    def leafc(p, n, c=c):
        z = (Vector(c) + p).z
        base = mix(hexc('#2F5626'), hexc('#6CA048'), min(1.0, max(0.0, z / 18)) * 0.7 + max(0.0, n.z) * 0.3)
        return shade(base, 0.9 + rnd.random() * 0.2)
    blob(m, c, r, r, r * 0.85, 2, leafc, rnd, rough=0.22, seed=k * 3.1, floor=0.0)
models['shrub'] = m
m = Model(); rnd = random.Random(16)
for k in range(9):
    c, r = SHRUB[rnd.randrange(len(SHRUB))]
    a = rnd.random() * math.tau; e = 0.35 + rnd.random() * 0.8
    p = Vector(c) + Vector((math.cos(a) * math.cos(e), math.sin(a) * math.cos(e), math.sin(e) * 0.85)) * r * 1.02
    petals(m, tuple(p), 5, 1.7, 1.3, 0.25, (1.0, 1.0, 1.0), rnd, 0.9)
models['blossom'] = m

# rocks: weathered stones, lighter on top; one mossy. Unit size (radius 1), the game scales them.
for name, sub, seed, moss in [('rock', 2, 1.3, False), ('rock_moss', 2, 4.2, True), ('pebble', 1, 7.7, False)]:
    m = Model(); rnd = random.Random(int(seed * 10))
    def rockc(p, n, moss=moss):
        g = mix(hexc('#8F8981'), hexc('#CFC8BC'), max(0.0, n.z) * 0.8 + 0.1)
        if moss and n.z > 0.55 and noise.noise(p * 2.2) > -0.1:
            g = mix(hexc('#6E8C45'), hexc('#8FA85A'), rnd.random())
        return shade(g, 0.94 + rnd.random() * 0.12)
    blob(m, (0, 0, 0.35), 1.0, 0.85, 0.62, sub, rockc, rnd, rough=0.3, seed=seed, floor=0.0)
    models[name] = m

# stepping stones: flat, irregular slabs with a softened edge
for name, seed in [('stone_a', 3), ('stone_b', 8)]:
    m = Model(); rnd = random.Random(seed)
    N = 16
    rad = [24 * (1 + 0.1 * noise.noise(Vector((math.cos(i / N * math.tau) * 1.3 + seed, math.sin(i / N * math.tau) * 1.3, 0)))) for i in range(N)]
    ring = lambda k, z: [Vector((math.cos(i / N * math.tau) * rad[i] * k, math.sin(i / N * math.tau) * rad[i] * k * 0.85, z)) for i in range(N)]
    bot, side, top = ring(1.0, 0), ring(1.0, 2.2), ring(0.92, 3.2)
    inner = [Vector((p.x * 0.55 + (rnd.random() - 0.5) * 2.5, p.y * 0.55 + (rnd.random() - 0.5) * 2.5, p.z + 0.2 + rnd.random() * 0.35)) for p in top]
    centre = Vector((0, 0, 3.6))
    sc, tc = hexc('#A59B8A'), hexc('#D0C6B4')
    for i in range(N):
        j = (i + 1) % N
        m.quad(bot[i], bot[j], side[j], side[i], shade(sc, 0.85), shade(sc, 0.85), sc, sc)
        m.quad(side[i], side[j], top[j], top[i], sc, sc, tc, tc)
        k = 0.93 + rnd.random() * 0.12
        m.quad(top[i], top[j], inner[j], inner[i], shade(tc, k), shade(tc, k), shade(tc, k * 1.03), shade(tc, k * 1.03))
        k = 0.95 + rnd.random() * 0.1
        m.tri(inner[i], inner[j], centre, shade(tc, k), shade(tc, k), shade(tc, k))
    models[name] = m

# a sawn log: ridged bark, end grain with rings. Length 300 along x, radius 22.
m = Model(); rnd = random.Random(21)
L, RAD, A, S = 300.0, 22.0, 14, 10
def bark_r(i, s):
    a = i / A * math.tau
    return RAD * (1 + 0.05 * noise.noise(Vector((math.cos(a) * 2, math.sin(a) * 2, s * 0.8))) + 0.035 * abs(math.sin(a * 5 + s * 0.4)))
grid = [[Vector((-L / 2 + s / S * L, math.cos(i / A * math.tau) * bark_r(i, s), math.sin(i / A * math.tau) * bark_r(i, s))) for i in range(A)] for s in range(S + 1)]
for s in range(S):
    for i in range(A):
        j = (i + 1) % A
        groove = abs(math.sin(i / A * math.tau * 5 + s * 0.4))
        c = shade(mix(hexc('#5A3C25'), hexc('#7E5838'), groove), 0.92 + rnd.random() * 0.14)
        m.quad(grid[s][i], grid[s + 1][i], grid[s + 1][j], grid[s][j], c, c, c, c)
for s, sign in [(0, -1), (S, 1)]:
    rings = [1.0, 0.9, 0.62, 0.35, 0.0]
    cols = [hexc('#4E3420'), hexc('#D6B07A'), hexc('#C79A62'), hexc('#D9B884')]
    pts = [[Vector((grid[s][i].x + sign * (1 - k) * 1.2, grid[s][i].y * k, grid[s][i].z * k)) for i in range(A)] for k in rings]
    for r in range(len(rings) - 1):
        for i in range(A):
            j = (i + 1) % A
            a, b, c, d = pts[r][i], pts[r][j], pts[r + 1][j], pts[r + 1][i]
            if sign < 0:
                a, b, c, d = b, a, d, c
            m.quad(a, b, c, d, cols[r], cols[r], cols[r], cols[r])
models['log'] = m

# bark chips: curled flakes, orange on top, darker underneath
for name, seed in [('chip_a', 31), ('chip_b', 32)]:
    m = Model(); rnd = random.Random(seed)
    NX, NY = 4, 3
    def pt(ix, iy, z_off):
        x = (ix / NX - 0.5) * 9 * (1 - 0.25 * abs(iy / NY - 0.5) * 2)
        y = (iy / NY - 0.5) * 5 * (1 - 0.3 * abs(ix / NX - 0.5) * 2)
        x += (rnd.random() - 0.5) * 0.8; y += (rnd.random() - 0.5) * 0.6
        z = 0.5 + 0.9 * (2 * (iy / NY - 0.5)) ** 2 + z_off
        return Vector((x, y, z))
    T = [[pt(ix, iy, 0.35) for iy in range(NY + 1)] for ix in range(NX + 1)]
    B = [[p - Vector((0, 0, 0.6)) for p in row] for row in T]
    for ix in range(NX):
        for iy in range(NY):
            c = shade(hexc('#BD6A34'), 0.88 + rnd.random() * 0.22)
            m.quad(T[ix][iy], T[ix + 1][iy], T[ix + 1][iy + 1], T[ix][iy + 1], c, c, c, c)
            d = hexc('#874521')
            m.quad(B[ix][iy], B[ix][iy + 1], B[ix + 1][iy + 1], B[ix + 1][iy], d, d, d, d)
    models[name] = m

# a fallen leaf for the flowerbed and creek bank
m = Model(); rnd = random.Random(41)
outline = [(0, 0), (1.5, 1.6), (3.5, 2.2), (5.5, 1.8), (7.5, 0.9), (9, 0)]
mid = [Vector((x, 0, 0.25 + 0.15 * math.sin(x / 9 * math.pi))) for x, _ in outline]
up = [Vector((x, y, 0.5 + 0.2 * y)) for x, y in outline]
dn = [Vector((x, -y, 0.5 + 0.2 * y)) for x, y in outline]
lc, vc = hexc('#9C7A3C'), hexc('#7E6230')
for i in range(len(outline) - 1):
    m.quad(mid[i], mid[i + 1], up[i + 1], up[i], vc, vc, lc, lc)
    m.quad(mid[i], dn[i], dn[i + 1], mid[i + 1], vc, lc, lc, vc)
models['leaf'] = m

# ---------------------------------------------------------------- export
data = {}
for name, m in models.items():
    pos, col = [], []
    for a, b, c, ca, cb, cc in m.tris:
        for v, cv in ((a, ca), (b, cb), (c, cc)):
            pos += [round(v.x, 2), round(v.z, 2), round(-v.y, 2)]  # to y-up
            col += [round(x, 3) for x in cv]
    data[name] = {'pos': pos, 'col': col}
with open(OUT, 'w') as f:
    json.dump(data, f, separators=(',', ':'))
print('props', {k: len(m.tris) for k, m in models.items()}, os.path.getsize(OUT))

# ---------------------------------------------------------------- preview sheet
mat = bpy.data.materials.new('vc'); mat.use_nodes = True
bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
ca = mat.node_tree.nodes.new('ShaderNodeVertexColor'); ca.layer_name = 'col'
mat.node_tree.links.new(ca.outputs['Color'], bsdf.inputs['Base Color'])
bsdf.inputs['Roughness'].default_value = 0.85
mat.use_backface_culling = False
TINT = {'blossom': hexc('#F7F4EA')}
SHEET = [  # name, scale to fit a cell, cell
    ('grass_short', 3.0, (0, 0)), ('grass_mid', 2.0, (1, 0)), ('grass_tall', 1.4, (2, 0)), ('tussock', 0.42, (3, 0)), ('reeds', 0.42, (4, 0)),
    (['shrub', 'blossom'], 0.9, (0, 1)), ('rock', 9, (1, 1)), ('rock_moss', 9, (2, 1)), ('pebble', 9, (3, 1)), ('stone_a', 0.5, (4, 1)),
    ('log', 0.07, (5, 1)), ('chip_a', 1.6, (0, 2)), ('chip_b', 1.6, (1, 2)), ('leaf', 1.4, (2, 2)), ('stone_b', 0.5, (3, 2)),
]
for names, k, (cx, cy) in SHEET:
    for name in (names if isinstance(names, list) else [names]):
        me = bpy.data.meshes.new(name)
        verts, faces, cols = [], [], []
        tint = TINT.get(name, (1, 1, 1))
        for a, b, c, c0, c1, c2 in models[name].tris:
            base = len(verts)
            verts += [tuple(a * k), tuple(b * k), tuple(c * k)]
            faces.append((base, base + 1, base + 2))
            cols += [tuple(x * t for x, t in zip(cv, tint)) for cv in (c0, c1, c2)]
        me.from_pydata(verts, [], faces)
        attr = me.color_attributes.new('col', 'FLOAT_COLOR', 'CORNER')
        for li, loop in enumerate(me.loops):
            c = cols[loop.vertex_index]
            attr.data[li].color = (*[x ** 2.2 for x in c], 1)
        ob = bpy.data.objects.new(name, me)
        ob.location = (cx * 30 - 75, cy * -30 + 30, 0)
        me.materials.append(mat)
        bpy.context.collection.objects.link(ob)
bpy.ops.mesh.primitive_plane_add(size=400, location=(0, 0, -0.01))
g = bpy.context.active_object
gm = bpy.data.materials.new('ground'); gm.use_nodes = True
next(n for n in gm.node_tree.nodes if n.type == 'BSDF_PRINCIPLED').inputs['Base Color'].default_value = (0.42, 0.55, 0.25, 1)
g.data.materials.append(gm)
bpy.ops.object.light_add(type='SUN', location=(0, 0, 30), rotation=(math.radians(40), 0, math.radians(-35)))
bpy.context.active_object.data.energy = 2.4
bpy.ops.object.camera_add(location=(0, -150, 120), rotation=(math.radians(52), 0, 0))
cam = bpy.context.active_object; cam.data.lens = 40
sc = bpy.context.scene; sc.camera = cam
try:
    sc.render.engine = 'BLENDER_EEVEE'
except TypeError:
    sc.render.engine = 'BLENDER_EEVEE_NEXT'
sc.world = bpy.data.worlds.new('w'); sc.world.use_nodes = True
bg = next(n for n in sc.world.node_tree.nodes if n.type == 'BACKGROUND'); bg.inputs[0].default_value = (0.75, 0.86, 0.95, 1); bg.inputs[1].default_value = 0.7
sc.view_settings.view_transform = 'Standard'
sc.render.resolution_x, sc.render.resolution_y = 1400, 800
sc.render.image_settings.file_format = 'JPEG'
sc.render.image_settings.quality = 85
sc.render.filepath = os.path.join(HERE, 'props-preview.jpg')
bpy.ops.render.render(write_still=True)
print('rendered')
