"""The spider den: Meshy mesh -> coloured parts in Blender -> game data (same format as the termite mound).

  build   blender -b --factory-startup --python spider-den.blend.py -- build meshy/spider_den.glb spider-den.blend
  export  blender -b spider-den.blend --python spider-den.blend.py -- export ../../../client/src/components/three/spider-den.json [preview.png]

In the .blend the den is a handful of objects in the "spider_den" collection: the ground (soil slab, burrow collar
and the spider's head sunk in the hole), the open lid, its twig, two shut trapdoors with their soil collars, four
legs, two fangs and eight eyes. Faces can use any of an object's materials; the export writes one part per object
and material, coloured by that material. The build paints a first pass: the burrow dark, its rim silk, the head
chitin, the lid's edge and the trapdoor tops moss, a pale band at each leg's knee and ankle. Repaint faces in Edit
Mode and re-run the export. The export is scaled to 1 unit across its widest side, standing on y = 0 (three.js axes).
"""
import bpy, bmesh, json, sys
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:]
mode = args[0]

COLOURS = {
    "soil": "#B0814F", "collar": "#9A7248", "hole": "#1E130C", "silk": "#F2EEE6",
    "lid": "#7A5C40", "moss": "#7A7A2E", "twig": "#6E5236",
    "chitin": "#2B201C", "band": "#9A8270", "fang": "#120A07", "eye": "#C43A3A",
}


