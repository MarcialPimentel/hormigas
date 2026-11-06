"""The garden daisy: Meshy mesh -> coloured, named parts in Blender -> game data.

  build   Split the Meshy model into stem, petals and eye, tilt the head up, colour them, save garden-flower.blend
          blender -b --factory-startup --python garden-flower.blend.py -- build meshy/daisy.glb garden-flower.blend
  export  Read the parts back from the .blend (after any touch-ups) and write the game's data file
          blender -b garden-flower.blend --python garden-flower.blend.py -- export ../../../client/src/components/three/garden-flower.json [preview.png]

In the .blend every part is its own object in the "flower" collection. Its material's colour is the colour in
the game. Parts whose name starts with "petals" are white: the game tints them per flower (pink, yellow, white,
lilac, orange). The export is 1 unit tall, standing on the ground (y = 0) round the stem's foot, head facing +z
(three.js axes).
"""
import bpy, bmesh, json, math, sys
from mathutils import Matrix, Vector

args = sys.argv[sys.argv.index("--") + 1:]
mode = args[0]

COLOURS = {"stem": "#6E9A34", "petals": "#FFFFFF", "eye": "#F2B21F"}
# how far the head is tipped back from the Meshy model (which faces forward, like the drawing), so it looks up
HEAD_TILT = math.radians(30)
# the eye: head faces within this distance of the head's middle, on its front
EYE_R = 0.085


def hex_rgba(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    lin = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return (*lin, 1.0)


def rgba_hex(c):
    s = [x * 12.92 if x <= 0.0031308 else 1.055 * x ** (1 / 2.4) - 0.055 for x in c[:3]]
    return "#" + "".join(f"{round(max(0, min(1, x)) * 255):02X}" for x in s)


def material(kind):
    name = f"fl_{kind}"
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.diffuse_color = hex_rgba(COLOURS[kind])
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = hex_rgba(COLOURS[kind])
    return m


def bounds(o):
    pts = [o.matrix_world @ v.co for v in o.data.vertices]
    lo = Vector((min(v.x for v in pts), min(v.y for v in pts), min(v.z for v in pts)))
    hi = Vector((max(v.x for v in pts), max(v.y for v in pts), max(v.z for v in pts)))
    return lo, hi


def build(src, out):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=src)
    o = [x for x in bpy.data.objects if x.type == "MESH"][0]
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.mesh.separate(type="LOOSE")
    parts = [x for x in bpy.data.objects if x.type == "MESH"]
    # the head is the loose part that reaches highest; the rest is stem and leaves
    head = max(parts, key=lambda p: bounds(p)[1].z)
    stem = [p for p in parts if p is not head]
    # which way the head faces: along its thinnest axis, on the side the eye bulges out of
    me = head.data
    centre = sum((v.co for v in me.vertices), Vector()) / len(me.vertices)
    cov = [[sum((v.co[i] - centre[i]) * (v.co[j] - centre[j]) for v in me.vertices) for j in range(3)] for i in range(3)]
    w, vecs = _eig(cov)
    axis = Vector(vecs[min(range(3), key=lambda i: w[i])]).normalized()
    if max((v.co - centre).dot(axis) for v in me.vertices) < -min((v.co - centre).dot(axis) for v in me.vertices):
        axis = -axis
    # tip the head towards the sky round the top of the stem
    up = Vector((0, 0, 1))
    top = max((v.co for p in stem for v in p.data.vertices), key=lambda c: c.z).copy()
    turn = min(HEAD_TILT, axis.angle(up))
    tilt = Matrix.Translation(top) @ Matrix.Rotation(turn, 4, axis.cross(up).normalized()) @ Matrix.Translation(-top)
    me.transform(tilt)
    centre = tilt @ centre
    axis = (tilt.to_3x3() @ axis).normalized()
    bm = bmesh.new()
    bm.from_mesh(me)
    eye = []
    for f in bm.faces:
        c = f.calc_center_median() - centre
        along = c.dot(axis)
        flat = (c - axis * along).length
        if flat < EYE_R and along > 0:
            eye.append(f)
    for f in bm.faces:
        f.select = f in eye
    bm.to_mesh(me)
    bm.free()
    bpy.ops.object.select_all(action="DESELECT")
    head.select_set(True)
    bpy.context.view_layer.objects.active = head
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.separate(type="SELECTED")
    bpy.ops.object.mode_set(mode="OBJECT")
    eye_obj = [x for x in bpy.data.objects if x.type == "MESH" and x not in parts][0]
    coll = bpy.data.collections.new("flower")
    bpy.context.scene.collection.children.link(coll)
    named = [(p, "stem") for p in stem] + [(head, "petals"), (eye_obj, "eye")]
    counts = {}
    for p, kind in named:
        counts[kind] = counts.get(kind, 0) + 1
        p.name = p.data.name = kind if counts[kind] == 1 else f"{kind}_{counts[kind]}"
        p.data.materials.clear()
        p.data.materials.append(material(kind))
        for c in list(p.users_collection):
            c.objects.unlink(p)
        coll.objects.link(p)
    for c in list(bpy.data.collections):
        if c is not coll and not c.objects:
            bpy.data.collections.remove(c)
    bpy.ops.wm.save_as_mainfile(filepath=out)
    return {k: len(o.data.polygons) for o, k in named}


