"""
Chonkimals basecamp hub — "Camp Chonkton", laid out to match the reference map
(minus the dense foliage). three.js Y-up, exported with export_yup=False.

Compass: +Z = North (toward the mountains / the hill climb), +X = East.
Zones (see reference):
  - Camp Entrance (S, torii gate + spawn)
  - Chonk Lake + dock (SW)
  - Camp Hub building (W)
  - Campsite: tents + campfire + log benches (centre)
  - Cabins (E)
  - Dodgeball court (N)          - Sumo ring (N-E)
  - Waterfall (NE) -> River winding S through the camp, with plank bridges
  - Snow-capped mountains backdrop (far N), north gate -> hill climb
Walkable surfaces are named with surface|ground|path; everything else is visual.
Exports camp_base.glb into camp-chonkimal/assets/chunks/.
"""
import bpy, os, math, random

OUT_DIR = "/Users/jdesjardins/camp-chonkimal/assets/chunks"
os.makedirs(OUT_DIR, exist_ok=True)

HX = 60.0    # half width  (x in [-60, 60])
DZ = 120.0   # depth       (z in [0, 120])
THICK = 30.0  # deep sides -> the camp reads as a high plateau / mountain shelf

CLAY_BEVEL = 0.18
CLAY_SEGMENTS = 3


def make_mat(name, rgb, alpha=1.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get("Principled BSDF")
    b.inputs["Base Color"].default_value = (*rgb, alpha)
    b.inputs["Roughness"].default_value = 0.78
    b.inputs["Metallic"].default_value = 0.0
    if alpha < 1.0:
        b.inputs["Alpha"].default_value = alpha
        m.blend_method = 'BLEND'
    return m


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


# ---- primitives ----------------------------------------------------------
def quad_y(name, x0, x1, z0, z1, y, mat):
    v = [(x0, y, z0), (x1, y, z0), (x1, y, z1), (x0, y, z1)]
    return make_mesh(name, v, [(0, 1, 2, 3)], mat, clay=False)


def quad_vertical(name, x0, x1, y0, y1, z, mat):
    v = [(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)]
    return make_mesh(name, v, [(0, 1, 2, 3)], mat, clay=False)


def strip_seg(name, x0, z0, x1, z1, w, y, mat, clay=False):
    dx, dz = x1 - x0, z1 - z0
    L = math.hypot(dx, dz) or 1.0
    px, pz = -dz / L * w / 2, dx / L * w / 2
    v = [(x0 + px, y, z0 + pz), (x0 - px, y, z0 - pz),
         (x1 - px, y, z1 - pz), (x1 + px, y, z1 + pz)]
    return make_mesh(name, v, [(0, 1, 2, 3)], mat, clay=clay)


def disc(name, cx, cz, r, y, mat, n=20, clay=False):
    v = [(cx, y, cz)]
    for i in range(n):
        a = i * 2 * math.pi / n
        v.append((cx + math.cos(a) * r, y, cz + math.sin(a) * r))
    f = [(0, i + 1, (i + 1) % n + 1) for i in range(n)]
    return make_mesh(name, v, f, mat, clay=clay)


def blob(name, cx, cz, r, y, mat, n=18, jitter=0.28, seed=1):
    """Irregular lake-ish polygon."""
    import random
    rnd = random.Random(seed)
    v = [(cx, y, cz)]
    for i in range(n):
        a = i * 2 * math.pi / n
        rr = r * (1.0 + rnd.uniform(-jitter, jitter))
        v.append((cx + math.cos(a) * rr, y, cz + math.sin(a) * rr))
    f = [(0, i + 1, (i + 1) % n + 1) for i in range(n)]
    return make_mesh(name, v, f, mat, clay=False)


def box(name, cx, cz, sx, sy, sz, mat, y0=0.0, clay=True):
    x0, x1 = cx - sx / 2, cx + sx / 2
    z0, z1 = cz - sz / 2, cz + sz / 2
    y1 = y0 + sy
    v = [(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1),
         (x0, y1, z0), (x1, y1, z0), (x1, y1, z1), (x0, y1, z1)]
    f = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1),
         (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
    return make_mesh(name, v, f, mat, clay=clay)


def pyramid(name, cx, cz, base, h, mat, y0=0.0, cap=None):
    x0, x1 = cx - base / 2, cx + base / 2
    z0, z1 = cz - base / 2, cz + base / 2
    v = [(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1), (cx, y0 + h, cz)]
    f = [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4), (0, 3, 2, 1)]
    return make_mesh(name, v, f, mat)


def cone(name, cx, cz, r, h, mat, y0=0.0, n=18):
    """Many-sided cone — clayified into a soft rounded peak/hill/flame."""
    v = [(cx, y0, cz), (cx, y0 + h, cz)]  # 0 base centre, 1 apex
    for i in range(n):
        a = i * 2 * math.pi / n
        v.append((cx + math.cos(a) * r, y0, cz + math.sin(a) * r))
    f = []
    for i in range(n):
        b0, b1 = 2 + i, 2 + (i + 1) % n
        f.append((0, b1, b0))   # base
        f.append((b0, b1, 1))   # side to apex
    return make_mesh(name, v, f, mat)


def sphere(name, cx, cy, cz, r, mat, subdiv=2):
    """Icosphere primitive (already round — smooth-shaded, no bevel needed)."""
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdiv, radius=r,
                                           location=(cx, cy, cz))
    ob = bpy.context.active_object
    ob.name = name
    ob.data.materials.append(mat)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def cloud(name, cx, cy, cz, s=1.0):
    """A puffy cloud = a few overlapping white spheres."""
    puffs = [(0, 0, 0, 2.4), (2.6, -0.3, 0.4, 1.8), (-2.4, -0.2, -0.3, 1.7),
             (1.1, 0.7, 0.8, 1.5), (-1.0, 0.5, 0.6, 1.4)]
    for i, (dx, dy, dz, r) in enumerate(puffs):
        sphere(f"{name}_{i}", cx + dx * s, cy + dy * s, cz + dz * s, r * s, FOAM)


