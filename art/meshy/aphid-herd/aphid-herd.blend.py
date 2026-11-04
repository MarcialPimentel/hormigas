"""The aphid herd: a Meshy poppy and a Meshy aphid -> coloured, named parts in Blender -> game data.

  build   Colour the two Meshy models by region, split each colour into its own part, add the aphid's eyes,
          save aphid-herd.blend
          blender -b --factory-startup --python aphid-herd.blend.py -- build meshy/poppy.glb meshy/aphid.glb aphid-herd.blend
  export  Read the parts back from the .blend (after any touch-ups) and write the game's data file
          blender -b aphid-herd.blend --python aphid-herd.blend.py -- export ../../../client/src/components/three/aphid-herd.json [preview.png]

In the .blend the poppy's parts are in the "poppy" collection and the aphid's in "aphid". A part's material
colour is its colour in the game; a part whose name starts with "petal" or "leaf" is drawn two-sided.
The poppy exports 1 unit tall, the aphid 1 unit nose to tail; both sit on y = 0, centred, facing +z
(three.js axes). The aphid's head is towards +z.
"""
import bpy, bmesh, json, math, sys
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:]
mode = args[0]

# the sunlit-microcosm palette (docs/art/sunlit-microcosm.md): Poppy, Aphid, the grasshopper's greens
COLOURS = {
    "petal": "#FF6B4F", "petal_in": "#E2503A", "blotch": "#3A1A14", "seed": "#C9DB8A", "stamen": "#2B1D12",
    "stem": "#4E7A2A", "leaf": "#5F8C30", "grass": "#6E9A34",
    "body": "#B5E04A", "belly": "#DDEB9A", "leg": "#8DB83A", "dew": "#F2B21F",
    "eye": "#2B1D12", "eye_white": "#F7F4EA",
}


def hex_rgba(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    lin = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return (*lin, 1.0)


def rgba_hex(c):
    s = [x * 12.92 if x <= 0.0031308 else 1.055 * x ** (1 / 2.4) - 0.055 for x in c[:3]]
    return "#" + "".join(f"{round(max(0, min(1, x)) * 255):02X}" for x in s)


def material(kind):
    name = f"ah_{kind}"
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.diffuse_color = hex_rgba(COLOURS[kind])
    m.use_nodes = True
    m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = hex_rgba(COLOURS[kind])
    return m


def bounds(pts):
    return (Vector((min(v.x for v in pts), min(v.y for v in pts), min(v.z for v in pts))),
            Vector((max(v.x for v in pts), max(v.y for v in pts), max(v.z for v in pts))))


def poppy_kind(c, n, lo, hi, head):
    """Blender axes, z up. `head` is the flower cup's centre (x, y) and the height where the cup starts."""
    h = (c.z - lo.z) / (hi.z - lo.z)
    if h < 0.13:
        return "grass"
    if c.z > head.z:
        r = math.hypot(c.x - head.x, c.y - head.y)
        if r < 0.05 and c.z > head.z + 0.05:
            return "seed"
        if r < 0.075:
            return "blotch"
        return "petal_in" if n.z > 0.35 else "petal"
    r = math.hypot(c.x - STEM[0](c.z), c.y - STEM[1](c.z))
    return "stem" if r < 0.03 else "leaf"


STEM = (lambda z: 0.0, lambda z: 0.0)


def aphid_kind(c, n, lo, hi):
    """Blender axes, z up, head towards -y (Meshy's front)."""
    h = (c.z - lo.z) / (hi.z - lo.z)
    if h < 0.2:
        return "leg"
    if c.y > hi.y - 0.12 and h < 0.45 and c.z < 0 and abs(c.x) < 0.1:
        return "dew"
    if n.z < -0.45 or h < 0.32:
        return "belly"
    return "body"


def colour_split(obj, kind_of, coll, prefix=""):
    """Give each face a material by region, then split by material into named parts in `coll`."""
    me = obj.data
    me.materials.clear()
    kinds = []
    pts = [obj.matrix_world @ v.co for v in me.vertices]
    lo, hi = bounds(pts)
    for f in me.polygons:
        c = obj.matrix_world @ f.center
        n = (obj.matrix_world.to_3x3() @ f.normal).normalized()
        k = kind_of(c, n, lo, hi)
        if k not in kinds:
            kinds.append(k)
            me.materials.append(material(k))
        f.material_index = kinds.index(k)
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    coll.objects.link(obj)
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.mesh.separate(type="MATERIAL")
    for p in list(coll.objects):
        m = p.active_material
        p.data.materials.clear()
        p.data.materials.append(m)
        p.name = p.data.name = prefix + m.name[3:]
    return kinds


def import_one(path, coll_name):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == "MESH"]
    for o in new:
        if o.type != "MESH":
            bpy.data.objects.remove(o)
    coll = bpy.data.collections.new(coll_name)
    bpy.context.scene.collection.children.link(coll)
    for o in meshes:
        o.matrix_world = o.matrix_world.copy()
        o.parent = None
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return meshes, coll


