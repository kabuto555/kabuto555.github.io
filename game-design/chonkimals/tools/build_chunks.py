"""
Chonkimals chunk-kit base authoring — flat / gentle-slope / switchback-L.

Contract (from Chonkimals-World-Build-Spec.md):
  - 24x24u footprint, 1u = 1m, Y-up.
  - Origin at socket_in: ground level, centered on the ENTRY edge (the -Z edge).
  - Piece runs +Z. socket_out at the exit edge, Y = entry Y + rise.
  - Walkable TOP surface at socket Y (grounding raycasts down onto it).
  - Flat pastel colors, no PBR maps. Low poly.
  - Named empties socket_in / socket_out drive assembly.
Exports one GLB per chunk into camp-chonkimal/assets/chunks/.
"""
import bpy, os, math, random

OUT_DIR = "/Users/jdesjardins/camp-chonkimal/assets/chunks"
HALF = 12.0          # half footprint (24u wide/deep)
DEPTH = 24.0         # z-length of a straight piece
THICK = 1.5          # slab thickness below the walkable top
SLOPE_RISE = 6.0     # gentle slope vertical gain

os.makedirs(OUT_DIR, exist_ok=True)


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def make_mat(name, rgb):
    m = bpy.data.materials.get(name)
    if m is None:
        m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
    # Soft matte clay: high roughness with a touch of sheen (not dead-flat).
    bsdf.inputs["Roughness"].default_value = 0.78
    bsdf.inputs["Metallic"].default_value = 0.0
    return m


# Clay look: round the hard edges with a small bevel + smooth shading, so every
# form reads as soft moulded plasticine instead of a sharp graybox.
CLAY_BEVEL = 0.18
CLAY_SEGMENTS = 3


def clayify(ob):
    for p in ob.data.polygons:
        p.use_smooth = True
    mod = ob.modifiers.new('clay_bevel', 'BEVEL')
    mod.width = CLAY_BEVEL
    mod.segments = CLAY_SEGMENTS
    mod.limit_method = 'ANGLE'
    mod.angle_limit = math.radians(30)
    mod.use_clamp_overlap = True
    return ob


def make_mesh(name, verts, faces, mat, clay=True):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    ob = bpy.data.objects.new(name, me)
    ob.data.materials.append(mat)
    bpy.context.collection.objects.link(ob)
    if clay:
        clayify(ob)
    else:
        for p in me.polygons:
            p.use_smooth = True
    return ob


def slab(name, get_top_y, mat):
    """A 24-wide slab spanning z in [0, DEPTH]; top Y from get_top_y(z), extruded down THICK."""
    z0, z1 = 0.0, DEPTH
    ty0, ty1 = get_top_y(z0), get_top_y(z1)
    v = [
        # top quad
        (-HALF, ty0, z0), (HALF, ty0, z0), (HALF, ty1, z1), (-HALF, ty1, z1),
        # bottom quad
        (-HALF, ty0 - THICK, z0), (HALF, ty0 - THICK, z0),
        (HALF, ty1 - THICK, z1), (-HALF, ty1 - THICK, z1),
    ]
    f = [
        (0, 1, 2, 3),        # top
        (7, 6, 5, 4),        # bottom
        (0, 3, 7, 4),        # left  (-X)
        (1, 5, 6, 2),        # right (+X)
        (0, 4, 5, 1),        # front (entry, -Z)
        (3, 2, 6, 7),        # back  (exit, +Z)
    ]
    return make_mesh(name, v, f, mat)


def path_strip(name, get_top_y, mat, w=3.0, lift=0.03):
    """A dirt path strip down the middle of a straight piece (readability guide)."""
    z0, z1 = 0.0, DEPTH
    ty0, ty1 = get_top_y(z0) + lift, get_top_y(z1) + lift
    v = [(-w, ty0, z0), (w, ty0, z0), (w, ty1, z1), (-w, ty1, z1)]
    return make_mesh(name, v, [(0, 1, 2, 3)], mat)