# ---- water basins --------------------------------------------------------
# A body of water is a real recessed bowl: a hole cut into the ground slab, a
# dark walkable BED at the bottom, sloped walkable BANKS from the shore rim down
# to the bed, and the animated water SURFACE set a touch below the rim so a bank
# lip shows. The frog wades down the banks and floats in the deep middle. Cutters
# are collected and DE-selected before export so only the hole (not the tool)
# ships. Beds/banks are named *_ground so they collide; the surface is water_*.
_cutters = []


def _centroid(poly):
    n = len(poly)
    return (sum(p[0] for p in poly) / n, sum(p[1] for p in poly) / n)


def _inset(poly, d):
    """Move every rim vertex toward the centroid by ~d (clamped short of centre)."""
    cx, cz = _centroid(poly)
    out = []
    for (x, z) in poly:
        dx, dz = cx - x, cz - z
        L = math.hypot(dx, dz) or 1.0
        t = min(d / L, 0.85)
        out.append((x + dx * t, z + dz * t))
    return out


def blob_poly(cx, cz, r, n=18, jitter=0.28, seed=1):
    rnd = random.Random(seed)
    return [(cx + math.cos(i * 2 * math.pi / n) * r * (1.0 + rnd.uniform(-jitter, jitter)),
             cz + math.sin(i * 2 * math.pi / n) * r * (1.0 + rnd.uniform(-jitter, jitter)))
            for i in range(n)]


def disc_poly(cx, cz, r, n=22):
    return [(cx + math.cos(i * 2 * math.pi / n) * r, cz + math.sin(i * 2 * math.pi / n) * r)
            for i in range(n)]


def strip_poly(x0, z0, x1, z1, w):
    dx, dz = x1 - x0, z1 - z0
    L = math.hypot(dx, dz) or 1.0
    px, pz = -dz / L * w / 2, dx / L * w / 2
    return [(x0 + px, z0 + pz), (x1 + px, z1 + pz), (x1 - px, z1 - pz), (x0 - px, z0 - pz)]


def _prism(name, poly, ytop, ybot):
    """Closed manifold prism from a 2D (x,z) polygon — used as a boolean cutter."""
    n = len(poly)
    v = [(x, ytop, z) for (x, z) in poly] + [(x, ybot, z) for (x, z) in poly]
    f = [(0, i, i + 1) for i in range(1, n - 1)]              # top cap
    f += [(n, n + i + 1, n + i) for i in range(1, n - 1)]      # bottom cap
    f += [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]  # sides
    return make_mesh(name, v, f, WATER, clay=False)


def carve_water(name, poly, ground_ob, surface_y=-0.25, depth=2.6, bank=3.0, base=0.0):
    """Cut a basin for `poly` out of `ground_ob` and fill it with bed/banks/water."""
    surf = base + surface_y
    bed_y = base - depth
    rim_y = base - 0.05
    n = len(poly)

    # 1) hole in the ground (boolean DIFFERENCE, kept ahead of the clay bevel)
    cutter = _prism(f"cutter_{name}", poly, base + 1.5, bed_y - 0.6)
    _cutters.append(cutter)
    m = ground_ob.modifiers.new(f"cut_{name}", 'BOOLEAN')
    m.operation = 'DIFFERENCE'
    m.object = cutter
    m.solver = 'EXACT'
    bpy.context.view_layer.objects.active = ground_ob
    bpy.ops.object.modifier_move_to_index(modifier=f"cut_{name}", index=0)

    # 2) dark walkable bed at the bottom
    bed = _inset(poly, bank)
    bv = [(x, bed_y, z) for (x, z) in bed]
    make_mesh(f"{name}_bed_ground", bv, [(0, i, i + 1) for i in range(1, n - 1)], DEEPW, clay=False)

    # 3) sloped walkable banks (rim -> bed)
    for i in range(n):
        a, b = i, (i + 1) % n
        (rx0, rz0), (rx1, rz1) = poly[a], poly[b]
        (bx0, bz0), (bx1, bz1) = bed[a], bed[b]
        make_mesh(f"{name}_bank_ground_{i}",
                  [(rx0, rim_y, rz0), (rx1, rim_y, rz1), (bx1, bed_y, bz1), (bx0, bed_y, bz0)],
                  [(0, 1, 2, 3)], DEEPW, clay=False)

    # 4) animated water surface (WATER material -> water.ts shader)
    sv = [(x, surf, z) for (x, z) in poly]
    make_mesh(name, sv, [(0, i, i + 1) for i in range(1, n - 1)], WATER, clay=False)


def _resample(polyline, step):
    """Densely resample a 2D polyline so a swept corridor bends smoothly."""
    out = []
    for i in range(len(polyline) - 1):
        (x0, z0), (x1, z1) = polyline[i], polyline[i + 1]
        L = math.hypot(x1 - x0, z1 - z0)
        n = max(1, int(L / step))
        for k in range(n):
            t = k / n
            out.append((x0 + (x1 - x0) * t, z0 + (z1 - z0) * t))
    out.append(polyline[-1])
    return out


def _normals(pts):
    """Right-hand XZ perpendicular at each point (smoothed across the vertex)."""
    out = []
    for i in range(len(pts)):
        a = pts[max(0, i - 1)]
        b = pts[min(len(pts) - 1, i + 1)]
        tx, tz = b[0] - a[0], b[1] - a[1]
        L = math.hypot(tx, tz) or 1.0
        out.append((tz / L, -tx / L))
    return out


def _corridor_solid(name, Lr, Rr, ytop, ybot):
    """A closed manifold tube between the left/right rails — a boolean cutter."""
    v = []
    for i in range(len(Lr)):
        v += [(Lr[i][0], ytop, Lr[i][1]), (Rr[i][0], ytop, Rr[i][1]),
              (Lr[i][0], ybot, Lr[i][1]), (Rr[i][0], ybot, Rr[i][1])]
    f = []
    for i in range(len(Lr) - 1):
        a, b = 4 * i, 4 * (i + 1)
        f += [(a + 0, a + 1, b + 1, b + 0), (a + 2, b + 2, b + 3, a + 3),
              (a + 0, b + 0, b + 2, a + 2), (a + 1, a + 3, b + 3, b + 1)]
    e = 4 * (len(Lr) - 1)
    f += [(0, 2, 3, 1), (e + 0, e + 1, e + 3, e + 2)]  # end caps
    return make_mesh(name, v, f, WATER, clay=False)


