"""Dead lizard (windfall): Meshy mesh -> coloured parts in Blender -> game data (same format as the grasshopper).

  build   blender -b --factory-startup --python dead-lizard.blend.py -- build meshy/dead_lizard.glb dead-lizard.blend
  export  blender -b dead-lizard.blend --python dead-lizard.blend.py -- export ../../../client/src/components/three/dead-lizard.json [preview.png]
  render  blender -b dead-lizard.blend --python dead-lizard.blend.py -- render preview.png

A sandy desert lizard on its back: pale belly up, four stubby legs in the air, tail curled to one side, X eyes,
tongue out. In the .blend the body is one object ("lizard") whose faces use the dl_* materials; the eyes and tongue
are their own objects. All of them sit in the "dead_lizard" collection. The export writes one part per object and
material, coloured by that material, scaled so the lizard is 1 unit nose to tail, standing on y = 0 (three.js axes),
head towards +z.
"""
import bpy, bmesh, json, sys, math
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

args = sys.argv[sys.argv.index("--") + 1:]
mode = args[0]

COLOURS = {
    "back": "#C98A4B",    # sandy orange-brown: back, sides, legs
    "belly": "#F1DDB0",   # pale cream belly, throat and the inside of the tail
    "stripe": "#9A5E2E",  # rust bands along the sides
    "claw": "#5A3A22",    # dark toe tips
    "eye": "#2A1A10",     # the X eyes
    "tongue": "#E48A8A",
}


def hex_rgba(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return (*[x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c], 1.0)


def rgba_hex(c):
    s = [x * 12.92 if x <= 0.0031308 else 1.055 * x ** (1 / 2.4) - 0.055 for x in c[:3]]
    return "#" + "".join(f"{round(max(0, min(1, x)) * 255):02X}" for x in s)


def material(kind):
    m = bpy.data.materials.get(f"dl_{kind}") or bpy.data.materials.new(f"dl_{kind}")
    m.diffuse_color = hex_rgba(COLOURS[kind])
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = hex_rgba(COLOURS[kind])
    return m


def bounds(o):
    vs = [o.matrix_world @ v.co for v in o.data.vertices]
    return Vector([min(v[i] for v in vs) for i in range(3)]), Vector([max(v[i] for v in vs) for i in range(3)])


def thickness(bvh, f):
    """How far a ray from the face, going inward, travels before it leaves the mesh: thin for legs, toes, tail tip."""
    hit = bvh.ray_cast(f.center - f.normal * 1e-4, -f.normal, 1.0)
    return hit[3] if hit[0] is not None else 1.0


def paint(o, lo, hi):
    """Head at -y, tail at +y, lying on its back (belly up, +z)."""
    me = o.data
    me.materials.clear()
    for k in ("back", "belly", "stripe", "claw"):
        me.materials.append(material(k))
    bvh = BVHTree.FromObject(o, bpy.context.evaluated_depsgraph_get())
    thin = {f.index: thickness(bvh, f) < 0.055 for f in me.polygons}
    limb_top = max((f.center.z for f in me.polygons if thin[f.index] and f.center.y < 0.2), default=hi.z)
    count = {k: 0 for k in ("back", "belly", "stripe", "claw")}
    for f in me.polygons:
        c, n = f.center, f.normal
        if thin[f.index]:
            # legs stay sandy; the tips of the toes (the top of what sticks up) are dark claws
            k = "claw" if c.y < 0.2 and c.z > limb_top - 0.035 else "back"
        elif n.z > 0.45:
            k = "belly"
        elif abs(n.x) > 0.6 and abs(n.z) < 0.55 and lo.z + 0.03 < c.z < lo.z + 0.2 and -0.3 < c.y < 0.32 and (c.y / 0.075) % 1 < 0.38:
            k = "stripe"
        else:
            k = "back"
        f.material_index = ("back", "belly", "stripe", "claw").index(k)
        count[k] += 1
    return count


def add_eyes(coll, body, lo, hi):
    """Two X marks on the sides of the head, where a ray from the side meets the skin."""
    bvh = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())
    head = [v.co for v in body.data.vertices if v.co.y < lo.y + 0.17]
    hc = sum(head, Vector()) / len(head)
    made = []
    for side in (-1, 1):
        start = Vector((hc.x + side * 0.5, hc.y - 0.02, hc.z + 0.03))
        hit, nrm, _, _ = bvh.ray_cast(start, Vector((-side, 0, 0)), 1.0)
        if hit is None:
            continue
        size = 0.032
        bm = bmesh.new()
        for ang in (math.radians(45), math.radians(-45)):
            m = Matrix.Rotation(ang, 4, "Z") @ Matrix.Diagonal((size, size * 0.24, 0.006, 1))
            bmesh.ops.create_cube(bm, size=2, matrix=m)
        me = bpy.data.meshes.new(f"eye_{'left' if side < 0 else 'right'}")
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new(me.name, me)
        rot = nrm.to_track_quat("Z", "Y").to_matrix().to_4x4()
        ob.matrix_world = Matrix.Translation(hit + nrm * 0.004) @ rot
        me.materials.append(material("eye"))
        coll.objects.link(ob)
        made.append(ob.name)
    return made, hc