# ---- organic rocky edges + waterfall ------------------------------------
# A LOW rocky lip (not a tall castle wall) plus scattered rounded boulders of
# varied size = a natural mountain-path edge. It still drops below as a cliff.
LIP_UP = 1.1        # low continuous rock lip above the path (open, not a castle)
CLIFF_DROP = 4.5    # small ledge drop below the path (the dramatic cliff lives on the camp plateau)
LIP_THK = 1.8       # lip thickness outward from the path edge


def rock_box(name, x0, x1, y0, y1, z0, z1, mat):
    """Axis-aligned box (clayified -> rounded rock)."""
    v = [(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1),
         (x0, y1, z0), (x1, y1, z0), (x1, y1, z1), (x0, y1, z1)]
    f = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1),
         (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
    return make_mesh(name, v, f, mat)


def lip_seg(name, x0, x1, z0, z1, top_fn, mat, up=LIP_UP):
    """Low continuous rock lip; top/bottom follow the path so it hugs slopes."""
    ta, tb = top_fn(z0), top_fn(z1)
    v = [
        (x0, ta - CLIFF_DROP, z0), (x1, ta - CLIFF_DROP, z0),
        (x1, tb - CLIFF_DROP, z1), (x0, tb - CLIFF_DROP, z1),
        (x0, ta + up, z0), (x1, ta + up, z0),
        (x1, tb + up, z1), (x0, tb + up, z1),
    ]
    f = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1),
         (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
    return make_mesh(name, v, f, mat)


def boulder(name, cx, cz, base_y, r, mat, rnd):
    """A single rounded rock (clayified box with jittered dims)."""
    sx = r * rnd.uniform(0.8, 1.3)
    sy = r * rnd.uniform(0.7, 1.2)
    sz = r * rnd.uniform(0.8, 1.3)
    rock_box(name, cx - sx / 2, cx + sx / 2, base_y, base_y + sy,
             cz - sz / 2, cz + sz / 2, mat)


def cliff_face_holds(name, side, top_fn, mat, seed):
    """Rounded rock lumps/holds studded across the tall cliff FACE so it reads
    as a sculpted clay climbing wall rather than a flat grey slab."""
    rnd = random.Random(seed + 500)
    fx = side * (HALF + LIP_THK)  # the outer cliff face
    tag = 'r' if side > 0 else 'l'
    for i in range(22):
        z = rnd.uniform(0.8, DEPTH - 0.8)
        t = top_fn(z)
        y = rnd.uniform(t - CLIFF_DROP + 3.0, t - 1.0)
        r = rnd.uniform(1.0, 2.8)
        out = rnd.uniform(0.8, 2.0)  # how far it juts from the face
        x_in, x_out = fx, fx + side * out
        xa, xb = (x_in, x_out) if x_in < x_out else (x_out, x_in)
        rock_box(f"{name}_hold_{tag}{i}", xa, xb, y - r * 0.5, y + r * 0.5,
                 z - r * 0.6, z + r * 0.6, mat)


def rocky_edge(name, side, top_fn, mat, seed):
    """A low lip on top + scree boulders + a studded tall cliff face below."""
    xin, xout = side * HALF, side * (HALF + LIP_THK)
    xa, xb = (xin, xout) if xin < xout else (xout, xin)
    lip_seg(f"{name}_cliff", xa, xb, 0.0, DEPTH, top_fn, mat)  # 'cliff' -> collides
    rnd = random.Random(seed)
    n = 14
    for i in range(n):
        z = (i + 0.5) / n * DEPTH + rnd.uniform(-0.8, 0.8)
        t = top_fn(z)
        r = rnd.uniform(0.8, 2.0)            # smaller, denser natural scree on the lip
        bx = side * (HALF + 0.1) + side * rnd.uniform(-0.5, 0.7)
        boulder(f"{name}_rock_{'r' if side > 0 else 'l'}{i}",
                bx, z, t - rnd.uniform(0.2, 0.7), r, mat, rnd)


def waterfall_on_left(name, top_fn, water, foam, rock):
    """A LARGE waterfall flowing down the tall left cliff face into a pool."""
    zc, w = DEPTH * 0.5, 9.0          # wide sheet
    z0, z1 = zc - w / 2, zc + w / 2
    t = top_fn(zc)
    fx = -HALF - LIP_THK              # the outer cliff face
    # recessed rock channel backing the fall (a bit deeper than the face)
    rock_box(f"{name}_wf_notch", fx - 0.4, -HALF + 0.6, t - CLIFF_DROP,
             t + 4.0, z0 - 2.0, z1 + 2.0, rock)
    # the falling sheet on the cliff face, from the top nearly to the bottom
    x = fx - 0.12
    ytop, ybot = t + 3.6, t - (CLIFF_DROP - 2.0)
    sheet = [(x, ybot, z0), (x, ybot, z1), (x, ytop, z1), (x, ytop, z0)]
    make_mesh(f"{name}_waterfall", sheet, [(0, 1, 2, 3)], water, clay=False)
    # a slightly narrower brighter inner streak for a bit of flow variation
    zi0, zi1 = zc - w * 0.28, zc + w * 0.28
    streak = [(x - 0.05, ybot, zi0), (x - 0.05, ybot, zi1),
              (x - 0.05, ytop, zi1), (x - 0.05, ytop, zi0)]
    make_mesh(f"{name}_waterfall_streak", streak, [(0, 1, 2, 3)], foam, clay=False)
    # foam crest at the lip and a wide splash pool at the base
    crest = [(x - 0.08, ytop - 1.2, z0 - 0.5), (x - 0.08, ytop - 1.2, z1 + 0.5),
             (x - 0.08, ytop + 0.8, z1 + 0.5), (x - 0.08, ytop + 0.8, z0 - 0.5)]
    make_mesh(f"{name}_waterfall_crest", crest, [(0, 1, 2, 3)], foam, clay=False)
    splash = [(x - 0.1, ybot + 0.4, z0 - 2.2), (x - 6.0, ybot + 0.4, z0 - 2.2),
              (x - 6.0, ybot + 0.4, z1 + 2.2), (x - 0.1, ybot + 0.4, z1 + 2.2)]
    make_mesh(f"{name}_waterfall_splash", splash, [(0, 1, 2, 3)], foam, clay=False)


def side_cliffs(name, top_fn, mat, seed=1):
    rocky_edge(name, 1, top_fn, mat, seed)
    rocky_edge(name, -1, top_fn, mat, seed + 100)


def add_socket(name, loc, yaw_deg=0.0):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = 'ARROWS'
    e.empty_display_size = 2.0
    e.location = loc
    e.rotation_euler = (0.0, math.radians(yaw_deg), 0.0)
    bpy.context.collection.objects.link(e)
    return e


def export(name):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(OUT_DIR, f"{name}.glb"),
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        # Author directly in three.js Y-up coords, so DON'T let Blender remap
        # its Z-up axes — pass vertex/socket numbers straight through to glTF.
        export_yup=False,
    )