def _strip(name, A, B, ya, yb, mat):
    """A continuous quad ribbon between two rails A and B (constant y per rail)."""
    v, f = [], []
    for i in range(len(A)):
        v += [(A[i][0], ya, A[i][1]), (B[i][0], yb, B[i][1])]
    for i in range(len(A) - 1):
        a = 2 * i
        f.append((a, a + 1, a + 3, a + 2))
    make_mesh(name, v, f, mat, clay=False)


def carve_river_corridor(name, polyline, ground_ob, path_obs,
                         half_w=2.9, depth=1.7, bank=1.4, base=0.0, step=2.5):
    """One CONTINUOUS trench along `polyline`: a single hole (also cut from any
    crossing paths so they don't float over the lowered water) plus continuous
    dark bed + sloped banks. The water SURFACE stays as the per-segment
    `water_river_N` quads the log course reads — this only fixes the terrain."""
    pts = _resample(polyline, step)
    nrm = _normals(pts)
    bed_y, rim_y = base - depth, base - 0.05
    bw = max(0.5, half_w - bank)
    Lr = [(x + nx * half_w, z + nz * half_w) for (x, z), (nx, nz) in zip(pts, nrm)]
    Rr = [(x - nx * half_w, z - nz * half_w) for (x, z), (nx, nz) in zip(pts, nrm)]
    Lb = [(x + nx * bw, z + nz * bw) for (x, z), (nx, nz) in zip(pts, nrm)]
    Rb = [(x - nx * bw, z - nz * bw) for (x, z), (nx, nz) in zip(pts, nrm)]

    cutter = _corridor_solid(f"cutter_{name}", Lr, Rr, base + 1.5, bed_y - 0.6)
    _cutters.append(cutter)
    for ob in [ground_ob] + list(path_obs):
        mo = ob.modifiers.new(f"cut_{name}_{ob.name}", 'BOOLEAN')
        mo.operation = 'DIFFERENCE'
        mo.object = cutter
        mo.solver = 'EXACT'
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.modifier_move_to_index(modifier=mo.name, index=0)

    _strip(f"{name}_bed_ground",   Lb, Rb, bed_y, bed_y, DEEPW)
    _strip(f"{name}_bankL_ground", Lr, Lb, rim_y, bed_y, DEEPW)
    _strip(f"{name}_bankR_ground", Rr, Rb, rim_y, bed_y, DEEPW)


def over_edge_waterfall(name, wall_x, z0, z1, mat, out_prof, th_prof, flare=3.0, mseg=8):
    """A THICK waterfall slab that rolls over the lip and gathers volume as it
    falls — not a flat plane on the wall. `out_prof` is a top→base list of
    (outward_offset, y) control points (outward = -X from wall_x); `th_prof` is
    the front→back thickness at each. Swept across the width (z0..z1, flaring)."""
    n = len(out_prof) - 1
    y_top, y_base = out_prof[0][1], out_prof[-1][1]
    span = (y_top - y_base) or 1.0

    def zl(s):
        return z0 - flare * max(0.0, s)

    def zr(s):
        return z1 + flare * max(0.0, s)

    rowsF, rowsB = [], []
    for j, (out, y) in enumerate(out_prof):
        s = (y_top - y) / span
        fx = wall_x - out               # front face (proud of the wall)
        bx = fx + th_prof[j]            # back face (toward the wall)
        rf, rb = [], []
        for k in range(mseg + 1):
            z = zl(s) + (zr(s) - zl(s)) * k / mseg
            rf.append((fx, y, z))
            rb.append((bx, y, z))
        rowsF.append(rf)
        rowsB.append(rb)

    verts, idx = [], {}

    def vid(p):
        key = (round(p[0], 4), round(p[1], 4), round(p[2], 4))
        if key not in idx:
            idx[key] = len(verts)
            verts.append(p)
        return idx[key]

    faces = []
    for j in range(n):
        for k in range(mseg):
            faces.append((vid(rowsF[j][k]), vid(rowsF[j][k + 1]),
                          vid(rowsF[j + 1][k + 1]), vid(rowsF[j + 1][k])))          # front
            faces.append((vid(rowsB[j][k]), vid(rowsB[j + 1][k]),
                          vid(rowsB[j + 1][k + 1]), vid(rowsB[j][k + 1])))          # back
        # side edges give the slab visible thickness
        faces.append((vid(rowsF[j][0]), vid(rowsF[j + 1][0]),
                      vid(rowsB[j + 1][0]), vid(rowsB[j][0])))
        faces.append((vid(rowsF[j][mseg]), vid(rowsB[j][mseg]),
                      vid(rowsB[j + 1][mseg]), vid(rowsF[j + 1][mseg])))
    for k in range(mseg):                                                          # crest cap (top)
        faces.append((vid(rowsF[0][k]), vid(rowsB[0][k]),
                      vid(rowsB[0][k + 1]), vid(rowsF[0][k + 1])))
    return make_mesh(name, verts, faces, mat, clay=False)


def tree(name, cx, cz, trunk_h, canopy_r, canopy_mat, base_y=0.0):
    """Rounded clay tree: chunky trunk + a puffy canopy (a couple of spheres)."""
    box(f"{name}_trunk", cx, cz, 0.9, trunk_h, 0.9, WOOD, y0=base_y)
    sphere(f"{name}_canopy", cx, base_y + trunk_h + canopy_r * 0.5, cz, canopy_r, canopy_mat)
    sphere(f"{name}_canopy2", cx + canopy_r * 0.5, base_y + trunk_h + canopy_r * 0.9,
           cz - canopy_r * 0.3, canopy_r * 0.65, canopy_mat)


def gable(name, cx, cz, w, d, h, mat, y0=0.0):
    """Triangular prism roof, ridge along Z."""
    z0, z1 = cz - d / 2, cz + d / 2
    x0, x1, xa = cx - w / 2, cx + w / 2, cx
    yb, yt = y0, y0 + h
    v = [(x0, yb, z0), (x1, yb, z0), (xa, yt, z0),
         (x0, yb, z1), (x1, yb, z1), (xa, yt, z1)]
    f = [(0, 2, 1), (3, 4, 5), (0, 3, 5, 2), (2, 5, 4, 1), (0, 1, 4, 3)]
    return make_mesh(name, v, f, mat)