def hex_rgba(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return (*[x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c], 1.0)


def rgba_hex(c):
    s = [x * 12.92 if x <= 0.0031308 else 1.055 * x ** (1 / 2.4) - 0.055 for x in c[:3]]
    return "#" + "".join(f"{round(max(0, min(1, x)) * 255):02X}" for x in s)


def material(kind):
    m = bpy.data.materials.get(f"sd_{kind}") or bpy.data.materials.new(f"sd_{kind}")
    m.diffuse_color = hex_rgba(COLOURS[kind])
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = hex_rgba(COLOURS[kind])
    return m


def setmats(o, kinds):
    o.data.materials.clear()
    for k in kinds:
        o.data.materials.append(material(k))


def centre(o, faces=None):
    fs = faces if faces is not None else o.data.polygons
    return sum((o.matrix_world @ f.center for f in fs), Vector()) / max(1, len(fs))


def build(src, out):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=src)
    o = [x for x in bpy.data.objects if x.type == "MESH"][0]
    coll = bpy.data.collections.new("spider_den")
    bpy.context.scene.collection.children.link(coll)
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.mesh.separate(type="LOOSE")
    parts = sorted([x for x in bpy.data.objects if x.type == "MESH"], key=lambda p: -len(p.data.polygons))
    for p in parts:
        bpy.context.view_layer.objects.active = p
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    ground, lid = parts[0], parts[1]
    small = [p for p in parts[2:] if len(p.data.polygons) < 40]
    mid = [p for p in parts[2:] if len(p.data.polygons) >= 40]
    eyes = [p for p in small]
    sz = lambda p: Vector(p.dimensions)
    # fangs: two small curved bits near the eyes, taller than an eye; legs: the long ones that reach the ground;
    # twig: thin and tall next to the lid; trapdoor caps sit higher than their soil collars
    legs = [p for p in mid if sz(p).z > 0.15 and len(p.data.polygons) > 100]
    twig = max([p for p in mid if p not in legs], key=lambda p: sz(p).z / max(sz(p).x, sz(p).y))
    rest = [p for p in mid if p not in legs and p is not twig]
    fangs = [p for p in rest if sz(p).z > 0.03 and max(sz(p).x, sz(p).y) < 0.09]
    doors = [p for p in rest if p not in fangs]
    caps = sorted(doors, key=lambda p: -len(p.data.polygons))[:2]
    collars = [p for p in doors if p not in caps]

    eye_c = sum((centre(e) for e in eyes), Vector()) / len(eyes)
    # the burrow: centre from the collar's top ring (the head, which pokes higher, left out); its inner lip is about
    # 0.13 from the centre and its outer edge about 0.23 (Meshy units, measured)
    rim = [v.co for v in ground.data.vertices if v.co.z > -0.07 and (v.co - eye_c).length > 0.1]
    hc = sum(rim, Vector()) / len(rim)
    hc.z = 0
    R = min(sorted((v - hc).xy.length for v in rim)[len(rim) // 10:])

    setmats(ground, ["soil", "hole", "silk", "chitin", "collar"])
    for f in ground.data.polygons:
        c = f.center
        r = (c - hc).xy.length
        inward = f.normal.xy.dot((hc - c).xy) > 0
        if (c - eye_c).length < 0.08 and r < R * 1.2:
            f.material_index = 3
        elif r < R * 0.97 or (r < R * 1.3 and inward and f.normal.z < 0.6):
            f.material_index = 1
        elif r < R * 1.9 and c.z > -0.08 and f.normal.z > 0.45:
            f.material_index = 2
        elif r < R * 2.0 and c.z > -0.165:
            f.material_index = 4
    setmats(lid, ["lid", "moss"])
    lc = centre(lid)
    far = max((f.center - lc).length for f in lid.data.polygons)
    for f in lid.data.polygons:
        if (f.center - lc).length > far * 0.82:
            f.material_index = 1
    setmats(twig, ["twig"])
    for p in caps:
        setmats(p, ["lid", "moss"])
        for f in p.data.polygons:
            if f.normal.z > 0.55:
                f.material_index = 1
    for p in collars:
        setmats(p, ["collar"])
    for p in fangs:
        setmats(p, ["fang"])
    for p in eyes:
        setmats(p, ["eye"])
    for p in legs:
        setmats(p, ["chitin", "band"])
        vs = [v.co for v in p.data.vertices]
        knee = max(vs, key=lambda v: v.z)
        foot = min(vs, key=lambda v: v.z)
        ankle = knee.lerp(foot, 0.55)
        for f in p.data.polygons:
            if (f.center - knee).length < 0.04 or (f.center - ankle).length < 0.03:
                f.material_index = 1

    names = {ground: "ground", lid: "lid", twig: "twig"}
    for n, p in enumerate(caps): names[p] = f"trapdoor{n + 1}"
    for n, p in enumerate(collars): names[p] = f"trapdoor{n + 1}_collar"
    for n, p in enumerate(legs): names[p] = f"leg{n + 1}"
    for n, p in enumerate(fangs): names[p] = f"fang{n + 1}"
    for n, p in enumerate(eyes): names[p] = f"eye{n + 1}"
    for p in parts:
        p.name = p.data.name = names.get(p, "extra")
        for c in list(p.users_collection):
            c.objects.unlink(p)
        coll.objects.link(p)
    for c in list(bpy.data.collections):
        if c is not coll and not c.objects:
            bpy.data.collections.remove(c)
    bpy.ops.wm.save_as_mainfile(filepath=out)
    return {"parts": {names.get(p, "extra"): len(p.data.polygons) for p in parts},
            "hole_centre": [round(x, 3) for x in hc], "hole_radius": round(R, 3)}


def export(out, preview=None):
    objs = [o for o in bpy.data.collections["spider_den"].all_objects if o.type == "MESH" and o.visible_get()]
    pts = [o.matrix_world @ v.co for o in objs for v in o.data.vertices]
    lo = Vector((min(v.x for v in pts), min(v.y for v in pts), min(v.z for v in pts)))
    hi = Vector((max(v.x for v in pts), max(v.y for v in pts), max(v.z for v in pts)))
    k = 1 / max(hi.x - lo.x, hi.y - lo.y)
    cx, cy = (lo.x + hi.x) / 2, (lo.y + hi.y) / 2
    # merge every object's faces of the same material into one part: fewer parts, same look
    groups = {}
    for o in objs:
        for mi, m in enumerate(o.data.materials):
            bm = bmesh.new()
            bm.from_mesh(o.data)
            bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index != mi], context="FACES")
            bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
            if bm.faces:
                bmesh.ops.triangulate(bm, faces=bm.faces)
                bm.verts.index_update()
                g = groups.setdefault(m.name, {"color": rgba_hex(m.diffuse_color), "p": [], "i": []})
                base = len(g["p"]) // 3
                for v in bm.verts:
                    w = o.matrix_world @ v.co
                    g["p"] += [round((w.x - cx) * k, 4), round((w.z - lo.z) * k, 4), round(-(w.y - cy) * k, 4)]
                g["i"] += [base + v.index for f in bm.faces for v in f.verts]
            bm.free()
    res = [{"name": n.removeprefix("sd_"), "color": g["color"], "wing": False, "p": g["p"], "i": g["i"]} for n, g in sorted(groups.items())]
    tris = sum(len(r["i"]) // 3 for r in res)
    with open(out, "w") as f:
        json.dump({"source": "Meshy image-to-3d (art/meshy/spider-den/notes.md)", "triangles": tris, "parts": res}, f, separators=(",", ":"))
    if preview:
        render(preview)
    return {"parts": len(res), "triangles": tris, "size": [1 if hi.x - lo.x >= hi.y - lo.y else round((hi.x - lo.x) * k, 3), round((hi.z - lo.z) * k, 3), round((hi.y - lo.y) * k, 3)]}


def render(path, loc=(1.1, -1.4, 1.0)):
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
    cam.location = loc
    cam.rotation_euler = (Vector((0, 0, -0.08)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam.data.lens = 50
    sc.camera = cam
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


if mode == "build":
    print("RESULT", json.dumps(build(args[1], args[2])))
elif mode == "render":
    for name, loc in [("front", (0, -1.9, 1.0)), ("34", (1.1, -1.4, 1.0)), ("close", (0.35, -0.75, 0.35)), ("top", (0.01, -0.3, 2.0))]:
        render(f"{args[1]}_{name}.png", loc)
elif mode == "export":
    print("RESULT", json.dumps(export(args[1], args[2] if len(args) > 2 else None)))
