import bpy, math
from mathutils import Vector
from math import sin, cos, pi, exp

# ANIME VOID STUDIO - Blender base character generator
# Blender 4.x. Creates a stylized adult anime character, a clean body mesh,
# independent clothing, facial details, materials, camera, lights, and shape keys.
# Run: Blender > Scripting > Open > Run Script. Outputs .blend and .glb beside this script.

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials):
    for block in list(datablocks):
        if block.users == 0: datablocks.remove(block)

def mat(name, color, rough=0.65, metallic=0.0, subsurface=0.0):
    m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1)
    p.inputs['Roughness'].default_value=rough; p.inputs['Metallic'].default_value=metallic
    if 'Subsurface Weight' in p.inputs: p.inputs['Subsurface Weight'].default_value=subsurface
    return m

skin=mat('Skin | warm porcelain',(0.92,0.62,0.52),.48,0,.08)
hair=mat('Hair | deep plum',(0.105,0.055,0.16),.28)
cloth=mat('Cloth | midnight violet',(0.16,0.105,0.27),.72)
trim=mat('Cloth trim | lavender',(0.62,0.48,0.82),.5)
white=mat('Eye whites',(0.96,0.94,0.9),.28)
iris=mat('Iris | amethyst',(0.25,0.12,0.48),.22)
black=mat('Pupils and lashes',(0.025,0.018,0.035),.25)
pink=mat('Lips',(0.55,0.16,0.22),.4)
shoe=mat('Shoes',(0.055,0.045,0.08),.42)

def mesh_obj(name, verts, faces, material, smooth=True):
    me=bpy.data.meshes.new(name+'Mesh'); me.from_pydata(verts,[],faces); me.materials.append(material); me.update()
    ob=bpy.data.objects.new(name,me); bpy.context.collection.objects.link(ob)
    if smooth:
        for p in me.polygons:p.use_smooth=True
    return ob

def uv_sphere(name, loc, scale, material, seg=32, rings=20):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, location=loc)
    o=bpy.context.object;o.name=name;o.scale=scale;o.data.materials.append(material)
    for p in o.data.polygons:p.use_smooth=True
    return o

def loft(name, rings, material, n=32):
    # rings: (z, rx, ry, center_y); front is negative Y
    verts=[]; faces=[]
    for z,rx,ry,cy in rings:
        for j in range(n):
            a=2*pi*j/n
            verts.append((rx*cos(a),cy+ry*sin(a),z))
    for i in range(len(rings)-1):
        for j in range(n):
            a=i*n+j;b=i*n+(j+1)%n
            faces.append((a,b,b+n,a+n))
    faces += [tuple(range(n-1,-1,-1)),tuple((len(rings)-1)*n+j for j in range(n))]
    return mesh_obj(name,verts,faces,material)

# Main continuous body shell: profile-driven torso with integrated hip and chest silhouette.
profile=[
(1.00,.20,.145,0),(1.06,.29,.18,0),(1.16,.34,.205,0),(1.25,.31,.19,0),
(1.34,.245,.16,0),(1.43,.225,.15,0),(1.50,.25,.17,0),(1.58,.30,.195,0),
(1.68,.325,.19,0),(1.77,.29,.17,0),(1.84,.16,.125,0),(1.88,.085,.08,0)]
N=96; verts=[]; faces=[]; rows=72
def prof(z):
    k=0
    while k<len(profile)-2 and profile[k+1][0]<z:k+=1
    a,b=profile[k],profile[k+1];t=max(0,min(1,(z-a[0])/(b[0]-a[0])));t=t*t*(3-2*t)
    return tuple(a[q]*(1-t)+b[q]*t for q in (1,2,3))
for i in range(rows+1):
    z=1.0+(1.88-1.0)*i/rows;rx,ry,cy=prof(z)
    for j in range(N):
        a=2*pi*j/N;x=rx*cos(a); y=cy+ry*sin(a)
        # Subtle front-facing chest volume blended into the torso surface.
        front=max(0,-sin(a)); chest=exp(-((z-1.60)/.105)**2)*exp(-((abs(x)-.145)/.105)**2)*.052
        y-=front*chest
        verts.append((x,y,z))
for i in range(rows):
    for j in range(N):
        a=i*N+j;b=i*N+(j+1)%N;faces.append((a,b,b+N,a+N))
