"""The termite mound: Meshy mesh -> coloured parts in Blender -> game data (same format as the grasshopper).

  build   blender -b --factory-startup --python termite-mound.blend.py -- build meshy/termite_mound.glb termite-mound.blend
  fill    blender -b termite-mound.blend --python termite-mound.blend.py -- fill   (close the slit, save)
  export  blender -b termite-mound.blend --python termite-mound.blend.py -- export ../../../client/src/components/three/termite-mound.json [preview.png]

In the .blend the mound is two objects in the "termite_mound" collection: the spires and the base. Faces can use
either of an object's materials; the export writes one part per object and material, coloured by that material.
The faces under the arches start on the dark "hole" material so the entrances read. The export is scaled to
1 unit tall, standing on y = 0 (three.js axes).
"""
import bpy, bmesh, json, sys
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:]
mode = args[0]

COLOURS = {"spires": "#B58C5E", "base": "#9A7248", "hole": "#3A2618"}


def hex_rgba(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return (*[x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c], 1.0)


def rgba_hex(c):
    s = [x * 12.92 if x <= 0.0031308 else 1.055 * x ** (1 / 2.4) - 0.055 for x in c[:3]]
    return "#" + "".join(f"{round(max(0, min(1, x)) * 255):02X}" for x in s)


def material(kind):
    m = bpy.data.materials.get(f"tm_{kind}") or bpy.data.materials.new(f"tm_{kind}")
    m.diffuse_color = hex_rgba(COLOURS[kind])
    m.use_nodes = True
    m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = hex_rgba(COLOURS[kind])
    return m


def fill_slits(o):
    """Close small open loops in the sides (Meshy left a see-through slit in the main spire); the open bottom stays."""
    bm = bmesh.new()
    bm.from_mesh(o.data)
    seen, filled = set(), 0
    for e in [e for e in bm.edges if e.is_boundary]:
        if e in seen:
            continue
        loop, st = [], [e]
        while st:
            x = st.pop()
            if x in seen:
                continue
            seen.add(x)
            loop.append(x)
            st += [y for v in x.verts for y in v.link_edges if y.is_boundary and y not in seen]
        if len(loop) <= 16:
            res = bmesh.ops.holes_fill(bm, edges=loop, sides=len(loop))
            for f in res["faces"]:
                f.material_index = 0
            filled += len(res["faces"])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(o.data)
    bm.free()
    return filled


def build(src, out):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=src)
    o = [x for x in bpy.data.objects if x.type == "MESH"][0]
    coll = bpy.data.collections.new("termite_mound")
    bpy.context.scene.collection.children.link(coll)
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.mesh.separate(type="LOOSE")
    parts = sorted([x for x in bpy.data.objects if x.type == "MESH"], key=lambda p: -len(p.data.polygons))
    holes = 0
    for n, p in enumerate(parts):
        kind = "spires" if n == 0 else "base"
        p.name = p.data.name = kind
        p.data.materials.clear()
        p.data.materials.append(material(kind))
        p.data.materials.append(material("hole"))
        if kind == "spires":
            holes_filled = fill_slits(p)
            # the undersides of the arches face down: paint them as the dark entrances
            for f in p.data.polygons:
                if f.normal.z < -0.35:
                    f.material_index = 1
                    holes += 1
        for c in list(p.users_collection):
            c.objects.unlink(p)
        coll.objects.link(p)
    for c in list(bpy.data.collections):
        if c is not coll and not c.objects:
            bpy.data.collections.remove(c)
    bpy.ops.wm.save_as_mainfile(filepath=out)
    return {"parts": [p.name for p in parts], "hole_faces": holes, "slit_faces": holes_filled}


def export(out, preview=None):
    objs = [o for o in bpy.data.collections["termite_mound"].all_objects if o.type == "MESH" and o.visible_get()]
    pts = [o.matrix_world @ v.co for o in objs for v in o.data.vertices]
    lo = Vector((min(v.x for v in pts), min(v.y for v in pts), min(v.z for v in pts)))
    hi = Vector((max(v.x for v in pts), max(v.y for v in pts), max(v.z for v in pts)))
    k = 1 / (hi.z - lo.z)
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
        json.dump({"source": "Meshy image-to-3d (art/meshy/termite-mound/notes.md)", "triangles": tris, "parts": res}, f, separators=(",", ":"))
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
    sc.render.resolution_x = sc.render.resolution_y = 900
    cam = bpy.data.objects.get("preview_cam") or bpy.data.objects.new("preview_cam", bpy.data.cameras.new("preview_cam"))
    if cam.name not in sc.collection.objects:
        sc.collection.objects.link(cam)
    cam.location = (1.3, -1.6, 0.9)
    cam.rotation_euler = (Vector((0, 0, 0)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam.data.lens = 50
    sc.camera = cam
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


if mode == "fill":
    # close the slit in an existing .blend without rebuilding it: blender -b termite-mound.blend --python ... -- fill
    print("RESULT", json.dumps({"slit_faces": fill_slits(bpy.data.objects["spires"])}))
    bpy.ops.wm.save_mainfile()
elif mode == "build":
    print("RESULT", json.dumps(build(args[1], args[2])))
elif mode == "export":
    print("RESULT", json.dumps(export(args[1], args[2] if len(args) > 2 else None)))