# ---- palette -------------------------------------------------------------
GRASS = make_mat("clay_grass", (0.44, 0.82, 0.37))
DIRT  = make_mat("clay_dirt",  (0.76, 0.57, 0.40))

# ---- 1) FLAT platform ----------------------------------------------------
reset_scene()
GRASS = make_mat("clay_grass", (0.44, 0.82, 0.37))
DIRT  = make_mat("clay_dirt",  (0.76, 0.57, 0.40))
ROCK  = make_mat("clay_cliff", (0.60, 0.59, 0.57))
slab("Chunk_Flat_surface", lambda z: 0.0, GRASS)
path_strip("Chunk_Flat_path", lambda z: 0.0, DIRT)
side_cliffs("Chunk_Flat", lambda z: 0.0, ROCK, seed=1)
add_socket("socket_in",  (0.0, 0.0, 0.0),  0.0)
add_socket("socket_out", (0.0, 0.0, DEPTH), 0.0)
export("chunk_flat")

# ---- 2) GENTLE SLOPE up --------------------------------------------------
reset_scene()
GRASS = make_mat("clay_grass", (0.44, 0.82, 0.37))
DIRT  = make_mat("clay_dirt",  (0.76, 0.57, 0.40))
ROCK  = make_mat("clay_cliff", (0.60, 0.59, 0.57))
WATER = make_mat("clay_water", (0.26, 0.70, 0.96))
FOAM  = make_mat("clay_foam",  (0.95, 0.98, 1.00))
ramp = lambda z: SLOPE_RISE * (z / DEPTH)
slab("Chunk_Slope_surface", ramp, GRASS)
path_strip("Chunk_Slope_path", ramp, DIRT)
side_cliffs("Chunk_Slope", ramp, ROCK, seed=5)
add_socket("socket_in",  (0.0, 0.0, 0.0), 0.0)
add_socket("socket_out", (0.0, SLOPE_RISE, DEPTH), 0.0)
export("chunk_slope")

