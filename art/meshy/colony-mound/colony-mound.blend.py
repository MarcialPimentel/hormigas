"""The colony mound: Meshy mesh -> coloured parts in Blender -> game data (the same part format as the termite mound).

  build   blender -b --factory-startup --python colony-mound.blend.py -- build meshy/colony_mound.glb colony-mound.blend
  export  blender -b colony-mound.blend --python colony-mound.blend.py -- export ../../../client/src/components/three/colony-mound.json [preview.png]

In the .blend the mound is the "soil" object plus "pebble" objects, in the "colony_mound" collection. Soil faces use one
of four materials (foot, soil, top, hole); repaint them freely. The export is scaled so the soil dome is 1 unit across
its radius and 1 unit tall, centred on the entrance and standing on y = 0 (three.js axes). The game stretches it to
each growth stage's radius and height.

The bigger stages get extra pebbles round the foot (copies of the Meshy pebbles), sized so a pebble stays pebble-sized
however big the mound grows: growth reads as a wider, busier mound, not just a zoomed one.
"""
import bpy, bmesh, json, math, random, sys
from mathutils import Vector, Matrix

args = sys.argv[sys.argv.index("--") + 1:]
mode = args[0]

COLOURS = {"foot": "#3E2718", "soil": "#573922", "top": "#6E4A2E", "hole": "#140B06", "pebble": "#D8CBB4"}
# stage radius in yard units (yard3d/scene.ts): extra pebbles shrink by 4 / r so they stay one size
STAGES = [{"r": 4.0, "extra": 0}, {"r": 6.5, "extra": 5}, {"r": 9.0, "extra": 10}]


def hex_rgba(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return (*[x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c], 1.0)


def rgba_hex(c):
    s = [x * 12.92 if x <= 0.0031308 else 1.055 * x ** (1 / 2.4) - 0.055 for x in c[:3]]
    return "#" + "".join(f"{round(max(0, min(1, x)) * 255):02X}" for x in s)


def material(kind):
    m = bpy.data.materials.get(f"cm_{kind}") or bpy.data.materials.new(f"cm_{kind}")
    m.diffuse_color = hex_rgba(COLOURS[kind])
    m.use_nodes = True
    m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = hex_rgba(COLOURS[kind])
    return m


def build(src, out):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=src)
    o = [x for x in bpy.data.objects if x.type == "MESH"][0]
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.mesh.separate(type="LOOSE")
    parts = sorted([x for x in bpy.data.objects if x.type == "MESH"], key=lambda p: -len(p.data.polygons))
    coll = bpy.data.collections.new("colony_mound")
    bpy.context.scene.collection.children.link(coll)
    soil = parts[0]
    vs = [v.co for v in soil.data.vertices]
    z0, z1 = min(v.z for v in vs), max(v.z for v in vs)
    # the entrance: the lowest point inside the top third, near the middle
    near = [v for v in vs if math.hypot(v.x, v.y) < 0.15 and v.z > z0 + (z1 - z0) * 0.5]
    ent = min(near, key=lambda v: v.z) if near else Vector((0, 0, z1))
    counts = {}
    for p in parts:
        for c in list(p.users_collection):
            c.objects.unlink(p)
        coll.objects.link(p)
        p.data.materials.clear()
        if p is not soil:
            p.name = p.data.name = "pebble"
            p.data.materials.append(material("pebble"))
            continue
        p.name = p.data.name = "soil"
        for k in ("foot", "soil", "top", "hole"):
            p.data.materials.append(material(k))
        for f in p.data.polygons:
            c = f.center
            t = (c.z - z0) / (z1 - z0)
            r = math.hypot(c.x - ent.x, c.y - ent.y)
            if r < 0.07 and c.z < z1 - (z1 - z0) * 0.06:
                k = 3  # down the entrance
            elif t < 0.22:
                k = 0
            elif t > 0.7:
                k = 2
            else:
                k = 1
            f.material_index = k
            counts[k] = counts.get(k, 0) + 1
    for c in list(bpy.data.collections):
        if c is not coll and not c.objects:
            bpy.data.collections.remove(c)
    bpy.ops.wm.save_as_mainfile(filepath=out)
    return {"parts": [p.name for p in parts], "faces_by_material": counts, "entrance": [round(x, 3) for x in ent]}