def add_marker(name, loc, yaw_deg=0.0):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = 'ARROWS'
    e.empty_display_size = 2.0
    e.location = loc
    e.rotation_euler = (0.0, math.radians(yaw_deg), 0.0)
    bpy.context.collection.objects.link(e)
    return e


# ---- composite props -----------------------------------------------------
def cabin(name, cx, cz, w, d, hwall):
    box(f"{name}_body", cx, cz, w, hwall, d, WOOD)
    gable(f"{name}_roof", cx, cz, w * 1.18, d * 1.18, w * 0.45, ROOF, y0=hwall)


def torii(name, cx, cz, w, h):
    box(f"{name}_post_l", cx - w / 2, cz, 0.7, h, 0.7, WOOD)
    box(f"{name}_post_r", cx + w / 2, cz, 0.7, h, 0.7, WOOD)
    box(f"{name}_beam_top", cx, cz, w + 2.4, 0.7, 1.0, WOOD, y0=h)
    box(f"{name}_beam_mid", cx, cz, w + 0.6, 0.5, 0.7, WOOD, y0=h - 1.4)


def dock(name, cx, cz, length):
    box(f"{name}_deck_surface", cx, cz, 3.2, 0.3, length, WOOD, y0=0.25)
    for dzp in (-length / 2 + 0.6, length / 2 - 0.6):
        for dxp in (-1.3, 1.3):
            box(f"{name}_post", cx + dxp, cz + dzp, 0.4, 0.6, 0.4, WOOD, y0=-0.2)


def sumo_ring(name, cx, cz, r):
    # Apron raised above the dirt paths (y=0.03) so a path passes under the ring.
    disc(f"{name}_pad_ground", cx, cz, r + 1.4, 0.08, SAND, clay=False)
    disc(f"{name}_surface", cx, cz, r, 0.22, SAND, clay=True)
    for i in range(14):
        a = i * 2 * math.pi / 14
        box(f"{name}_bale", cx + math.cos(a) * r, cz + math.sin(a) * r,
            0.9, 0.5, 0.9, STRAW, y0=0.0)


def fence_rect(name, cx, cz, w, d, post_step=3.0, rail_y=1.0, post_h=1.35, gate_w=0.0):
    """A post-and-rail perimeter fence around a rectangle (visual only — the
    invisible wall that keeps players/balls in is enforced in code). `gate_w`
    leaves an opening in the middle of the SOUTH side for a gate."""
    hw, hd = w / 2.0, d / 2.0
    g = gate_w / 2.0
    # Top rails along each side (south is split around the gate opening).
    box(f"{name}_rail_n", cx, cz + hd, w, 0.22, 0.22, WOOD, y0=rail_y)
    box(f"{name}_rail_e", cx + hw, cz, 0.22, 0.22, d, WOOD, y0=rail_y)
    box(f"{name}_rail_w", cx - hw, cz, 0.22, 0.22, d, WOOD, y0=rail_y)
    if gate_w > 0.0:
        seg = hw - g
        box(f"{name}_rail_s_l", cx - (hw + g) / 2.0, cz - hd, seg, 0.22, 0.22, WOOD, y0=rail_y)
        box(f"{name}_rail_s_r", cx + (hw + g) / 2.0, cz - hd, seg, 0.22, 0.22, WOOD, y0=rail_y)
    else:
        box(f"{name}_rail_s", cx, cz - hd, w, 0.22, 0.22, WOOD, y0=rail_y)
    # Posts around the perimeter (skip south posts inside the gate gap).
    nx = max(2, int(round(w / post_step)))
    nz = max(2, int(round(d / post_step)))
    i = 0
    for k in range(nx + 1):
        x = cx - hw + w * k / nx
        box(f"{name}_post_{i}", x, cz + hd, 0.3, post_h, 0.3, WOOD); i += 1
        if abs(x - cx) > g + 0.4:
            box(f"{name}_post_{i}", x, cz - hd, 0.3, post_h, 0.3, WOOD); i += 1
    for k in range(1, nz):
        z = cz - hd + d * k / nz
        box(f"{name}_post_{i}", cx + hw, z, 0.3, post_h, 0.3, WOOD); i += 1
        box(f"{name}_post_{i}", cx - hw, z, 0.3, post_h, 0.3, WOOD); i += 1


def arena(name, cx, cz, w, d):
    """A spacious, enclosed dodgeball arena on the grass: a coloured-grass
    enclosure pad, a sand court in the middle, a perimeter fence, and a spectator
    bench on each sideline for eliminated players. The court floor keeps the name
    `{name}_ground` so the runtime reads the play bounds from it."""
    pad_w, pad_d = w + 14, d + 14
    # Enclosure: a different-green grass pad framing the court (walkable — the
    # sidelines/benches sit on it). Raised a hair above the surrounding grass.
    quad_y(f"{name}_enclosure_ground", cx - pad_w / 2, cx + pad_w / 2,
           cz - pad_d / 2, cz + pad_d / 2, 0.05, GRASS2)
    # The sand court + centre line.
    quad_y(f"{name}_ground", cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2, 0.12, SAND)
    box(f"{name}_line", cx, cz, w, 0.06, 0.4, FOAM, y0=0.13)
    # Perimeter fence around the enclosure, with a gated opening on the south
    # side (facing the camp) — a smaller sibling of the front torii gate.
    fence_d = pad_d - 1.0
    fence_rect(f"{name}_fence", cx, cz, pad_w - 1.0, fence_d, gate_w=6.0)
    torii(f"{name}_gate", cx, cz - fence_d / 2.0, 4.0, 3.5)
    # A spectator bench on each sideline (E/W), just outside the court, inside
    # the fence — where out players sit while the game plays out.
    seat_len = d * 0.6
    bench_log(f"{name}_bench_w", cx - w / 2 - 2.2, cz, seat_len, axis='z')
    bench_log(f"{name}_bench_e", cx + w / 2 + 2.2, cz, seat_len, axis='z')