# ---- 3) SWITCHBACK L (flat 90-degree left turn) --------------------------
# Enter from -Z going +Z; exit on the -X edge facing -X (a left turn).
reset_scene()
GRASS = make_mat("clay_grass", (0.44, 0.82, 0.37))
DIRT  = make_mat("clay_dirt",  (0.76, 0.57, 0.40))
ROCK  = make_mat("clay_cliff", (0.60, 0.59, 0.57))
slab("Chunk_SwitchbackL_surface", lambda z: 0.0, GRASS)
# elbow path: entry stub (down the center from z=0 to z=12) + turn stub (out to -X at z=12)
ep = [(-3, 0.03, 0), (3, 0.03, 0), (3, 0.03, 15), (-3, 0.03, 15)]
make_mesh("Chunk_SwitchbackL_path_in", ep, [(0, 1, 2, 3)], DIRT)
tp = [(-HALF, 0.03, 9), (-3, 0.03, 9), (-3, 0.03, 15), (-HALF, 0.03, 15)]
make_mesh("Chunk_SwitchbackL_path_out", tp, [(0, 1, 2, 3)], DIRT)
# Enclose the outer corner of the turn (east + north) and the exit-side edges
# either side of the -X opening (z 9..15). Entry (-Z) abuts the chunk below.
_f0 = lambda z: 0.0
lip_seg("Chunk_SwitchbackL_cliff_e", HALF, HALF + LIP_THK, 0.0, DEPTH, _f0, ROCK)
lip_seg("Chunk_SwitchbackL_cliff_n", -HALF, HALF + LIP_THK, DEPTH, DEPTH + LIP_THK, _f0, ROCK)
lip_seg("Chunk_SwitchbackL_cliff_wlo", -HALF - LIP_THK, -HALF, 0.0, 9.0, _f0, ROCK)
lip_seg("Chunk_SwitchbackL_cliff_whi", -HALF - LIP_THK, -HALF, 15.0, DEPTH, _f0, ROCK)
# organic boulders along the outer corner (east + north edges)
_sb = random.Random(21)
for i in range(10):
    boulder(f"Chunk_SwitchbackL_rock_e{i}", HALF + 0.1, (i + 0.5) / 10 * DEPTH,
            -_sb.uniform(0.2, 0.7), _sb.uniform(0.8, 2.0), ROCK, _sb)
for i in range(10):
    boulder(f"Chunk_SwitchbackL_rock_n{i}", (-HALF + 1) + i / 10 * (2 * HALF),
            DEPTH + 0.1, -_sb.uniform(0.2, 0.7), _sb.uniform(0.8, 2.0), ROCK, _sb)
add_socket("socket_in",  (0.0, 0.0, 0.0),  0.0)
# exit on -X edge, centered on z=12, facing -X (yaw -90 maps local +Z -> world -X)
add_socket("socket_out", (-HALF, 0.0, 12.0), -90.0)
export("chunk_switchback_l")

