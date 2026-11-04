# Preview renders of hero-ant.blend: the close-up and crowd ants from the concept's 3/4 view and side on.
#   blender -b art/meshy/hero-ant/hero-ant.blend -P art/meshy/hero-ant/render_ant.py -- <out_dir>
import bpy, math, os, sys
from mathutils import Vector

out = sys.argv[sys.argv.index('--') + 1]
os.makedirs(out, exist_ok=True)
sc = bpy.context.scene
sc.render.engine = 'BLENDER_WORKBENCH'
sh = sc.display.shading
sh.light = 'STUDIO'; sh.color_type = 'MATERIAL'; sh.show_cavity = True; sh.show_object_outline = True
sh.show_specular_highlight = True
sc.render.film_transparent = False
sc.world = sc.world or bpy.data.worlds.new('w')
sh.background_type = 'VIEWPORT'; sh.background_color = (1, 1, 1)
sc.render.resolution_x = sc.render.resolution_y = 900
for ob in sc.objects:
    if ob.type == 'MESH' and ob.data.attributes.get('tone'):
        # show the tone (eyes, bands) through a per-part material colour preview
        pass
# eyes darker so they read in the preview
eye = bpy.data.materials.new('eye_preview'); eye.diffuse_color = (0.03, 0.01, 0.01, 1)
for ob in sc.objects:
    if ob.name.startswith('eye_'):
        ob.data.materials[0] = eye
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = 'ORTHO'
def shot(name, target, d, size):
    crowd = 'crowd' in name
    for ob in sc.objects:
        if ob.type == 'MESH': ob.hide_render = (ob.name.endswith('_crowd')) != crowd or ob.name.split('_crowd')[0] in ('petiole_a', 'petiole_b', 'sickle_L', 'sickle_R')
    d = Vector(d).normalized(); cam.location = target + d * 4
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler(); cam.data.ortho_scale = size
    sc.render.filepath = os.path.join(out, name); bpy.ops.render.render(write_still=True)
c0 = Vector((0.0, 0, 0.15))
shot('ant_34.png', c0, (0.75, -0.65, 0.45), 1.05)
shot('ant_side.png', c0, (0, -1, 0.05), 1.0)
shot('ant_top.png', c0, (0, 0, 1), 1.0)
shot('ant_crowd_34.png', c0 + Vector((0, 0.7, 0)), (0.75, -0.65, 0.45), 1.05)