def mountain(name, cx, cz, base, h):
    cone(f"{name}_rock", cx, cz, base / 2, h, ROCK, n=22)
    cone(f"{name}_snow", cx, cz, base * 0.24, h * 0.42, SNOW, y0=h * 0.58, n=22)


def bench_log(name, cx, cz, length, axis='x'):
    if axis == 'x':
        box(name, cx, cz, length, 0.45, 0.55, WOOD, y0=0.2)
    else:
        box(name, cx, cz, 0.55, 0.45, length, WOOD, y0=0.2)


def flower(name, cx, cz, col, base_y=0.0):
    box(name, cx, cz, 0.4, 0.5, 0.4, col, y0=base_y)


def tent(name, cx, cz, w, h, length, mat):
    z0, z1 = cz - length / 2, cz + length / 2
    x0, x1, xa = cx - w / 2, cx + w / 2, cx
    v = [(x0, 0, z0), (x1, 0, z0), (xa, h, z0),
         (x0, 0, z1), (x1, 0, z1), (xa, h, z1)]
    f = [(0, 2, 1), (3, 4, 5), (0, 3, 5, 2), (2, 5, 4, 1), (0, 1, 4, 3)]
    return make_mesh(name, v, f, mat)


# ---- palette -------------------------------------------------------------
bpy.ops.wm.read_factory_settings(use_empty=True)
# Brighter, more saturated pastel clay palette (toy / popmart vibe).
GRASS = make_mat("clay_grass", (0.44, 0.82, 0.37))  # vibrant fresh green
GRASS2 = make_mat("clay_grass2", (0.34, 0.60, 0.34))  # deeper meadow green: arena enclosure
DIRT  = make_mat("clay_dirt",  (0.76, 0.57, 0.40))  # earthier, less yellow
WOOD  = make_mat("clay_wood",  (0.68, 0.47, 0.31))
ROOF  = make_mat("clay_roof_blue", (0.26, 0.60, 0.92))  # vibrant blue
STONE = make_mat("clay_stone", (0.70, 0.72, 0.76))
ROCK  = make_mat("clay_rock",  (0.73, 0.77, 0.84))  # light cool grey-blue: distant-peak look
SNOW  = make_mat("clay_snow",  (0.98, 0.99, 1.00))
SAND  = make_mat("clay_sand",  (0.90, 0.83, 0.62))  # less yellow
STRAW = make_mat("clay_straw", (0.88, 0.75, 0.50))
FLAME = make_mat("clay_flame", (1.00, 0.60, 0.22))
WATER = make_mat("clay_water", (0.26, 0.70, 0.96))  # vibrant blue
DEEPW = make_mat("clay_deepwater", (0.05, 0.19, 0.27))  # dark basin bed/banks (seen as depth)
FOAM  = make_mat("clay_foam",  (0.95, 0.98, 1.00))
TENT_A = make_mat("clay_tent_sand", (0.90, 0.80, 0.56))
TENT_B = make_mat("clay_tent_red", (0.94, 0.40, 0.40))
RED   = make_mat("clay_red",   (0.93, 0.30, 0.28))
LILY  = make_mat("clay_lily",  (0.40, 0.78, 0.44))
PINK  = make_mat("clay_pink",  (0.98, 0.64, 0.76))
YELL  = make_mat("clay_yellow", (1.00, 0.85, 0.30))
TREE  = make_mat("clay_tree",  (0.37, 0.74, 0.36))  # vibrant tree green
CHERRY = make_mat("clay_cherry", (0.98, 0.66, 0.80))

# ---- ground --------------------------------------------------------------
v = [(-HX, 0, 0), (HX, 0, 0), (HX, 0, DZ), (-HX, 0, DZ),
     (-HX, -THICK, 0), (HX, -THICK, 0), (HX, -THICK, DZ), (-HX, -THICK, DZ)]
f = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 3, 7, 4),
     (1, 5, 6, 2), (0, 4, 5, 1), (3, 2, 6, 7)]
Camp_ground = make_mesh("Camp_ground", v, f, GRASS)

# ---- Valley floor BENEATH the plateau ------------------------------------
# The camp is a raised plateau (its sides drop to y=-THICK). This big low slab
# is the land at the base of the cliffs — so nothing floats, falls are caught,
# and the plateau reads as sitting on real ground.
BASE_Y = -THICK
vb0, vb1, vbz0, vbz1 = -175.0, 175.0, -75.0, 220.0
vb = [(vb0, BASE_Y, vbz0), (vb1, BASE_Y, vbz0), (vb1, BASE_Y, vbz1), (vb0, BASE_Y, vbz1),
      (vb0, BASE_Y - 6, vbz0), (vb1, BASE_Y - 6, vbz0),
      (vb1, BASE_Y - 6, vbz1), (vb0, BASE_Y - 6, vbz1)]
fb = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 3, 7, 4),
      (1, 5, 6, 2), (0, 4, 5, 1), (3, 2, 6, 7)]
make_mesh("Base_ground", vb, fb, GRASS)

# ---- paths (dirt network) ------------------------------------------------
quad_y("Camp_path_spine", -4, 4, 8, DZ, 0.03, DIRT)
quad_y("Camp_path_plaza", -13, 13, 8, 24, 0.03, DIRT)
strip_seg("Camp_path_hub", 0, 48, -30, 60, 6, 0.03, DIRT)
strip_seg("Camp_path_lake", 0, 26, -26, 28, 6, 0.03, DIRT)
strip_seg("Camp_path_camp", 0, 50, 8, 50, 7, 0.03, DIRT)
strip_seg("Camp_path_cabins", 4, 64, 46, 66, 6, 0.03, DIRT)
strip_seg("Camp_path_dodge", 0, 60, -34, 80, 5, 0.03, DIRT)  # spur out to the grass arena
strip_seg("Camp_path_sumo", 4, 86, 20, 92, 5, 0.03, DIRT)

# ---- Camp Entrance (S) ---------------------------------------------------
torii("prop_entrance_gate", 0, 7, 6, 5.0)
box("prop_fence_l1", -9, 7, 5, 1.2, 0.4, WOOD, y0=0.3)
box("prop_fence_r1", 9, 7, 5, 1.2, 0.4, WOOD, y0=0.3)

