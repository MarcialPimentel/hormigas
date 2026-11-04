"""The dead grasshopper windfall: Meshy mesh -> coloured, named parts in Blender -> game data.

  build   Split the Meshy model into its parts, name and colour them, save grasshopper.blend
          blender -b --factory-startup --python grasshopper.blend.py -- build meshy/grasshopper.glb grasshopper.blend
  export  Read the parts back from the .blend (after any touch-ups) and write the game's data file
          blender -b grasshopper.blend --python grasshopper.blend.py -- export ../../../client/src/components/three/grasshopper.json [preview.png]

In the .blend every part is its own object in the "grasshopper" collection. Its material's colour is the
colour in the game; a part whose name starts with "wing" is drawn two-sided and without the ink line.
The export is scaled to 1 unit nose to tail, sitting on the ground (y = 0), head towards +z (three.js axes).
"""
import bpy, bmesh, json, sys
from mathutils import Vector

args = sys.argv[sys.argv.index("--") + 1:]
mode = args[0]

# colours in the ants' cartoon palette (flat, read at a glance; the toon bands do the shading)
COLOURS = {
    "head": "#8DB83A", "thorax": "#8DB83A",
    "belly": "#A9C94A", "band": "#93B540",
    "hind_femur": "#9DC449",
    "leg": "#6E8A2E", "antenna": "#6E8A2E",
    "wing": "#CFDDA0",
    "eye": "#2B1D12",
}


def hex_rgba(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    lin = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return (*lin, 1.0)


def rgba_hex(c):
    s = [x * 12.92 if x <= 0.0031308 else 1.055 * x ** (1 / 2.4) - 0.055 for x in c[:3]]
    return "#" + "".join(f"{round(max(0, min(1, x)) * 255):02X}" for x in s)


def material(kind):
    name = f"gh_{kind}"
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.diffuse_color = hex_rgba(COLOURS[kind])
    m.use_nodes = True
    m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = hex_rgba(COLOURS[kind])
    return m


def classify(lo, hi, tris):
    """Name a loose part from where it sits (Blender axes: head towards -Y, legs up +Z)."""
    cy = (lo.y + hi.y) / 2
    if hi.z - lo.z < 0.03:
        return "wing"
    if tris <= 24 and lo.y < -0.35:
        return "eye"
    if lo.y < -0.4 and hi.z < -0.05:
        return "antenna"
    if hi.z > 0.12 and abs((lo.x + hi.x) / 2) > 0.05:
        return "hind_femur" if tris >= 90 else "leg"
    if lo.y < -0.38:
        return "head"
    if cy < -0.1:
        return "thorax"
    return "belly" if hi.y > 0.4 else "band"


def build(src, out):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=src)
    o = [x for x in bpy.data.objects if x.type == "MESH"][0]
    coll = bpy.data.collections.new("grasshopper")
    bpy.context.scene.collection.children.link(coll)
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.mesh.separate(type="LOOSE")
    counts = {}
    for p in [x for x in bpy.data.objects if x.type == "MESH"]:
        pts = [p.matrix_world @ v.co for v in p.data.vertices]
        lo = Vector((min(v.x for v in pts), min(v.y for v in pts), min(v.z for v in pts)))
        hi = Vector((max(v.x for v in pts), max(v.y for v in pts), max(v.z for v in pts)))
        tris = sum(len(f.vertices) - 2 for f in p.data.polygons)
        kind = classify(lo, hi, tris)
        counts[kind] = counts.get(kind, 0) + 1
        p.name = p.data.name = f"{kind}_{counts[kind]}"
        p.data.materials.clear()
        p.data.materials.append(material(kind))
        for c in list(p.users_collection):
            c.objects.unlink(p)
        coll.objects.link(p)
    for c in list(bpy.data.collections):
        if c is not coll and not c.objects:
            bpy.data.collections.remove(c)
    bpy.ops.wm.save_as_mainfile(filepath=out)
    return counts


def export(out, preview=None):
    parts = [o for o in bpy.data.collections["grasshopper"].all_objects if o.type == "MESH" and o.visible_get()]
    allpts = [o.matrix_world @ v.co for o in parts for v in o.data.vertices]
    lo = Vector((min(v.x for v in allpts), min(v.y for v in allpts), min(v.z for v in allpts)))
    hi = Vector((max(v.x for v in allpts), max(v.y for v in allpts), max(v.z for v in allpts)))
    k = 1 / (hi.y - lo.y)
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
            # Blender (x, y, z) z-up, head -y  ->  three.js (x, z, -y) y-up, head +z
            p += [round((w.x - cx) * k, 4), round((w.z - lo.z) * k, 4), round(-(w.y - cy) * k, 4)]
        idx = [v.index for f in bm.faces for v in f.verts]
        tris += len(bm.faces)
        m = o.active_material
        res.append({"name": o.name, "color": rgba_hex(m.diffuse_color) if m else "#8DB83A",
                    "wing": o.name.startswith("wing"), "p": p, "i": idx})
        bm.free()
    with open(out, "w") as f:
        json.dump({"source": "Meshy image-to-3d (art/meshy/grasshopper/notes.md)", "triangles": tris, "parts": res}, f, separators=(",", ":"))
    if preview:
        render(preview, parts)
    return {"parts": len(res), "triangles": tris, "size": [round((hi.x - lo.x) * k, 3), round((hi.z - lo.z) * k, 3), 1]}


def render(path, parts):
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.display.shading.light = "STUDIO"
    sc.display.shading.color_type = "MATERIAL"
    sc.display.shading.show_object_outline = True
    sc.display.shading.object_outline_color = (0.11, 0.06, 0.03)
    sc.render.resolution_x = sc.render.resolution_y = 900
    sc.render.film_transparent = False
    sc.world = sc.world or bpy.data.worlds.new("w")
    sc.display.shading.background_type = "VIEWPORT"
    sc.display.shading.background_color = (0.97, 0.95, 0.9)
    cam = bpy.data.objects.get("preview_cam") or bpy.data.objects.new("preview_cam", bpy.data.cameras.new("preview_cam"))
    if cam.name not in sc.collection.objects:
        sc.collection.objects.link(cam)
    cam.location = (1.15, -1.25, 0.95)
    d = Vector((0, 0, 0)) - cam.location
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    cam.data.lens = 55
    sc.camera = cam
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


if mode == "build":
    print("RESULT", json.dumps(build(args[1], args[2])))
elif mode == "export":
    print("RESULT", json.dumps(export(args[1], args[2] if len(args) > 2 else None)))