body=mesh_obj('BODY | continuous torso',verts,faces,skin)
# Add shape keys that affect the actual torso surface, never the skirt.
body.shape_key_add(name='Basis')
for key in ('Bust volume','Waist width','Hip width','Ribcage width'):
    body.shape_key_add(name=key)
basis=body.data.shape_keys.key_blocks['Basis']
for idx,v in enumerate(body.data.vertices):
    x,y,z=v.co; front=max(0,min(1,-y/.12))
    wch=exp(-((z-1.60)/.12)**2)*exp(-((abs(x)-.145)/.12)**2)*front
    wh=exp(-((z-1.14)/.12)**2)
    ww=exp(-((z-1.38)/.11)**2)
    wr=exp(-((z-1.68)/.16)**2)
    body.data.shape_keys.key_blocks['Bust volume'].data[idx].co.y -= .075*wch
    body.data.shape_keys.key_blocks['Waist width'].data[idx].co.x += (1 if x>=0 else -1)*.055*ww
    body.data.shape_keys.key_blocks['Hip width'].data[idx].co.x += (1 if x>=0 else -1)*.075*wh
    body.data.shape_keys.key_blocks['Ribcage width'].data[idx].co.x += (1 if x>=0 else -1)*.05*wr

# Neck, head, and jaw are smooth volumes.
uv_sphere('Neck',(0,0,1.91),(.085,.085,.19),skin)
head=uv_sphere('Head',(0,-.005,2.20),(.255,.225,.325),skin,48,32)
uv_sphere('Jaw',(0,-.045,2.04),(.19,.19,.17),skin,40,24)
# Ears
for s in (-1,1): uv_sphere('Ear',(s*.252,-.005,2.18),(.045,.055,.085),skin)
# Eyes sit on front (-Y).
for s in (-1,1):
    x=s*.098
    uv_sphere('Eye white',(x,-.207,2.235),(.073,.025,.087),white)
    uv_sphere('Iris',(x,-.232,2.23),(.041,.014,.058),iris)
    uv_sphere('Pupil',(x,-.245,2.23),(.021,.009,.038),black)
    uv_sphere('Eye highlight',(x-.012,-.255,2.255),(.011,.006,.015),white,20,12)
    brow=uv_sphere('Eyebrow',(x,-.213,2.34),(.065,.014,.012),hair,24,12)
    brow.rotation.y=s*.12
uv_sphere('Nose',(0,-.231,2.155),(.022,.025,.032),skin,20,12)
uv_sphere('Mouth',(0,-.222,2.085),(.044,.012,.012),pink,24,12)

# Hair cap + back mass + separate curved locks.
uv_sphere('Hair cap',(0,.018,2.405),(.27,.235,.19),hair,48,24)
uv_sphere('Hair back',(0,.105,2.19),(.265,.17,.34),hair,40,28)
def curve_obj(name, points, bevel, material):
    cu=bpy.data.curves.new(name,'CURVE');cu.dimensions='3D';cu.resolution_u=16;cu.bevel_depth=bevel;cu.bevel_resolution=4
    sp=cu.splines.new('BEZIER');sp.bezier_points.add(len(points)-1)
    for p,co in zip(sp.bezier_points,points):p.co=co;p.handle_left_type='AUTO';p.handle_right_type='AUTO'
    ob=bpy.data.objects.new(name,cu);bpy.context.collection.objects.link(ob);ob.data.materials.append(material);return ob
for s in (-1,1):
    for k in range(4):
        x=s*(.19+k*.012)
        curve_obj('Long hair lock',[(s*.16,.0,2.48),(x,-.015,2.28),(s*(.23+k*.012),.035,1.94-k*.035)],.025-k*.003,hair)
for k in range(9):
    x=(k-4)*.052
    curve_obj('Fringe strand',[(x*.7,-.13,2.49),(x,-.205,2.39),(x*.95,-.225,2.28+abs(k-4)*.009)],.018,hair)

