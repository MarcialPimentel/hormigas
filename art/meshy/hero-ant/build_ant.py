# Builds the hero ant (concept 1, art/meshy/hero-ant/concepts/c1_image_0.png) in Blender as named parts, in two
# levels of detail, and saves art/meshy/hero-ant/hero-ant.blend. Then run export_ant.py to write the game's data.
#   "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup -P art/meshy/hero-ant/build_ant.py
#
# Shapes are written in game units and axes (three.js: x = forward, y = up, z = the ant's left), feet at y = 0,
# about 0.9 long, the same layout as the old code ant so cargo, flips and caste stretching still line up.
# Blender gets them as (x, -z, y). Part names are the contract with client/src/components/nest3d/ants3d.ts:
#   gaster, petiole, petiole_a, petiole_b (two-node waist), mesosoma, head, eye_L/R, mandible_L/R,
#   sickle_L/R (army major jaws), antenna_L/R, leg1_L .. leg3_R (1 = front). "_L" is +z.
# A float point attribute "tone" darkens (< 1) or pales (> 1) the chitin: eyes, gaster bands.
import bpy, bmesh, math, os
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
TAU = math.tau

def B(p):  # game (x, y, z) -> Blender (x, -z, y)
    return Vector((p[0], -p[2], p[1]))

LODS = {
    # around: segments round a body part; tube: round a leg; step: rings per unit of length on tubes
    'close': dict(around=14, tube=6, step=30, claws=True, bands=True, ring=1.0),
    'crowd': dict(around=8, tube=4, step=6, claws=False, bands=False, ring=0.5),
}

class Mesh:
    """Collects vertices (game axes), faces and a tone per vertex for one part."""
    def __init__(self):
        self.v, self.f, self.t = [], [], []
    def add(self, p, tone=1.0):
        self.v.append(Vector(p)); self.t.append(tone); return len(self.v) - 1

def ellipsoid(m, c, r, tilt=0.0, around=12, ts=None, tone=lambda u: 1.0, squash=None):
    """A lathe ellipsoid with poles along x (so its rings are bands across the body). ts are polar angles in (0, pi).
    squash(u) scales the radius at fraction u along (0 = back pole, 1 = front) for egg shapes."""
    if ts is None:
        n = max(4, around * 2 // 3)
        ts = [math.pi * i / n for i in range(1, n)]
    rot = Matrix.Rotation(tilt, 3, 'Z')
    C = Vector(c)
    def P(x, y, z):
        return C + rot @ Vector((x * r[0], y * r[1], z * r[2]))
    back = m.add(P(-1, 0, 0), tone(0.0))
    rings = []
    for t in ts:
        x = -math.cos(t); s = math.sin(t); u = (x + 1) / 2
        k = squash(u) if squash else 1.0
        rings.append([m.add(P(x, s * k * math.cos(a), s * k * math.sin(a)), tone(u)) for a in (TAU * j / around for j in range(around))])
    front = m.add(P(1, 0, 0), tone(1.0))
    n = around
    for j in range(n):
        m.f.append((back, rings[0][(j + 1) % n], rings[0][j]))
        m.f.append((front, rings[-1][j], rings[-1][(j + 1) % n]))
    for a, b in zip(rings, rings[1:]):
        for j in range(n):
            m.f.append((a[j], a[(j + 1) % n], b[(j + 1) % n], b[j]))

def sweep(m, pts, radii, around, step, flat=1.0, cap=True):
    """A tube through pts (smoothly resampled) with radius going through radii; flat squashes it vertically."""
    pts = [Vector(p) for p in pts]
    # resample along a Catmull-Rom curve through the points
    L = sum((b - a).length for a, b in zip(pts, pts[1:]))
    n = max(2, int(L * step) + 1)
    def cr(t):
        k = min(len(pts) - 2, int(t * (len(pts) - 1)))
        u = t * (len(pts) - 1) - k
        p0 = pts[max(0, k - 1)]; p1 = pts[k]; p2 = pts[k + 1]; p3 = pts[min(len(pts) - 1, k + 2)]
        return 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u ** 3)
    def rad(t):
        k = min(len(radii) - 2, int(t * (len(radii) - 1)))
        u = t * (len(radii) - 1) - k
        return radii[k] * (1 - u) + radii[k + 1] * u
    cs = [cr(i / (n - 1)) for i in range(n)]
    rings = []
    nrm = None
    for i, c in enumerate(cs):
        d = (cs[min(i + 1, n - 1)] - cs[max(i - 1, 0)]).normalized()
        if nrm is None:
            nrm = Vector((0, 1, 0)) if abs(d.y) < 0.9 else Vector((1, 0, 0))
        nrm = (nrm - d * nrm.dot(d)).normalized()  # parallel transport
        bin_ = d.cross(nrm)
        r = rad(i / (n - 1))
        rings.append([m.add(c + (nrm * math.cos(a) * flat + bin_ * math.sin(a)) * r) for a in (TAU * j / around for j in range(around))])
    k = around
    for a, b in zip(rings, rings[1:]):
        for j in range(k):
            m.f.append((a[j], a[(j + 1) % k], b[(j + 1) % k], b[j]))
    if cap:
        e0 = m.add(cs[0] - (cs[1] - cs[0]).normalized() * radii[0] * 0.5)
        e1 = m.add(cs[-1] + (cs[-1] - cs[-2]).normalized() * radii[-1] * 0.6)
        for j in range(k):
            m.f.append((e0, rings[0][(j + 1) % k], rings[0][j]))
            m.f.append((e1, rings[-1][j], rings[-1][(j + 1) % k]))
    return cs