def build(poppy_src, aphid_src, out):
    global STEM
    bpy.ops.wm.read_factory_settings(use_empty=True)
    # --- poppy: the main mesh, plus 7 tiny stamen bits
    meshes, pc = import_one(poppy_src, "poppy")
    bpy.context.view_layer.objects.active = meshes[0]
    for o in meshes:
        o.select_set(True)
    if len(meshes) > 1:
        bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    bpy.ops.mesh.separate(type="LOOSE")
    parts = [x for x in bpy.data.objects if x.type == "MESH"]
    main = max(parts, key=lambda p: len(p.data.polygons))
    stamens = [p for p in parts if p is not main]
    pts = [v.co for v in main.data.vertices]
    lo, hi = bounds(pts)
    # the stem's centre line, from thin slices of the mesh's middle (leaves are wide, so take the median)
    zs, xs, ys = [], [], []
    for i in range(24):
        a = lo.z + (hi.z - lo.z) * i / 24
        b = a + (hi.z - lo.z) / 24
        s = sorted(v for v in pts if a <= v.z <= b)
        if s:
            zs.append((a + b) / 2)
            xs.append(sorted(v.x for v in s)[len(s) // 2])
            ys.append(sorted(v.y for v in s)[len(s) // 2])

    def interp(vals):
        def f(z):
            if z <= zs[0]:
                return vals[0]
            for j in range(1, len(zs)):
                if z <= zs[j]:
                    t = (z - zs[j - 1]) / (zs[j] - zs[j - 1])
                    return vals[j - 1] * (1 - t) + vals[j] * t
            return vals[-1]
        return f
    STEM = (interp(xs), interp(ys))
    sc = [v for v in pts if v.z > lo.z + (hi.z - lo.z) * 0.6]
    sl, sh = bounds(sc)
    stam = [v for p in stamens for v in p.data.vertices]
    if stam:
        head = Vector((sum(v.co.x for v in stam) / len(stam), sum(v.co.y for v in stam) / len(stam), HEAD_Z))
    else:
        head = Vector(((sl.x + sh.x) / 2, (sl.y + sh.y) / 2, HEAD_Z))
    kinds = colour_split(main, lambda c, n, l, h: poppy_kind(c, n, l, h, head), pc)
    for i, s in enumerate(stamens):
        s.data.materials.clear()
        s.data.materials.append(material("stamen"))
        s.name = s.data.name = f"stamen_{i + 1}"
        for c in list(s.users_collection):
            c.objects.unlink(s)
        pc.objects.link(s)
    # --- aphid: one mesh; add two eyes on the face
    meshes, ac = import_one(aphid_src, "aphid")
    a = meshes[0]
    akinds = colour_split(a, aphid_kind, ac)
    apts = [v.co for p in ac.objects for v in p.data.vertices]
    alo, ahi = bounds(apts)
    for side in (-1, 1):
        ey = Vector((side * EYE[0], alo.y + EYE[1], EYE[2]))
        # nudge the eye out to the surface along -y
        bpy.ops.mesh.primitive_uv_sphere_add(segments=8, ring_count=6, radius=EYE[3], location=ey)
        e = bpy.context.active_object
        e.scale = (1, 0.6, 1)
        e.name = e.data.name = f"eye_{'l' if side < 0 else 'r'}"
        e.data.materials.append(material("eye"))
        for c in list(e.users_collection):
            c.objects.unlink(e)
        ac.objects.link(e)
    bpy.ops.wm.save_as_mainfile(filepath=out)
    return {"poppy": kinds + [f"stamen x{len(stamens)}"], "aphid": akinds, "head": list(head), "aphid_lo": list(alo), "aphid_hi": list(ahi)}


GAP = 0.06            # perches at least this far apart (an aphid is about 0.07 long next to a poppy 1 tall)
HEAD_Z = 0.2          # where the flower cup starts (Blender z of the Meshy poppy)
EYE = (0.1, 0.06, 0.1, 0.045)   # x offset, inset from the nose, height, radius


def dump(coll, k_of_size):
    parts = [o for o in bpy.data.collections[coll].all_objects if o.type == "MESH" and o.visible_get()]
    allpts = [o.matrix_world @ v.co for o in parts for v in o.data.vertices]
    lo, hi = bounds(allpts)
    k = k_of_size(lo, hi)
    cx, cy = (lo.x + hi.x) / 2, (lo.y + hi.y) / 2
    res, tris = [], 0
    for o in sorted(parts, key=lambda o: o.name):
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bmesh.ops.triangulate(bm, faces=bm.faces)
        bm.verts.index_update()
        p = []
        for v in bm.verts:
            w = o.matrix_world @ v.co
            # Blender (x, y, z) z-up, front -y  ->  three.js (x, z, -y) y-up, front +z
            p += [round((w.x - cx) * k, 4), round((w.z - lo.z) * k, 4), round(-(w.y - cy) * k, 4)]
        idx = [v.index for f in bm.faces for v in f.verts]
        tris += len(bm.faces)
        m = o.active_material
        two = o.name.startswith(("petal", "leaf"))
        res.append({"name": o.name, "color": rgba_hex(m.diffuse_color) if m else "#8DB83A", "two": two, "p": p, "i": idx})
        bm.free()
    size = [round((hi.x - lo.x) * k, 3), round((hi.z - lo.z) * k, 3), round((hi.y - lo.y) * k, 3)]
    return {"triangles": tris, "size": size, "parts": res}


def perches(n_stem=11, n_leaf=3):
    """Spots where aphids sit, in the poppy's exported space: a spiral up the stem (top first), then leaf tops."""
    parts = [o for o in bpy.data.collections["poppy"].all_objects if o.type == "MESH"]
    allpts = [o.matrix_world @ v.co for o in parts for v in o.data.vertices]
    lo, hi = bounds(allpts)
    k = 1 / (hi.z - lo.z)
    cx, cy = (lo.x + hi.x) / 2, (lo.y + hi.y) / 2
    faces = lambda name: [(o.matrix_world @ f.center, (o.matrix_world.to_3x3() @ f.normal).normalized(), f.area)
                          for o in parts if o.name.startswith(name) for f in o.data.polygons]
    out = []
    stem = faces("stem")
    for i in range(n_stem):
        h = 0.72 - i * (0.72 - 0.3) / (n_stem - 1)
        z = lo.z + h * (hi.z - lo.z)
        a = i * 2.4
        d = Vector((math.cos(a), math.sin(a), 0))
        free = [f for f in stem if all((f[0] - q[0]).length * k > GAP for q in out)]
        band = [f for f in free if abs(f[0].z - z) < 0.04 and abs(f[1].z) < 0.6] or free
        c, n, _ = max(band, key=lambda f: f[1].dot(d) - abs(f[0].z - z) * 4)
        out.append((c, n))
    leaf = [f for f in faces("leaf") if f[1].z > 0.55 and f[2] > 0.0004]
    for _ in range(n_leaf):
        leaf = [f for f in leaf if all((f[0] - q[0]).length * k > GAP for q in out)]
        if not leaf:
            break
        c, n, _ = max(leaf, key=lambda f: min((f[0] - q[0]).length for q in out) + f[0].z * 0.3)
        out.append((c, n))
    conv = lambda v, s=1: [round((v.x - cx) * k * s, 4), round((v.z - lo.z) * k * s, 4), round(-(v.y - cy) * k * s, 4)]
    nconv = lambda v: [round(v.x, 3), round(v.z, 3), round(-v.y, 3)]
    return [{"p": conv(c), "n": nconv(n)} for c, n in out]


def export(out, preview=None):
    poppy = dump("poppy", lambda lo, hi: 1 / (hi.z - lo.z))
    poppy["perches"] = perches()
    aphid = dump("aphid", lambda lo, hi: 1 / (hi.y - lo.y))
    with open(out, "w") as f:
        json.dump({"source": "Meshy image-to-3d (art/meshy/aphid-herd/notes.md)", "poppy": poppy, "aphid": aphid}, f, separators=(",", ":"))
    if preview:
        render(preview)
    return {k: {"parts": len(v["parts"]), "triangles": v["triangles"], "size": v["size"]} for k, v in (("poppy", poppy), ("aphid", aphid))}


def render(path, angles=((1.3, -1.5, 0.6), (0.0, -1.6, 0.2), (0.3, -0.4, 2.0))):
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.display.shading.light = "STUDIO"
    sc.display.shading.color_type = "MATERIAL"
    sc.display.shading.show_object_outline = True
    sc.display.shading.object_outline_color = (0.11, 0.06, 0.03)
    sc.render.resolution_x = sc.render.resolution_y = 700
    sc.display.shading.background_type = "VIEWPORT"
    sc.display.shading.background_color = (0.97, 0.95, 0.9)
    cam = bpy.data.objects.get("preview_cam") or bpy.data.objects.new("preview_cam", bpy.data.cameras.new("preview_cam"))
    if cam.name not in sc.collection.objects:
        sc.collection.objects.link(cam)
    cam.data.lens = 50
    sc.camera = cam
    for coll in ("poppy", "aphid"):
        for c in bpy.data.collections:
            c.hide_render = c.name != coll
        pts = [o.matrix_world @ v.co for o in bpy.data.collections[coll].all_objects if o.type == "MESH" for v in o.data.vertices]
        lo, hi = bounds(pts)
        mid = (lo + hi) / 2
        size = max(hi - lo)
        for i, a in enumerate(angles):
            cam.location = mid + Vector(a) * size * 1.2
            cam.rotation_euler = (mid - cam.location).to_track_quat("-Z", "Y").to_euler()
            sc.render.filepath = path.replace(".png", f"_{coll}_{i}.png")
            bpy.ops.render.render(write_still=True)
    for c in bpy.data.collections:
        c.hide_render = False


if mode == "build":
    r = build(args[1], args[2], args[3])
    if len(args) > 4:
        render(args[4])
    print("RESULT", json.dumps(r))
elif mode == "export":
    print("RESULT", json.dumps(export(args[1], args[2] if len(args) > 2 else None)))