# ---- Chonk Lake + dock (SW) ---------------------------------------------
# Recessed lake: a real bowl cut into the plateau (see carve_water).
carve_water("water_lake", blob_poly(-40, 26, 16, n=18, jitter=0.28, seed=7),
            Camp_ground, surface_y=-0.3, depth=3.0, bank=4.0)
dock("prop_dock", -25, 30, 8)
disc("prop_lily_pad", -44, 22, 2.0, 0.08, LILY, clay=False)
flower("prop_lily_flower", -44, 22, PINK)

# ---- Camp Hub building (W) ----------------------------------------------
cabin("prop_hub", -32, 60, 11, 9, 5.0)
box("prop_hub_lantern", -24, 58, 1.0, 2.4, 1.0, WOOD)
box("prop_hub_sign", -22, 52, 2.2, 0.9, 0.3, WOOD, y0=1.6)
box("prop_hub_sign_post", -22, 52, 0.3, 1.7, 0.3, WOOD)

# ---- Forest Trail marker (W edge) ---------------------------------------
strip_seg("Camp_path_forest", -30, 60, -56, 58, 5, 0.03, DIRT)
box("prop_forest_sign", -54, 56, 2.4, 0.9, 0.3, WOOD, y0=1.7)
box("prop_forest_sign_post", -54, 56, 0.3, 1.8, 0.3, WOOD)

# ---- Campsite (centre): tents + campfire + benches ----------------------
tent("prop_tent_1", 1, 45, 5, 3.2, 6, TENT_A)
tent("prop_tent_2", 12, 50, 5, 3.2, 6, TENT_A)
FCX, FCZ = 6, 40
disc("prop_fire_pad", FCX, FCZ, 2.6, 0.04, DIRT, clay=False)
for i in range(7):
    a = i * 2 * math.pi / 7
    box(f"prop_fire_stone_{i}", FCX + math.cos(a) * 1.7, FCZ + math.sin(a) * 1.7,
        0.6, 0.4, 0.6, STONE)
cone("prop_fire_flame", FCX, FCZ, 0.55, 1.4, FLAME, y0=0.2, n=12)
bench_log("prop_bench_1", FCX, FCZ - 3.4, 4.2, axis='x')
bench_log("prop_bench_2", FCX - 3.4, FCZ, 4.2, axis='z')

# ---- Cabins (E) ----------------------------------------------------------
cabin("prop_cabin_1", 46, 70, 8, 7, 4.2)
cabin("prop_cabin_2", 52, 54, 8, 7, 4.2)

# ---- Dodgeball arena (grassy NW clearing, off the path) + Sumo ring (N) --
# Spacious, fenced, enclosed with deeper-green grass + sideline benches.
arena("zone_dodge", -38, 97, 26, 22)
# Arena footprint (enclosure = court + 14) — scatter props are kept out of it so
# the court stays clear and spacious.
ADX, ADZ, ADW, ADD = -38, 97, 40, 36
def in_arena(x, z, m=2.5):
    return (ADX - ADW / 2 - m) <= x <= (ADX + ADW / 2 + m) and \
           (ADZ - ADD / 2 - m) <= z <= (ADZ + ADD / 2 + m)
sumo_ring("zone_sumo", 20, 92, 9)          # 1.5x
box("prop_sumo_banner_l", 9, 92, 0.3, 3.0, 1.6, RED, y0=0.0)   # moved out to clear the bigger ring
box("prop_sumo_banner_r", 31, 92, 0.3, 3.0, 1.6, ROOF, y0=0.0)

# ---- Waterfall (NE) + River winding S -----------------------------------
box("prop_rock_ledge", 48, 112, 20, 6.0, 12, ROCK)
box("prop_rock_step", 48, 105, 10, 2.4, 3, ROCK)
quad_vertical("water_fall", 45, 51, 0.3, 6.0, 105.8, WATER)
quad_vertical("water_fall_foam", 44.8, 51.2, 0.3, 1.6, 105.7, FOAM)
# Recessed waterfall catch-pool.
carve_water("water_pool", disc_poly(48, 100, 8.0, n=22),
            Camp_ground, surface_y=-0.25, depth=2.4, bank=2.6)
disc("water_pool_foam", 48, 103, 3.0, -0.12, FOAM)
# Recessed river channel as ONE continuous trench (no per-segment seams at the
# bends), and the same cut is taken out of every dirt path that crosses it so no
# path floats over the lowered water — the plank bridges carry the crossings.
riverpts = [(48, 100), (36, 78), (24, 54), (14, 30), (6, 4)]
river_paths = [o for o in bpy.data.objects if o.name.startswith("Camp_path")]
carve_river_corridor("river", riverpts, Camp_ground, river_paths,
                     half_w=2.9, depth=1.7, bank=1.4)
# Water surface stays as one 4-vertex quad per segment — the log course reads
# these (water_river_N) to build its path, and water.ts animates them.
for i in range(len(riverpts) - 1):
    (x0, z0), (x1, z1) = riverpts[i], riverpts[i + 1]
    strip_seg(f"water_river_{i}", x0, z0, x1, z1, 5.0, -0.2, WATER)

# bridges where paths cross the river
def bridge(name, cx, cz, span, along='x'):
    if along == 'x':
        box(f"{name}_deck", cx, cz, span, 0.4, 6, WOOD, y0=0.2)
        box(f"{name}_rail_a", cx, cz - 3, span, 1.0, 0.3, WOOD, y0=0.5)
        box(f"{name}_rail_b", cx, cz + 3, span, 1.0, 0.3, WOOD, y0=0.5)
    else:
        box(f"{name}_deck", cx, cz, 6, 0.4, span, WOOD, y0=0.2)
        box(f"{name}_rail_a", cx - 3, cz, 0.3, 1.0, span, WOOD, y0=0.5)
        box(f"{name}_rail_b", cx + 3, cz, 0.3, 1.0, span, WOOD, y0=0.5)
bridge("prop_bridge_cabins", 28, 66, 10, along='x')
bridge("prop_bridge_south", 9, 16, 10, along='x')