def ball(m, c, r, around):
    ellipsoid(m, c, (r, r, r), around=max(5, around))

HX, HY = 0.2, 0.175  # head centre
VARIANTS = {'petiole_a', 'petiole_b', 'sickle_L', 'sickle_R'}  # caste extras, not on the worker

def build(lod):
    o = LODS[lod]
    A, T, S = o['around'], o['tube'], o['step']
    parts = {}
    def part(name):
        parts[name] = Mesh(); return parts[name]

    # gaster: a big egg, tipped up at the front, with two pale bands like the concept
    bands = [0.46, 0.66]
    def gtone(u):
        if not o['bands']:
            return 1.0
        return 1.0 + 0.32 * max(0.0, *(1 - abs(u - b) / 0.035 for b in bands))
    ts = None
    if o['bands']:
        ts = sorted({math.pi * i / 10 for i in range(1, 10)} | {math.acos(1 - 2 * (b + d)) for b in bands for d in (-0.035, 0, 0.035)})
    ellipsoid(part('gaster'), (-0.275, 0.175, 0), (0.205, 0.15, 0.155), tilt=0.22, around=A, ts=ts, tone=gtone,
              squash=lambda u: 0.93 + 0.07 * math.sin(u * math.pi) ** 0.5)
    # waist: one rounded node, or two for army ants
    ellipsoid(part('petiole'), (-0.078, 0.172, 0), (0.038, 0.072, 0.04), tilt=-0.3, around=max(6, A * 2 // 3))
    ellipsoid(part('petiole_a'), (-0.11, 0.15, 0), (0.038, 0.047, 0.034), around=max(6, A * 2 // 3))
    ellipsoid(part('petiole_b'), (-0.05, 0.15, 0), (0.034, 0.043, 0.031), around=max(6, A * 2 // 3))
    # mesosoma: one smooth oval, higher in front (the concept's humped thorax)
    ellipsoid(part('mesosoma'), (0.035, 0.16, 0), (0.125, 0.07, 0.066), tilt=-0.12, around=A,
              squash=lambda u: 0.8 + 0.25 * u)
    # head: round, a touch wider than tall
    ellipsoid(part('head'), (HX, HY, 0), (0.088, 0.08, 0.085), tilt=-0.25, around=A)
    for s, sd in ((1, 'L'), (-1, 'R')):
        e = part('eye_' + sd)
        ellipsoid(e, (HX + 0.045, HY + 0.02, s * 0.064), (0.024, 0.028, 0.02), around=max(5, A * 2 // 3), tone=lambda u: 0.12)
        # mandibles: short curved blades that meet in front, flattened top to bottom
        sweep(part('mandible_' + sd), [(HX + 0.055, 0.14, s * 0.045), (HX + 0.1, 0.13, s * 0.045), (HX + 0.135, 0.124, s * 0.025), (HX + 0.145, 0.122, s * 0.004)],
              [0.024, 0.019, 0.012, 0.004], T, S, flat=0.4)
        # army-major sickles: long, hooking in past each other
        sweep(part('sickle_' + sd), [(HX + 0.06, 0.142, s * 0.038), (HX + 0.15, 0.13, s * 0.05), (HX + 0.22, 0.12, s * 0.02), (HX + 0.21, 0.115, s * -0.012)],
              [0.018, 0.013, 0.008, 0.003], T, S, flat=0.6)
        # antennae: scape up and out, an elbow, then the funiculus forward to a club
        an = part('antenna_' + sd)
        a0, a1, a2 = (HX + 0.035, HY + 0.045, s * 0.035), (HX + 0.075, 0.31, s * 0.075), (HX + 0.215, 0.275, s * 0.125)
        sweep(an, [a0, a1], [0.012, 0.01], T, S)
        if o['claws']:
            ball(an, a1, 0.012, T + 1)
        sweep(an, [a1, a2], [0.0085, 0.0085], T, S)
        d = (Vector(a2) - Vector(a1)).normalized()
        club = Vector(a2) + d * 0.012
        ellipsoid(an, club, (0.024, 0.0125, 0.0125), tilt=math.atan2(d.y, d.x), around=T + 1 if o['claws'] else 4)
    # legs: femur, knee, tibia, tarsus and (close up) a pair of tiny claws; hips under the mesosoma
    hips, kneeDx, footDx = [0.085, 0.03, -0.025], [0.07, 0.0, -0.075], [0.2, 0.03, -0.21]
    for k in range(3):
        for s, sd in ((1, 'L'), (-1, 'R')):
            lg = part(f'leg{k + 1}_{sd}')
            hip = Vector((hips[k], 0.13, s * 0.035))
            knee = Vector((hips[k] + kneeDx[k], 0.215, s * 0.15))
            foot = Vector((hips[k] + footDx[k], 0.006, s * 0.25))
            ankle = knee.lerp(foot, 0.8); ankle.y = 0.035
            flat_dir = Vector((foot.x - ankle.x, 0, foot.z - ankle.z)).normalized()
            toe = foot + flat_dir * 0.03; toe.y = 0.004
            sweep(lg, [hip, hip.lerp(knee, 0.55) + Vector((0, 0.012, 0)), knee], [0.024, 0.021, 0.016], T, S)
            if o['claws']:
                ball(lg, knee, 0.018, T + 1)  # knee joint, close up only
            sweep(lg, [knee, knee.lerp(ankle, 0.5), ankle], [0.0155, 0.013, 0.01], T, S)
            sweep(lg, [ankle, ankle.lerp(toe, 0.5) + Vector((0, 0.006, 0)), toe], [0.0095, 0.008, 0.006], max(4, T - 1), S)
            if o['claws']:
                side = Vector((0, 1, 0)).cross(flat_dir).normalized()
                for c in (1, -1):
                    sweep(lg, [toe, toe + flat_dir * 0.012 + side * c * 0.008 + Vector((0, 0.004, 0)), toe + flat_dir * 0.018 + side * c * 0.012 - Vector((0, 0.002, 0))],
                          [0.004, 0.003, 0.001], 3, S)
    return parts

def to_blender(lod, parts):
    col = bpy.data.collections.new('ant_' + lod)
    bpy.context.scene.collection.children.link(col)
    mat = bpy.data.materials.get('chitin') or bpy.data.materials.new('chitin')
    mat.diffuse_color = (0.48, 0.12, 0.03, 1)
    for name, m in parts.items():
        me = bpy.data.meshes.new(f'{name}_{lod}')
        me.from_pydata([B(v) for v in m.v], [], m.f)
        me.validate(); me.update()
        bm = bmesh.new(); bm.from_mesh(me)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)  # every face points out
        bm.to_mesh(me); bm.free()
        for poly in me.polygons:
            poly.use_smooth = True
        at = me.attributes.new('tone', 'FLOAT', 'POINT')
        at.data.foreach_set('value', m.t)
        me.materials.append(mat)
        ob = bpy.data.objects.new(f'{name}_{lod}' if lod != 'close' else name, me)
        col.objects.link(ob)
        if name in VARIANTS:
            ob.hide_render = ob.hide_viewport = True  # caste variants: in the file, not on the worker
    return col

bpy.ops.wm.read_factory_settings(use_empty=True)
for lod in LODS:
    c = to_blender(lod, build(lod))
    if lod == 'crowd':
        for ob in c.objects:
            ob.location.y += 0.7  # beside the close-up ant, so both can be compared in the viewport
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'hero-ant.blend'))
def tri(m): return sum(len(f) - 2 for f in m.f)
for lod in LODS:
    ps = build(lod); w = {k: tri(v) for k, v in ps.items() if k not in VARIANTS}
    print('BUILT', lod, 'worker tris', sum(w.values()), {k: v for k, v in w.items() if k.endswith('_R') is False and '_L' not in k or k in ('leg1_L', 'antenna_L', 'mandible_L', 'eye_L')})