# ---- 4) FORK (end of the climb) -----------------------------------------
# Enter from -Z going +Z. Straight on (+Z) the path keeps climbing (a slope
# chunk is stitched on) but is barricaded "Under Construction". The branch to
# the -X side (the player's RIGHT when walking +Z) leads out to a wooden
# zipline deck + launch tower over the valley; the zipline itself (cable,
# landing, ride) is built at runtime by src/zipline.ts from the markers here.
reset_scene()
GRASS = make_mat("clay_grass", (0.44, 0.82, 0.37))
DIRT  = make_mat("clay_dirt",  (0.76, 0.57, 0.40))
ROCK  = make_mat("clay_cliff", (0.60, 0.59, 0.57))
WOOD  = make_mat("clay_wood",  (0.68, 0.47, 0.31))
ORANGE = make_mat("clay_hazard_orange", (1.00, 0.52, 0.12))
WHITE  = make_mat("clay_hazard_white",  (0.97, 0.96, 0.93))
_f0 = lambda z: 0.0
slab("Chunk_Fork_surface", _f0, GRASS)
make_mesh("Chunk_Fork_path_up", [(-3, 0.03, 0), (3, 0.03, 0), (3, 0.03, DEPTH), (-3, 0.03, DEPTH)],
          [(0, 1, 2, 3)], DIRT)
make_mesh("Chunk_Fork_path_zip", [(-HALF, 0.04, 9), (-3, 0.04, 9), (-3, 0.04, 15), (-HALF, 0.04, 15)],
          [(0, 1, 2, 3)], DIRT)

# Edges: full rocky edge on +X; on -X a lip either side of the deck opening (z 8.5..15.5).
rocky_edge("Chunk_Fork", 1, _f0, ROCK, 31)
lip_seg("Chunk_Fork_cliff_wlo", -HALF - LIP_THK, -HALF, 0.0, 8.5, _f0, ROCK)
lip_seg("Chunk_Fork_cliff_whi", -HALF - LIP_THK, -HALF, 15.5, DEPTH, _f0, ROCK)
_fk = random.Random(37)
for i, z in enumerate([1.2, 3.4, 5.6, 7.4, 16.6, 18.6, 20.8, 23.0]):
    boulder(f"Chunk_Fork_rock_l{i}", -HALF - 0.1, z, -_fk.uniform(0.2, 0.7), _fk.uniform(0.8, 1.8), ROCK, _fk)

# Zipline deck: plank platform jutting out over the drop, legs down the cliff,
# low side rails, and a two-post launch tower at the far end.
DX0, DX1, DZ0, DZ1 = -19.0, -11.6, 8.6, 15.4
rock_box("Chunk_Fork_zipdeck_surface", DX0, DX1, -0.45, 0.05, DZ0, DZ1, WOOD)
for i, (lx, lz) in enumerate([(DX0 + 0.5, DZ0 + 0.5), (DX0 + 0.5, DZ1 - 0.5), (DX1 - 1.2, DZ0 + 0.5), (DX1 - 1.2, DZ1 - 0.5)]):
    rock_box(f"Chunk_Fork_zipdeck_leg{i}", lx - 0.3, lx + 0.3, -9.0, -0.4, lz - 0.3, lz + 0.3, WOOD)
rock_box("Chunk_Fork_ziprail_s_cliff", DX0, DX1 + 0.4, 0.0, 1.3, DZ0, DZ0 + 0.45, WOOD)
rock_box("Chunk_Fork_ziprail_n_cliff", DX0, DX1 + 0.4, 0.0, 1.3, DZ1 - 0.45, DZ1, WOOD)
rock_box("Chunk_Fork_ziprail_end_cliff", DX0, DX0 + 0.45, 0.0, 1.3, DZ0, DZ1, WOOD)
for nm, z0 in (("a", DZ0 + 0.5), ("b", DZ1 - 1.2)):
    rock_box(f"Chunk_Fork_ziptower_post_{nm}", DX0 + 0.5, DX0 + 1.2, 0.0, 6.6, z0, z0 + 0.7, WOOD)
rock_box("Chunk_Fork_ziptower_beam", DX0 + 0.3, DX0 + 1.4, 5.9, 6.6, DZ0 + 0.2, DZ1 - 0.2, WOOD)
rock_box("Chunk_Fork_ziptower_brace", DX0 + 0.5, DX0 + 1.2, 2.2, 2.7, DZ0 + 0.6, DZ1 - 0.6, WOOD)