# Limbs use tapered lofts rather than stacked balls.
for s in (-1,1):
    # arms, slightly away from torso
    loft('Upper arm',[(1.76,.075,.075,s*.34),(1.66,.073,.07,s*.37),(1.53,.061,.06,s*.39),(1.43,.052,.052,s*.40)],skin,24)
    loft('Forearm',[(1.45,.052,.052,s*.40),(1.34,.048,.047,s*.415),(1.20,.038,.04,s*.43),(1.15,.032,.035,s*.435)],skin,24)
    uv_sphere('Palm',(s*.435,-.005,1.105),(.052,.035,.07),skin)
    for f in range(4):
        fx=s*.435+(f-1.5)*.022
        loft('Finger',[(1.10,.012,.012,fx),(1.045,.010,.010,fx+(f-1.5)*.004)],skin,12)
    # legs
    loft('Thigh',[(1.12,.15,.15,s*.17),(.98,.145,.14,s*.175),(.82,.115,.12,s*.18),(.72,.09,.095,s*.18)],skin,32)
    loft('Calf',[(.74,.09,.095,s*.18),(.62,.085,.09,s*.18),(.43,.062,.07,s*.185),(.16,.045,.055,s*.19)],skin,32)
    uv_sphere('Foot',(s*.19,-.075,.09),(.085,.16,.07),shoe)

# Separate clothing: fitted top shell and an independent symmetric skirt.
top=loft('TOP | fitted garment',[(1.43,.235,.16,0),(1.49,.26,.175,0),(1.59,.315,.205,0),(1.70,.335,.20,0),(1.79,.30,.18,0),(1.83,.18,.135,0)],cloth,64)
skirt=loft('SKIRT | independent garment',[(.98,.49,.30,0),(1.04,.47,.285,0),(1.13,.39,.245,0),(1.23,.315,.205,0)],cloth,96)
# Waist band and hem trim rings.
loft('Waist band',[(1.205,.318,.207,0),(1.235,.318,.207,0)],trim,96)
loft('Skirt hem trim',[(.975,.493,.303,0),(.995,.49,.30,0)],trim,96)

# Shoes and simple accessories.
for s in (-1,1):
    uv_sphere('Shoe',(s*.19,-.075,.075),(.09,.17,.065),shoe)
    uv_sphere('Hair ornament',(s*.205,-.095,2.35),(.025,.018,.035),trim,20,12)

# Camera, floor and studio lighting.
bpy.ops.mesh.primitive_plane_add(size=200, location=(0,0,-.005));floor=bpy.context.object;floor.name='Studio floor';floor.data.materials.append(mat('Floor',(0.045,.04,.065),.85))
def area(name,loc,power,size,color):
    bpy.ops.object.light_add(type='AREA', location=loc);o=bpy.context.object;o.name=name;o.data.energy=power;o.data.shape='DISK';o.data.size=size;o.data.color=color;o.rotation_euler=(Vector((0,0,1.25))-o.location).to_track_quat('-Z','Y').to_euler()
area('Key softbox',(3,-4,5),520,4,(1.0,.82,.78))
area('Fill softbox',(-4,-2,2.8),360,3,(.72,.78,1.0))
area('Rim light',(1,3,3.5),650,3,(.78,.68,1.0))
bpy.ops.object.camera_add(location=(3.4,-6.8,2.55));cam=bpy.context.object;cam.name='Character camera';cam.rotation_euler=(Vector((0,0,1.25))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.lens=55;bpy.context.scene.camera=cam

# Organize objects into collections.
for name in ('CHARACTER','CLOTHING','STUDIO'):
    if name not in bpy.data.collections:
        col=bpy.data.collections.new(name);bpy.context.scene.collection.children.link(col)
for ob in list(bpy.context.scene.objects):
    target='STUDIO' if ob.type in {'CAMERA','LIGHT'} or ob.name=='Studio floor' else ('CLOTHING' if any(k in ob.name for k in ('TOP','SKIRT','Waist band','hem trim','Shoe','Hair ornament')) else 'CHARACTER')
    for col in list(ob.users_collection): col.objects.unlink(ob)
    bpy.data.collections[target].objects.link(ob)

scene=bpy.context.scene
scene.render.engine='CYCLES';scene.cycles.samples=32
scene.render.resolution_x=900;scene.render.resolution_y=1200;scene.render.resolution_percentage=100
scene.world.color=(.12,.12,.12)
scene.render.image_settings.file_format='PNG'
# Save next to this script; override output folder through environment if desired.
import os
out=os.path.dirname(bpy.data.filepath) if bpy.data.filepath else os.getcwd()
blend_path=os.path.join(out,'anime_void_base_character.blend')
glb_path=os.path.join(out,'anime_void_base_character.glb')
bpy.ops.wm.save_as_mainfile(filepath=blend_path)
bpy.ops.export_scene.gltf(filepath=glb_path,export_format='GLB',export_apply=False,export_morph=True)
print('Created:',blend_path,glb_path)