def mesh_parts(objs, xf):
    """One part per object and material; xf maps a world point to game space (y-up)."""
    res = []
    for o in objs:
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
                p += [round(x, 4) for x in xf(o.matrix_world @ v.co)]
            res.append({"name": f"{o.name.split('.')[0]}_{m.name.removeprefix('cm_')}", "color": rgba_hex(m.diffuse_color), "wing": False,
                        "p": p, "i": [v.index for f in bm.faces for v in f.verts]})
            bm.free()
    return res


def merge_same(parts):
    """Parts with the same name and colour become one (fewer draw groups, same look)."""
    out = {}
    for p in parts:
        q = out.get(p["name"])
        if not q:
            out[p["name"]] = {**p, "p": list(p["p"]), "i": list(p["i"])}
            continue
        base = len(q["p"]) // 3
        q["p"] += p["p"]
        q["i"] += [i + base for i in p["i"]]
    return list(out.values())


def export(out, preview=None):
    coll = bpy.data.collections["colony_mound"]
    soil = bpy.data.objects["soil"]
    pebbles = [o for o in coll.all_objects if o.type == "MESH" and o is not soil and o.visible_get()]
    vs = [soil.matrix_world @ v.co for v in soil.data.vertices]
    lo = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
    hi = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    # centred on the entrance (the middle of the hole faces), so ants come out of the middle of the mound
    holes = [soil.matrix_world @ f.center for f in soil.data.polygons if soil.data.materials[f.material_index].name == "cm_hole"]
    if holes:
        cx, cy = sum(h.x for h in holes) / len(holes), sum(h.y for h in holes) / len(holes)
    else:
        cx, cy = (lo.x + hi.x) / 2, (lo.y + hi.y) / 2
    kr = 1 / max(math.hypot(v.x - cx, v.y - cy) for v in vs)
    kh = 1 / (hi.z - lo.z)
    xf = lambda w: (( w.x - cx) * kr, (w.z - lo.z) * kh, -(w.y - cy) * kr)
    base = mesh_parts([soil] + pebbles, xf)
    stages = []
    rnd = random.Random(11)
    for s in STAGES:
        parts = [dict(p) for p in base]
        for n in range(s["extra"]):
            src = pebbles[n % len(pebbles)]
            a = rnd.random() * math.tau
            d = 1.0 + rnd.random() * 0.22
            ctr = sum((src.matrix_world @ v.co for v in src.data.vertices), Vector()) / len(src.data.vertices)
            k = (4 / s["r"]) * (0.7 + rnd.random() * 0.6)
            spin = Matrix.Rotation(rnd.random() * math.tau, 3, "Z")
            pos = Vector((cx + math.cos(a) * d / kr, cy + math.sin(a) * d / kr, lo.z))
            def pf(w, ctr=ctr, k=k, spin=spin, pos=pos):
                q = spin @ (w - ctr) * k
                return xf(Vector((pos.x + q.x, pos.y + q.y, lo.z + (w.z - ctr.z) * k + (ctr.z - lo.z) * k * 0.6)))
            parts += mesh_parts([src], pf)
        parts = merge_same(parts)
        stages.append({"parts": parts, "triangles": sum(len(p["i"]) // 3 for p in parts)})
    with open(out, "w") as f:
        json.dump({"source": "Meshy image-to-3d (art/meshy/colony-mound/notes.md)", "stages": stages}, f, separators=(",", ":"))
    if preview:
        render(preview)
    return {"triangles": [s["triangles"] for s in stages], "parts": [len(s["parts"]) for s in stages],
            "height_over_radius": round((hi.z - lo.z) / (max(hi.x - lo.x, hi.y - lo.y) / 2), 3)}


def render(path):
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.display.shading.light = "STUDIO"
    sc.display.shading.color_type = "MATERIAL"
    sc.display.shading.show_object_outline = True
    sc.display.shading.object_outline_color = (0.11, 0.06, 0.03)
    sc.render.resolution_x = sc.render.resolution_y = 900
    cam = bpy.data.objects.get("preview_cam") or bpy.data.objects.new("preview_cam", bpy.data.cameras.new("preview_cam"))
    if cam.name not in sc.collection.objects:
        sc.collection.objects.link(cam)
    cam.location = (1.1, -1.4, 0.9)
    cam.rotation_euler = (Vector((0, 0, -0.05)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam.data.lens = 50
    sc.camera = cam
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


if mode == "build":
    print("RESULT", json.dumps(build(args[1], args[2])))
elif mode == "export":
    print("RESULT", json.dumps(export(args[1], args[2] if len(args) > 2 else None)))