# Construction barricade across the way up: striped boards over the path on
# A-frame legs, cones across the rest of the width. The tall invisible blocker
# (so it can't be jumped) is added at runtime at the `barrier` marker.
BZ = 20.5
for leg_x in (-4.2, 4.2):
    for dz in (-0.55, 0.55):
        rock_box(f"Chunk_Fork_barricade_leg{'l' if leg_x < 0 else 'r'}{'f' if dz < 0 else 'b'}",
                 leg_x - 0.18, leg_x + 0.18, 0.0, 2.0, BZ + min(dz, dz * 0.2), BZ + max(dz, dz * 0.2), WOOD)
for bi, by in enumerate((0.95, 1.75)):
    n = 7
    for k in range(n):
        x0 = -4.8 + k * (9.6 / n)
        rock_box(f"Chunk_Fork_barricade_board{bi}_{k}", x0, x0 + 9.6 / n, by - 0.28, by + 0.28,
                 BZ - 0.12, BZ + 0.12, ORANGE if (k + bi) % 2 == 0 else WHITE)


def traffic_cone(name, cx, cz, h=1.5, r=0.55, n=12):
    v = [(cx + r * math.cos(2 * math.pi * i / n), 0.12, cz + r * math.sin(2 * math.pi * i / n)) for i in range(n)]
    v.append((cx, h, cz))
    f = [(i, (i + 1) % n, n) for i in range(n)] + [tuple(reversed(range(n)))]
    make_mesh(name, v, f, ORANGE)
    rock_box(f"{name}_base", cx - r * 1.15, cx + r * 1.15, 0.0, 0.14, cz - r * 1.15, cz + r * 1.15, ORANGE)
    rw = r * 0.62
    rock_box(f"{name}_band", cx - rw, cx + rw, h * 0.45, h * 0.6, cz - rw, cz + rw, WHITE)


for i, cx in enumerate((-10.5, -8.2, -6.0, 6.0, 8.2, 10.5)):
    traffic_cone(f"Chunk_Fork_cone{i}", cx, BZ + (0.25 if i % 2 else -0.25))

add_socket("zip_mount", (-15.4, 0.0, 12.0), 0.0)     # stand here to get the "Ride" prompt
add_socket("npc_zipline", (-16.8, 0.0, 14.0), 90.0)  # the zipline counselor: on the deck by the launch tower, facing the way in
add_socket("zip_anchor", (-19.3, 5.5, 12.0), 0.0)    # cable leaves the tower beam here
add_socket("barrier", (0.0, 0.0, BZ), 0.0)           # runtime blocker spans the full width
add_socket("sign_construction", (0.0, 0.0, BZ - 1.4), 0.0)
add_socket("socket_in",  (0.0, 0.0, 0.0),  0.0)
add_socket("socket_out", (0.0, 0.0, DEPTH), 0.0)
export("chunk_fork")