# ---- Mountains backdrop (far N) -----------------------------------------
# ── One large mountain massif in the distance (dead North) ────────────────
# A dominant central peak with lower merged shoulders so the backdrop reads as
# a single big mountain, not a field of same-size cones.
def _peak(name, cx, cz, r, h, y0=0.0, snow=True, mat=None):
    cone(f"{name}_rock", cx, cz, r, h, mat or ROCK, y0=y0, n=26)
    if snow:
        cone(f"{name}_snow", cx, cz, r * 0.34, h * 0.42, SNOW, y0=y0 + h * 0.6, n=26)

MCX, MCZ = 0, 285
_peak("prop_mtn_main", MCX, MCZ, 96, 78)               # the dominant peak (broad, gentle)
_peak("prop_mtn_sh_l", MCX - 74, MCZ + 12, 54, 50)     # merged snowy shoulders
_peak("prop_mtn_sh_r", MCX + 80, MCZ + 10, 58, 56)
_peak("prop_mtn_ft_l", MCX - 34, MCZ - 30, 34, 42, snow=False, mat=GRASS)  # green foothills
_peak("prop_mtn_ft_r", MCX + 38, MCZ - 26, 36, 44, snow=False, mat=GRASS)

# (Removed the scattered ridge ring — it cluttered the valley around the beach.
#  The single massif backdrop far to the north is enough.)

# ---- scattered boulders + flowers (life, no trees) ----------------------
for i, (bx, bz, s) in enumerate([(-52, 40, 4), (40, 30, 3.4), (-14, 74, 3),
                                 (34, 100, 3.2), (-46, 92, 3.6)]):
    if in_arena(bx, bz):
        continue
    box(f"prop_boulder_{i}", bx, bz, s, s * 0.7, s * 0.85, ROCK)
import random
rf = random.Random(3)
for i in range(24):
    fx = rf.uniform(-HX + 6, HX - 6)
    fz = rf.uniform(6, DZ - 8)
    if in_arena(fx, fz):
        continue
    col = rf.choice([YELL, PINK, FOAM])
    flower(f"prop_flower_{i}", fx, fz, col)

# ---- BIG obvious waterfall pouring off the WEST plateau cliff ------------
WFX, WFZ, WFW = -HX, 58.0, 30.0     # west edge, centre z (north, clear of the ramp), WIDE sheet
wz0, wz1 = WFZ - WFW / 2, WFZ + WFW / 2
# clay rock cliff face over the plateau's west edge (grass -> sculpted rock),
# with a recessed spillway notch the water pours through.
box("prop_wfcliff", WFX - 0.6, WFZ, 2.6, THICK + 2.0, WFW + 20, ROCK, y0=BASE_Y)
box("prop_wfcliff_lipL", WFX + 1.4, wz0 - 3.5, 6.0, 3.0, 7.0, ROCK, y0=0.0)  # spillway shoulders
box("prop_wfcliff_lipR", WFX + 1.4, wz1 + 3.5, 6.0, 3.0, 7.0, ROCK, y0=0.0)
_wf = random.Random(77)
for i in range(34):
    hy = _wf.uniform(BASE_Y + 1.5, -1.0)
    hz = WFZ + _wf.uniform(-WFW / 2 - 6, WFW / 2 + 6)
    hr = _wf.uniform(1.2, 3.2)
    box(f"prop_wfcliff_hold{i}", WFX - 1.8 - _wf.uniform(0, 0.8), hz,
        _wf.uniform(1.0, 2.0), hr, hr, ROCK, y0=hy)
# water: a wide feeder pool on top spilling over, the big sheet, splash + mist
quad_y("water_wf_top", WFX + 0.3, WFX + 16, wz0, wz1, 0.06, WATER)
_xs = WFX - 2.0
# THICK slab: piles at the lip, rolls OVER the edge, bulges out and gathers
# volume as it plunges, flaring wider into the pool. (y is world height; the
# feeder pool sits at ~y0 on the plateau, the splash pool at BASE_Y+0.8.)
_wf_out = [(-1.0, 0.4), (1.6, 1.5), (4.6, 1.0), (5.1, -3.0),
           (5.4, -13.0), (5.8, -22.0), (6.4, -27.5), (7.0, BASE_Y + 0.8)]
_wf_th  = [0.9, 1.6, 2.4, 2.8, 3.2, 3.4, 3.8, 4.2]
over_edge_waterfall("water_wf_sheet", WFX, wz0, wz1, WATER, _wf_out, _wf_th, flare=4.5)
# foam crest riding the rounded lip where it pours over the edge
_crest = [(WFX - 4.2, 1.0, wz0 - 1.2), (WFX - 4.2, 1.0, wz1 + 1.2),
          (WFX - 5.0, 2.0, wz1 + 1.2), (WFX - 5.0, 2.0, wz0 - 1.2)]
make_mesh("water_wf_crest", _crest, [(0, 1, 2, 3)], FOAM, clay=False)
disc("water_wf_pool", WFX - 18, WFZ, 28.0, BASE_Y + 0.3, WATER, n=28)
disc("water_wf_poolfoam", WFX - 18, WFZ, 11.0, BASE_Y + 0.4, FOAM)
for i in range(6):
    a = i * math.pi / 3.0
    sphere(f"water_wf_mist{i}", WFX - 3 + math.cos(a) * 4, BASE_Y + 2.0,
           WFZ + math.sin(a) * (WFW * 0.4), 2.4, FOAM)