def _eig(a):
    """Eigenvalues and vectors of a symmetric 3x3 (Jacobi), enough to find the head's thin axis."""
    a = [row[:] for row in a]
    v = [[1.0 if i == j else 0.0 for j in range(3)] for i in range(3)]
    for _ in range(50):
        p, q = max(((i, j) for i in range(3) for j in range(i + 1, 3)), key=lambda t: abs(a[t[0]][t[1]]))
        if abs(a[p][q]) < 1e-12:
            break
        th = 0.5 * math.atan2(2 * a[p][q], a[q][q] - a[p][p])
        c, s = math.cos(th), math.sin(th)
        for k in range(3):
            akp, akq = a[k][p], a[k][q]
            a[k][p], a[k][q] = c * akp - s * akq, s * akp + c * akq
        for k in range(3):
            apk, aqk = a[p][k], a[q][k]
            a[p][k], a[q][k] = c * apk - s * aqk, s * apk + c * aqk
        for k in range(3):
            vkp, vkq = v[k][p], v[k][q]
            v[k][p], v[k][q] = c * vkp - s * vkq, s * vkp + c * vkq
    return [a[i][i] for i in range(3)], [[v[k][i] for k in range(3)] for i in range(3)]


def export(out, preview=None):
    parts = [o for o in bpy.data.collections["flower"].all_objects if o.type == "MESH" and o.visible_get()]
    allpts = [o.matrix_world @ v.co for o in parts for v in o.data.vertices]
    lo = Vector((min(v.x for v in allpts), min(v.y for v in allpts), min(v.z for v in allpts)))
    hi = Vector((max(v.x for v in allpts), max(v.y for v in allpts), max(v.z for v in allpts)))
    k = 1 / (hi.z - lo.z)
    # the pivot is the stem's foot (its lowest point), not the middle of the leaves
    stems = [o for o in parts if o.name.startswith("stem")]
    foot = min((o.matrix_world @ v.co for o in stems for v in o.data.vertices), key=lambda c: c.z)
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
            p += [round((w.x - foot.x) * k, 4), round((w.z - lo.z) * k, 4), round(-(w.y - foot.y) * k, 4)]
        idx = [v.index for f in bm.faces for v in f.verts]
        tris += len(bm.faces)
        m = o.active_material
        res.append({"name": o.name, "color": rgba_hex(m.diffuse_color) if m else "#6E9A34",
                    "tint": o.name.startswith("petals"), "p": p, "i": idx})
        bm.free()
    with open(out, "w") as f:
        json.dump({"source": "Meshy image-to-3d (art/meshy/garden-flower/notes.md)", "triangles": tris,
                   "size": [round((hi.x - lo.x) * k, 3), 1, round((hi.y - lo.y) * k, 3)], "parts": res}, f, separators=(",", ":"))
    if preview:
        render(preview)
    return {"parts": len(res), "triangles": tris, "size": [round((hi.x - lo.x) * k, 3), 1, round((hi.y - lo.y) * k, 3)]}


def render(path):
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.display.shading.light = "STUDIO"
    sc.display.shading.color_type = "MATERIAL"
    sc.display.shading.show_object_outline = True
    sc.display.shading.object_outline_color = (0.11, 0.06, 0.03)
    sc.render.resolution_x, sc.render.resolution_y = 1500, 700
    sc.world = sc.world or bpy.data.worlds.new("w")
    sc.display.shading.background_type = "VIEWPORT"
    sc.display.shading.background_color = (0.97, 0.95, 0.9)
    cam = bpy.data.objects.get("preview_cam") or bpy.data.objects.new("preview_cam", bpy.data.cameras.new("preview_cam"))
    if cam.name not in sc.collection.objects:
        sc.collection.objects.link(cam)
    sc.camera = cam
    cam.data.lens = 50
    # three views side by side: copies of the flower turned for front, side and from above
    src = [o for o in bpy.data.collections["flower"].all_objects if o.type == "MESH"]
    shots = []
    for i, (yaw, label) in enumerate([(0, "front"), (math.pi / 2, "side"), (math.pi, "back")]):
        for o in src:
            c = o.copy()
            sc.collection.objects.link(c)
            c.matrix_world = Matrix.Translation((i * 0.75 - 0.75, 0, 0)) @ Matrix.Rotation(yaw, 4, "Z") @ o.matrix_world
            shots.append(c)
    for o in src:
        o.hide_render = True
    cam.location = (0, -2.6, 1.2)
    d = Vector((0, 0, 0.05)) - cam.location
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    for c in shots:
        bpy.data.objects.remove(c)
    for o in src:
        o.hide_render = False


if mode == "build":
    print("RESULT", json.dumps(build(args[1], args[2])))
elif mode == "export":
    print("RESULT", json.dumps(export(args[1], args[2] if len(args) > 2 else None)))