# ---- 5) SWITCHBACK T (the switchback, plus a branch out of its east edge) --
# Same as SWITCHBACK L (enter -Z, exit -X), but the east lip opens at z 9..15
# onto a path stub and `socket_branch` (facing +X): the steep climb to the
# hang-glider launch hangs off it.
reset_scene()
GRASS = make_mat("clay_grass", (0.44, 0.82, 0.37))
DIRT  = make_mat("clay_dirt",  (0.76, 0.57, 0.40))
ROCK  = make_mat("clay_cliff", (0.60, 0.59, 0.57))
slab("Chunk_SwitchbackT_surface", lambda z: 0.0, GRASS)
make_mesh("Chunk_SwitchbackT_path_in", [(-3, 0.03, 0), (3, 0.03, 0), (3, 0.03, 15), (-3, 0.03, 15)], [(0, 1, 2, 3)], DIRT)
make_mesh("Chunk_SwitchbackT_path_out", [(-HALF, 0.03, 9), (-3, 0.03, 9), (-3, 0.03, 15), (-HALF, 0.03, 15)], [(0, 1, 2, 3)], DIRT)
make_mesh("Chunk_SwitchbackT_path_branch", [(3, 0.04, 9), (HALF, 0.04, 9), (HALF, 0.04, 15), (3, 0.04, 15)], [(0, 1, 2, 3)], DIRT)
_f0 = lambda z: 0.0
lip_seg("Chunk_SwitchbackT_cliff_elo", HALF, HALF + LIP_THK, 0.0, 9.0, _f0, ROCK)
lip_seg("Chunk_SwitchbackT_cliff_ehi", HALF, HALF + LIP_THK, 15.0, DEPTH, _f0, ROCK)
lip_seg("Chunk_SwitchbackT_cliff_n", -HALF, HALF + LIP_THK, DEPTH, DEPTH + LIP_THK, _f0, ROCK)
lip_seg("Chunk_SwitchbackT_cliff_wlo", -HALF - LIP_THK, -HALF, 0.0, 9.0, _f0, ROCK)
lip_seg("Chunk_SwitchbackT_cliff_whi", -HALF - LIP_THK, -HALF, 15.0, DEPTH, _f0, ROCK)
_st = random.Random(21)
for i in range(10):
    z = (i + 0.5) / 10 * DEPTH
    if 8.0 < z < 16.0:
        continue  # keep the branch opening clear
    boulder(f"Chunk_SwitchbackT_rock_e{i}", HALF + 0.1, z, -_st.uniform(0.2, 0.7), _st.uniform(0.8, 2.0), ROCK, _st)
for i in range(10):
    boulder(f"Chunk_SwitchbackT_rock_n{i}", (-HALF + 1) + i / 10 * (2 * HALF),
            DEPTH + 0.1, -_st.uniform(0.2, 0.7), _st.uniform(0.8, 2.0), ROCK, _st)
add_socket("socket_in",  (0.0, 0.0, 0.0),  0.0)
add_socket("socket_out", (-HALF, 0.0, 12.0), -90.0)
add_socket("socket_branch", (HALF, 0.0, 12.0), 90.0)
export("chunk_switchback_t")

# ---- 6) STEEP SLOPE up (twice the gentle rise) -----------------------------
STEEP_RISE = 12.0
reset_scene()
GRASS = make_mat("clay_grass", (0.44, 0.82, 0.37))
DIRT  = make_mat("clay_dirt",  (0.76, 0.57, 0.40))
ROCK  = make_mat("clay_cliff", (0.60, 0.59, 0.57))
steep = lambda z: STEEP_RISE * (z / DEPTH)
slab("Chunk_Steep_surface", steep, GRASS)
path_strip("Chunk_Steep_path", steep, DIRT)
side_cliffs("Chunk_Steep", steep, ROCK, seed=9)
add_socket("socket_in",  (0.0, 0.0, 0.0), 0.0)
add_socket("socket_out", (0.0, STEEP_RISE, DEPTH), 0.0)
export("chunk_slope_steep")

# ---- 7) GLIDER LAUNCH (end of the branch) ----------------------------------
# Flat pad; the take-off ramp juts out of the +X edge (the player's RIGHT
# walking +Z), over the drop toward camp. src/glider.ts does the flying from
# the markers here.
reset_scene()
GRASS = make_mat("clay_grass", (0.44, 0.82, 0.37))
DIRT  = make_mat("clay_dirt",  (0.76, 0.57, 0.40))
ROCK  = make_mat("clay_cliff", (0.60, 0.59, 0.57))
WOOD  = make_mat("clay_wood",  (0.68, 0.47, 0.31))
ORANGE = make_mat("clay_hazard_orange", (1.00, 0.52, 0.12))
WHITE  = make_mat("clay_hazard_white",  (0.97, 0.96, 0.93))
_f0 = lambda z: 0.0
slab("Chunk_Launch_surface", _f0, GRASS)
make_mesh("Chunk_Launch_path_in", [(-3, 0.03, 0), (3, 0.03, 0), (3, 0.03, 15), (-3, 0.03, 15)], [(0, 1, 2, 3)], DIRT)
make_mesh("Chunk_Launch_path_ramp", [(-3, 0.04, 9), (HALF, 0.04, 9), (HALF, 0.04, 15), (-3, 0.04, 15)], [(0, 1, 2, 3)], DIRT)
rocky_edge("Chunk_Launch", -1, _f0, ROCK, 41)
lip_seg("Chunk_Launch_cliff_n", -HALF - LIP_THK, HALF + LIP_THK, DEPTH, DEPTH + LIP_THK, _f0, ROCK)
lip_seg("Chunk_Launch_cliff_elo", HALF, HALF + LIP_THK, 0.0, 8.5, _f0, ROCK)
lip_seg("Chunk_Launch_cliff_ehi", HALF, HALF + LIP_THK, 15.5, DEPTH, _f0, ROCK)
_lc = random.Random(43)
for i, z in enumerate([1.0, 3.3, 5.8, 7.6, 16.4, 18.8, 21.2, 23.2]):
    boulder(f"Chunk_Launch_rock_e{i}", HALF + 0.1, z, -_lc.uniform(0.2, 0.7), _lc.uniform(0.8, 1.8), ROCK, _lc)