# ---- Path down the cliff from the front of camp to a beach at the base ---
def solid_ramp(name, ax, ay, az, bx, by, bz, width, floor_y, mat):
    """A SOLID ramp/embankment: sloped walkable top filled down to the floor, so
    it reads as a built earthen ramp rather than a thin floating slab."""
    dx, dz = bx - ax, bz - az
    L = math.hypot(dx, dz) or 1.0
    px, pz = -dz / L * width / 2, dx / L * width / 2
    v = [(ax + px, ay, az + pz), (ax - px, ay, az - pz),
         (bx - px, by, bz - pz), (bx + px, by, bz + pz),
         (ax + px, floor_y, az + pz), (ax - px, floor_y, az - pz),
         (bx - px, floor_y, bz - pz), (bx + px, floor_y, bz + pz)]
    f = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1),
         (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
    return make_mesh(name, v, f, mat, clay=False)

def thin_ramp(name, ax, ay, az, bx, by, bz, width, mat, thick=0.5):
    """A thin sloped slab (a dirt path laid over the grassy hillside)."""
    dx, dz = bx - ax, bz - az
    L = math.hypot(dx, dz) or 1.0
    px, pz = -dz / L * width / 2, dx / L * width / 2
    v = [(ax + px, ay, az + pz), (ax - px, ay, az - pz),
         (bx - px, by, bz - pz), (bx + px, by, bz + pz),
         (ax + px, ay - thick, az + pz), (ax - px, ay - thick, az - pz),
         (bx - px, by - thick, bz - pz), (bx + px, by - thick, bz + pz)]
    f = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1),
         (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
    return make_mesh(name, v, f, mat, clay=False)

# The descent is a wide GRASSY HILLSIDE (blends with the terrain, not a brown
# fin), with a dirt path worn down it. It lands on the beach sand at the corner.
# A flat LANDING at plateau height sits between the end of the road and the
# ramp crest (the road used to overhang the cliff, and the ramp fell away right
# at the edge). Mirrored at load time by src/terrain-fixes.ts until re-baked.
RAMP_CREST_X = 8
strip_seg("Camp_path_tobeach", -2, 12, 18, 2, 9, 0.04, DIRT)
box("Camp_ground_ramplanding", (RAMP_CREST_X + 21) / 2, -5.5, 21 - RAMP_CREST_X, -BASE_Y, 11, GRASS,
    y0=BASE_Y, clay=False)
quad_y("Camp_path_ramplanding", RAMP_CREST_X, 19.5, -5, 3, 0.025, DIRT)
solid_ramp("Camp_ground_swhill", RAMP_CREST_X, 0.0, -1, -56, BASE_Y + 0.1, -1, 20, BASE_Y, GRASS)
thin_ramp("Camp_path_swhill", RAMP_CREST_X, 0.045, -1, -56, BASE_Y + 0.26, -1, 8, DIRT)
# Grassy banks on the OUTER edge of the ramp (following its height) so the bare
# vertical wedge face is hidden — reads as a path cut into a grassy hillside.
for i in range(6):
    t = i / 5.0
    hx = 18 + (-74) * t
    htop = -30 * t                      # ramp top height at this x
    cone(f"Bound_ramphill_cliff_{i}", hx, -16, 14,
         (htop - BASE_Y) + 6, GRASS, y0=BASE_Y - 2, n=14)

# ---- BIG beach: sand landing that wraps around to the waterfall pool ------
BCX, BCZ, BR = -72, 26, 78
disc("Beach_ground", BCX, BCZ, BR, BASE_Y + 0.05, SAND, n=36)
_bch = random.Random(91)
tree("prop_beach_tree1", -64, -6, 5.4, 3.2, TREE, base_y=BASE_Y)
tree("prop_beach_tree2", -104, 44, 4.6, 2.8, CHERRY, base_y=BASE_Y)
tree("prop_beach_tree3", -58, 92, 4.8, 2.8, TREE, base_y=BASE_Y)
for i in range(8):
    a = i * 2 * math.pi / 8 + 0.4
    box(f"prop_beach_rock{i}", BCX + math.cos(a) * (BR - 10), BCZ + math.sin(a) * (BR - 12),
        _bch.uniform(1.6, 3.4), _bch.uniform(1.2, 2.6), _bch.uniform(1.6, 3.4), ROCK, y0=BASE_Y)

# ---- Grassy hills walling off the FAR side (keep players by the beach) ----
# Steep grassy cones on the west arc (plateau is to the east); named *_cliff so
# the step-collision keeps the frog in, GRASS so they read as natural hills.
_bh = random.Random(41)
for i in range(9):
    a = math.radians(110 + i * (190 / 8))   # NW -> W -> SW -> S (away from the plateau)
    hx = BCX + math.cos(a) * (BR + 2)
    hz = BCZ + math.sin(a) * (BR + 2)
    cone(f"Bound_hill_cliff_{i}", hx, hz, _bh.uniform(13, 18),
         _bh.uniform(30, 42), GRASS, y0=BASE_Y - 2, n=16)

# ---- rounded accent trees (a few for vibe — NOT the dense forest) --------
_tr = random.Random(21)
tree_spots = [(-46, 44), (-52, 68), (-8, 72), (34, 86), (50, 34), (40, 58),
              (-40, 100), (24, 108), (-18, 30), (44, 96), (-30, 84), (56, 78),
              (-56, 30), (8, 100)]
for i, (tx, tz) in enumerate(tree_spots):
    if in_arena(tx, tz):
        continue
    m = CHERRY if i % 4 == 0 else TREE
    tree(f"prop_tree_{i}", tx, tz, _tr.uniform(3.5, 6.0), _tr.uniform(2.2, 3.4), m)

# ---- puffy clouds (soft studio-toy vibe, high above) ---------------------
cloud("prop_cloud_1", -20, 55, 40, 1.4)
cloud("prop_cloud_2", 30, 62, 82, 1.6)
cloud("prop_cloud_3", 62, 50, 28, 1.2)
cloud("prop_cloud_4", -52, 58, 104, 1.5)
cloud("prop_cloud_5", 10, 70, 132, 1.7)
cloud("prop_cloud_6", -34, 52, 8, 1.3)

# ---- markers -------------------------------------------------------------
add_marker("spawn", (0.0, 0.0, 14.0), 0.0)
add_marker("gate_gameplay", (0.0, 0.0, DZ), 0.0)
add_marker("socket_out", (0.0, 0.0, DZ), 0.0)

bpy.ops.object.select_all(action='SELECT')
# Keep the boolean cutters in the scene (the modifiers still reference them at
# export/apply time) but exclude them from the exported selection.
for c in _cutters:
    c.select_set(False)
bpy.ops.export_scene.gltf(
    filepath=os.path.join(OUT_DIR, "camp_base.glb"),
    export_format='GLB', use_selection=True, export_apply=True,
    export_yup=False,
)
print("CAMP_DONE")