def add_tongue(coll, body, lo, hc):
    """A little pink tongue lolling out of the front of the mouth, drooping towards the ground."""
    bvh = BVHTree.FromObject(body, bpy.context.evaluated_depsgraph_get())
    start = Vector((hc.x, lo.y - 0.2, hc.z - 0.03))
    hit, nrm, _, _ = bvh.ray_cast(start, Vector((0, 1, 0)), 1.0)
    if hit is None:
        return None
    bpy.ops.mesh.primitive_uv_sphere_add(segments=10, ring_count=6, radius=0.03, location=hit + Vector((0, -0.012, -0.012)))
    t = bpy.context.active_object
    t.name = t.data.name = "tongue"
    t.scale = (0.75, 1.3, 0.35)
    t.rotation_euler = (math.radians(35), 0, 0)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    t.data.materials.append(material("tongue"))
    for x in list(t.users_collection):
        x.objects.unlink(t)
    coll.objects.link(t)
    return t.name


def build(src, out):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=src)
    o = [x for x in bpy.data.objects if x.type == "MESH"][0]
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    o.parent = None
    o.name = o.data.name = "lizard"
    coll = bpy.data.collections.new("dead_lizard")
    bpy.context.scene.collection.children.link(coll)
    for c in list(o.users_collection):
        c.objects.unlink(o)
    coll.objects.link(o)
    for p in o.data.polygons:
        p.use_smooth = False
    lo, hi = bounds(o)
    count = paint(o, lo, hi)
    eyes, hc = add_eyes(coll, o, lo, hi)
    tongue = add_tongue(coll, o, lo, hc)
    for c in list(bpy.data.collections):
        if c is not coll and not c.objects:
            bpy.data.collections.remove(c)
    for ob in list(bpy.data.objects):
        if ob.type != "MESH":
            bpy.data.objects.remove(ob)
    bpy.ops.wm.save_as_mainfile(filepath=out)
    return {"faces": count, "eyes": eyes, "tongue": tongue, "size": [round(x, 3) for x in (hi - lo)]}


def export(out, preview=None):
    objs = [o for o in bpy.data.collections["dead_lizard"].all_objects if o.type == "MESH" and o.visible_get()]
    pts = [o.matrix_world @ v.co for o in objs for v in o.data.vertices]
    lo = Vector((min(v.x for v in pts), min(v.y for v in pts), min(v.z for v in pts)))
    hi = Vector((max(v.x for v in pts), max(v.y for v in pts), max(v.z for v in pts)))
    k = 1 / (hi.y - lo.y)
    cx, cy = (lo.x + hi.x) / 2, (lo.y + hi.y) / 2
    res, tris = [], 0
    for o in sorted(objs, key=lambda o: o.name):
        for mi, m in enumerate(o.data.materials):
            bm = bmesh.new()
            bm.from_mesh(o.data)
            bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index != mi], context="FACES")
            bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
            if not bm.faces:
                bm.free()
                continue
            bmesh.ops.triangulate(bm, faces=bm.faces)
            bm.verts.index_update()
            p = []
            for v in bm.verts:
                w = o.matrix_world @ v.co
                p += [round((w.x - cx) * k, 4), round((w.z - lo.z) * k, 4), round(-(w.y - cy) * k, 4)]
            res.append({"name": f"{o.name}_{m.name}", "color": rgba_hex(m.diffuse_color), "wing": False,
                        "p": p, "i": [v.index for f in bm.faces for v in f.verts]})
            tris += len(bm.faces)
            bm.free()
    with open(out, "w") as f:
        json.dump({"source": "Meshy image-to-3d (art/meshy/dead-lizard/notes.md)", "triangles": tris, "parts": res}, f, separators=(",", ":"))
    if preview:
        render(preview)
    return {"parts": len(res), "triangles": tris, "size": [round((hi.x - lo.x) * k, 3), round((hi.z - lo.z) * k, 3), round((hi.y - lo.y) * k, 3)]}


def render(path, views=(("", (1.0, -1.25, 0.95)),)):
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.display.shading.light = "STUDIO"
    sc.display.shading.color_type = "MATERIAL"
    sc.display.shading.show_object_outline = True
    sc.display.shading.object_outline_color = (0.11, 0.06, 0.03)
    sc.render.resolution_x = sc.render.resolution_y = 900
    sc.render.film_transparent = False
    cam = bpy.data.objects.get("preview_cam") or bpy.data.objects.new("preview_cam", bpy.data.cameras.new("preview_cam"))
    if cam.name not in sc.collection.objects:
        sc.collection.objects.link(cam)
    cam.data.lens = 50
    sc.camera = cam
    for suffix, loc in views:
        cam.location = loc
        cam.rotation_euler = (Vector((0, 0, -0.1)) - cam.location).to_track_quat("-Z", "Y").to_euler()
        sc.render.filepath = path.replace(".png", f"{suffix}.png")
        bpy.ops.render.render(write_still=True)


if mode == "build":
    print("RESULT", json.dumps(build(args[1], args[2])))
elif mode == "export":
    print("RESULT", json.dumps(export(args[1], args[2] if len(args) > 2 else None)))
elif mode == "render":
    render(args[1], (("_34", (1.0, -1.25, 0.95)), ("_top", (0.01, -0.2, 2.0)), ("_side", (1.8, 0, 0.3)), ("_head", (0.3, -1.6, 0.4))))