# Take-off ramp: planks tilting gently DOWN toward the lip, on legs, with side rails.
RX0, RX1, RZ0, RZ1 = HALF - 0.4, HALF + 7.0, 8.6, 15.4
drop = 0.9
v = [(RX0, 0.05, RZ0), (RX1, 0.05 - drop, RZ0), (RX1, 0.05 - drop, RZ1), (RX0, 0.05, RZ1),
     (RX0, -0.45, RZ0), (RX1, -0.45 - drop, RZ0), (RX1, -0.45 - drop, RZ1), (RX0, -0.45, RZ1)]
make_mesh("Chunk_Launch_ramp_surface", v, [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)], WOOD)
for i, (lx, lz) in enumerate([(RX1 - 0.5, RZ0 + 0.5), (RX1 - 0.5, RZ1 - 0.5), (RX0 + 1.2, RZ0 + 0.5), (RX0 + 1.2, RZ1 - 0.5)]):
    rock_box(f"Chunk_Launch_ramp_leg{i}", lx - 0.3, lx + 0.3, -9.0, -0.4 - drop * (lx - RX0) / (RX1 - RX0), lz - 0.3, lz + 0.3, WOOD)
for nm, z0 in (("s", RZ0), ("n", RZ1 - 0.45)):
    rock_box(f"Chunk_Launch_ramprail_{nm}_cliff", RX0 + 0.4, RX1, -drop + 0.05, 1.3, z0, z0 + 0.45, WOOD)
# Windsock on a pole by the ramp (reads "this is where you fly").
rock_box("Chunk_Launch_windsock_pole", HALF - 1.6, HALF - 1.2, 0.0, 6.2, RZ1 + 0.9, RZ1 + 1.3, WOOD)
for k in range(4):
    r0, r1 = 0.62 - k * 0.1, 0.54 - k * 0.1
    x0 = HALF - 1.2 + k * 0.7
    rock_box(f"Chunk_Launch_windsock_{k}", x0, x0 + 0.7, 5.3 - r0, 5.3 + r0, RZ1 + 1.1 - r1, RZ1 + 1.1 + r1,
             ORANGE if k % 2 == 0 else WHITE)
add_socket("glide_mount", (HALF - 1.4, 0.0, 12.0), 0.0)   # stand here for the "Hang Glide!" prompt
add_socket("glide_start", (RX1, 0.05 - drop, 12.0), 90.0)  # take-off point at the lip, facing out
add_socket("glide_edge", (RX1 - 0.3, 0.0, 12.0), 90.0)     # runtime blocker across the ramp end
add_socket("npc_glider", (HALF - 3.4, 0.0, 16.6), 180.0)  # launch counselor, by the ramp, facing the way in
add_socket("socket_in",  (0.0, 0.0, 0.0),  0.0)
add_socket("socket_out", (0.0, 0.0, DEPTH), 0.0)
export("chunk_glide_launch")

print("CHUNKS_DONE")
