"""Picnic crumbs (windfall): Meshy mesh -> coloured parts in Blender -> game data (same format as the grasshopper).

  build   blender -b --factory-startup --python picnic-crumbs.blend.py -- build meshy/picnic_crumbs.glb picnic-crumbs.blend
  export  blender -b picnic-crumbs.blend --python picnic-crumbs.blend.py -- export ../../../client/src/components/three/picnic-crumbs.json [preview.png]
  render  blender -b picnic-crumbs.blend --python picnic-crumbs.blend.py -- render preview.png

The corner of a sandwich with a giant's bite out of it: two bread slices, lettuce, four tomato slices, one sheet of ham
with the cheese under it, and a few crumbs at the bitten edge. In the .blend each piece is its own object in the
"picnic_crumbs" collection. Faces can use any of an object's materials; the export writes one part per object and
material, coloured by that material. The bread's two straight outer edges are crust, the bitten side is soft bread.
The export is scaled so the sandwich is 1 unit across its longest side, standing on y = 0 (three.js axes).
"""
import bpy, bmesh, json, sys, math, random
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:]
mode = args[0]

COLOURS = {
    "bread": "#F3D9A2",   # the soft inside of the slices
    "crust": "#D08A3E",   # the two straight outer edges
    "lettuce": "#8DB83A",
    "tomato": "#D9483A",
    "ham": "#EC9C98",
    "cheese": "#F2C14E",
}


def hex_rgba(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return (*[x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c], 1.0)


def rgba_hex(c):
    s = [x * 12.92 if x <= 0.0031308 else 1.055 * x ** (1 / 2.4) - 0.055 for x in c[:3]]
    return "#" + "".join(f"{round(max(0, min(1, x)) * 255):02X}" for x in s)


def material(kind):
    m = bpy.data.materials.get(f"pc_{kind}") or bpy.data.materials.new(f"pc_{kind}")
    m.diffuse_color = hex_rgba(COLOURS[kind])
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = hex_rgba(COLOURS[kind])
    return m


def bounds(o):
    vs = [o.matrix_world @ v.co for v in o.data.vertices]
    return Vector([min(v[i] for v in vs) for i in range(3)]), Vector([max(v[i] for v in vs) for i in range(3)])


def paint_bread(o):
    """Side faces looking out past the two straight edges (-x and -y: the corner points front-left) are crust."""
    o.data.materials.clear()
    o.data.materials.append(material("bread"))
    o.data.materials.append(material("crust"))
    lo, hi = bounds(o)
    n = 0
    for f in o.data.polygons:
        c, nz = o.matrix_world @ f.center, f.normal.z
        if abs(nz) > 0.6:
            continue
        # near a straight edge and facing out of it
        if (f.normal.x < -0.5 and c.x < lo.x + 0.12) or (f.normal.y < -0.5 and c.y < lo.y + 0.12):
            f.material_index = 1
            n += 1
    return n


def paint_ham(o, split):
    """One Meshy sheet holds both: the ham on top, the cheese hanging under it."""
    o.data.materials.clear()
    o.data.materials.append(material("ham"))
    o.data.materials.append(material("cheese"))
    n = 0
    for f in o.data.polygons:
        c = o.matrix_world @ f.center
        if c.z < split or f.normal.z < -0.3:
            f.material_index = 1
            n += 1
    return n


def add_crumbs(coll, base_z, lo, hi):
    """A few chunky crumbs on the ground by the bitten side (back right)."""
    rnd = random.Random(7)
    # fractions of the sandwich's bounds; the bitten diagonal runs back-left to front-right, so these sit just past it
    spots = [(0.86, 0.82, 0.05), (0.97, 0.62, 0.035), (0.68, 0.97, 0.04), (1.02, 0.95, 0.028), (0.55, 1.08, 0.03)]
    w = hi - lo
    made = []
    for i, (fx, fy, r) in enumerate(spots):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=r * w.x,
                                              location=(lo.x + fx * w.x, lo.y + fy * w.y, base_z + r * w.x * 0.55))
        c = bpy.context.active_object
        c.name = c.data.name = f"crumb_{i + 1}"
        c.scale = (1 + rnd.random() * 0.3, 1 + rnd.random() * 0.2, 0.7)
        c.rotation_euler = (rnd.random(), rnd.random(), rnd.random() * 3)
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        c.data.materials.append(material("bread" if i % 2 else "crust"))
        for x in list(c.users_collection):
            x.objects.unlink(c)
        coll.objects.link(c)
        made.append(c.name)
    return made


def build(src, out):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=src)
    o = [x for x in bpy.data.objects if x.type == "MESH"][0]
    coll = bpy.data.collections.new("picnic_crumbs")
    bpy.context.scene.collection.children.link(coll)
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.mesh.separate(type="LOOSE")
    parts = [x for x in bpy.data.objects if x.type == "MESH"]
    for p in parts:
        bpy.context.view_layer.objects.active = p
        bpy.ops.object.select_all(action="DESELECT")
        p.select_set(True)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    info = {p: bounds(p) for p in parts}
    small = [p for p in parts if max((info[p][1] - info[p][0]).x, (info[p][1] - info[p][0]).y) < 0.4]
    big = sorted([p for p in parts if p not in small], key=lambda p: info[p][0].z)
    # bottom to top: bottom slice, ham + cheese, lettuce, top slice
    names = ["bread_bottom", "ham", "lettuce", "bread_top"]
    for p, nm in zip(big, names):
        p.name = p.data.name = nm
    for i, p in enumerate(sorted(small, key=lambda p: info[p][0].x)):
        p.name = p.data.name = f"tomato_{i + 1}"
        p.data.materials.clear()
        p.data.materials.append(material("tomato"))
    crust = paint_bread(bpy.data.objects["bread_top"]) + paint_bread(bpy.data.objects["bread_bottom"])
    lt = bpy.data.objects["lettuce"]
    lt.data.materials.clear()
    lt.data.materials.append(material("lettuce"))
    hlo, hhi = info[bpy.data.objects["ham"]]
    cheese = paint_ham(bpy.data.objects["ham"], hlo.z + (hhi.z - hlo.z) * 0.35)
    for p in parts:
        for c in list(p.users_collection):
            c.objects.unlink(p)
        coll.objects.link(p)
    lo = Vector([min(info[p][0][i] for p in parts) for i in range(3)])
    hi = Vector([max(info[p][1][i] for p in parts) for i in range(3)])
    crumbs = add_crumbs(coll, lo.z, lo, hi)
    for c in list(bpy.data.collections):
        if c is not coll and not c.objects:
            bpy.data.collections.remove(c)
    for ob in list(bpy.data.objects):
        if ob.type != "MESH":
            bpy.data.objects.remove(ob)
    bpy.ops.wm.save_as_mainfile(filepath=out)
    return {"parts": sorted(p.name for p in coll.objects), "crust_faces": crust, "cheese_faces": cheese, "crumbs": crumbs}


def export(out, preview=None):
    objs = [o for o in bpy.data.collections["picnic_crumbs"].all_objects if o.type == "MESH" and o.visible_get()]
    pts = [o.matrix_world @ v.co for o in objs for v in o.data.vertices]
    lo = Vector((min(v.x for v in pts), min(v.y for v in pts), min(v.z for v in pts)))
    hi = Vector((max(v.x for v in pts), max(v.y for v in pts), max(v.z for v in pts)))
    k = 1 / max(hi.x - lo.x, hi.y - lo.y)
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
        json.dump({"source": "Meshy image-to-3d (art/meshy/picnic-crumbs/notes.md)", "triangles": tris, "parts": res}, f, separators=(",", ":"))
    if preview:
        render(preview)
    return {"parts": len(res), "triangles": tris, "size": [round((hi.x - lo.x) * k, 3), round((hi.z - lo.z) * k, 3), round((hi.y - lo.y) * k, 3)]}


def render(path, views=(("", (1.5, -1.9, 1.3)),)):
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
        cam.rotation_euler = (Vector((0, 0, -0.05)) - cam.location).to_track_quat("-Z", "Y").to_euler()
        sc.render.filepath = path.replace(".png", f"{suffix}.png")
        bpy.ops.render.render(write_still=True)


if mode == "build":
    print("RESULT", json.dumps(build(args[1], args[2])))
elif mode == "export":
    print("RESULT", json.dumps(export(args[1], args[2] if len(args) > 2 else None)))
elif mode == "render":
    render(args[1], (("_34", (1.5, -1.9, 1.3)), ("_top", (0.01, -0.3, 2.6)), ("_back", (-1.6, 1.8, 1.0)), ("_low", (0.4, -2.4, 0.35))))
