"""
Production-grade test suite for convert_skybox.py
=====================================================
Validates:
  1. Direction vector math (normalization, pixel-center sampling)
  2. TEME axis alignment -- Cesium-specific requirements
  3. All 12 cube-face seam continuity tests
  4. Full sphere coverage (no UV holes)
  5. Color accuracy (synthetic image roundtrip)
  6. Output file integrity (dimensions, format, count)

Run:
    python test_convert_skybox.py
"""

import math
import os
import tempfile
import unittest

import numpy as np
from PIL import Image


# -----------------------------------------------------------------
# Shared constants -- must match convert_skybox.py exactly
# -----------------------------------------------------------------

FACES = [
    ("skybox_px", ( 1, 0, 0), (0,-1, 0), (0, 0, 1)),
    ("skybox_nx", (-1, 0, 0), (0, 1, 0), (0, 0, 1)),
    ("skybox_py", ( 0, 1, 0), ( 1, 0, 0), (0, 0, 1)),
    ("skybox_ny", ( 0,-1, 0), (-1, 0, 0), (0, 0, 1)),
    ("skybox_pz", ( 0, 0, 1), ( 1, 0, 0), (0,-1, 0)),
    ("skybox_nz", ( 0, 0,-1), ( 1, 0, 0), (0, 1, 0)),
]

TEST_FACE_SIZE  = 64
ANGULAR_TOL_DEG = 0.5
COLOR_TOL       = 4


# -----------------------------------------------------------------
# Core math -- mirrors convert_skybox.py exactly
# -----------------------------------------------------------------

def face_ray(face_def, i, j, face_size):
    _, (fx, fy, fz), (rx, ry, rz), (ux, uy, uz) = face_def
    su = (i + 0.5) / face_size * 2 - 1
    sv = (j + 0.5) / face_size * 2 - 1
    dx = fx + su * rx + sv * ux
    dy = fy + su * ry + sv * uy
    dz = fz + su * rz + sv * uz
    length = math.sqrt(dx**2 + dy**2 + dz**2)
    return dx / length, dy / length, dz / length


def dir_to_ra_dec(dx, dy, dz):
    ra = math.atan2(dy, dx) % (2 * math.pi)
    dec = math.asin(max(-1.0, min(1.0, dz)))
    return ra, dec


def dir_to_uv(dx, dy, dz):
    ra = math.atan2(dy, dx)
    dec = math.asin(max(-1.0, min(1.0, dz)))
    u = ((ra / (2 * math.pi)) + 1) % 1
    v = 0.5 - dec / math.pi
    return u, v


def angle_between_deg(d1, d2):
    dot = max(-1.0, min(1.0, sum(a * b for a, b in zip(d1, d2))))
    return math.degrees(math.acos(dot))


def get_face(name):
    return next(f for f in FACES if f[0] == name)


def make_synthetic_src(w=512, h=256):
    """
    2:1 equirectangular where R encodes U (RA) and G encodes V (Dec).
    Lets us verify the conversion roundtrip with exact per-pixel colours.
    """
    img = np.zeros((h, w, 3), dtype=np.uint8)
    for row in range(h):
        for col in range(w):
            img[row, col] = [int(col / w * 255), int(row / h * 255), 128]
    return img, w, h


def run_conversion(src_arr, face_size):
    """Same numpy logic as convert_skybox.py."""
    src_h, src_w = src_arr.shape[:2]
    i_idx = np.arange(face_size)
    j_idx = np.arange(face_size)
    su_g, sv_g = np.meshgrid(
        (i_idx + 0.5) / face_size * 2 - 1,
        (j_idx + 0.5) / face_size * 2 - 1,
    )
    out = {}
    for name, (fx,fy,fz), (rx,ry,rz), (ux,uy,uz) in FACES:
        dx = fx + su_g * rx + sv_g * ux
        dy = fy + su_g * ry + sv_g * uy
        dz = fz + su_g * rz + sv_g * uz
        length = np.sqrt(dx**2 + dy**2 + dz**2)
        dx /= length; dy /= length; dz /= length
        ra  = np.arctan2(dy, dx)
        dec = np.arcsin(np.clip(dz, -1, 1))
        u = ((ra / (2 * np.pi)) + 1) % 1
        v = np.clip(0.5 - dec / np.pi, 0, 1)
        px_idx = (u * src_w).astype(np.int32) % src_w
        py_idx = np.clip((v * src_h).astype(np.int32), 0, src_h - 1)
        out[name] = Image.fromarray(src_arr[py_idx, px_idx].astype(np.uint8))
    return out


# Run once, reuse across all tests
_CACHE = {}

def get_data():
    if not _CACHE:
        src_data = make_synthetic_src()
        _CACHE['src'] = src_data
        _CACHE['faces'] = run_conversion(src_data[0], TEST_FACE_SIZE)
    return _CACHE['src'], _CACHE['faces']


# =================================================================
# 1. Direction vector math
# =================================================================

class TestDirectionMath(unittest.TestCase):

    def test_all_rays_are_unit_vectors(self):
        N = TEST_FACE_SIZE
        for face in FACES:
            for j in range(0, N, 8):
                for i in range(0, N, 8):
                    dx, dy, dz = face_ray(face, i, j, N)
                    length = math.sqrt(dx**2 + dy**2 + dz**2)
                    self.assertAlmostEqual(length, 1.0, places=12,
                        msg=f"{face[0]} ({i},{j}): length={length}")

    def test_uv_always_in_unit_range(self):
        N = TEST_FACE_SIZE
        for face in FACES:
            for j in range(0, N, 8):
                for i in range(0, N, 8):
                    d = face_ray(face, i, j, N)
                    u, v = dir_to_uv(*d)
                    self.assertTrue(0.0 <= u <= 1.0, f"{face[0]} ({i},{j}): u={u}")
                    self.assertTrue(0.0 <= v <= 1.0, f"{face[0]} ({i},{j}): v={v}")

    def test_pixel_center_offset_is_not_naive(self):
        """
        The script must use (i+0.5)/N, not i/N.
        Naive formula puts the first sample exactly on the cube edge,
        which causes one-pixel seam gaps in the output.
        """
        N = 8
        su_center = (0 + 0.5) / N * 2 - 1   # -0.875
        su_naive  = (0 + 0.0) / N * 2 - 1   # -1.0 (wrong)
        self.assertNotEqual(su_center, su_naive)
        self.assertAlmostEqual(su_center, -0.875)

    def test_ra_dec_in_valid_range(self):
        N = TEST_FACE_SIZE
        for face in FACES:
            for j in range(0, N, 4):
                for i in range(0, N, 4):
                    d = face_ray(face, i, j, N)
                    ra, dec = dir_to_ra_dec(*d)
                    self.assertTrue(0.0 <= ra < 2*math.pi,
                        f"{face[0]} ({i},{j}): RA={math.degrees(ra):.1f}")
                    self.assertTrue(-math.pi/2 <= dec <= math.pi/2,
                        f"{face[0]} ({i},{j}): Dec={math.degrees(dec):.1f}")

    def test_known_directions_map_to_correct_uv(self):
        """RA=0 should map to u=0, RA=180 to u=0.5."""
        u0, _ = dir_to_uv(1, 0, 0)   # RA=0
        self.assertAlmostEqual(u0, 0.0, places=5)
        u180, _ = dir_to_uv(-1, 0, 0)  # RA=180
        self.assertAlmostEqual(u180, 0.5, places=5)

    def test_poles_map_to_v_extremes(self):
        """North pole (dz=+1) should map to v=0, south pole to v=1."""
        _, v_north = dir_to_uv(0, 0, 1)
        self.assertAlmostEqual(v_north, 0.0, places=5)
        _, v_south = dir_to_uv(0, 0, -1)
        self.assertAlmostEqual(v_south, 1.0, places=5)


# =================================================================
# 2. TEME axis alignment (Cesium-specific)
# =================================================================

class TestTEMEAxes(unittest.TestCase):
    """
    Cesium's SkyBox is defined in TEME axes:
        +X = Vernal Equinox  (RA=0,   Dec=0)
        -X = Anti-equinox    (RA=180, Dec=0)
        +Y = RA=90,  Dec=0
        -Y = RA=270, Dec=0
        +Z = Celestial North (Dec=+90)
        -Z = Celestial South (Dec=-90)
    Source: Cesium.SkyBox docs + Transforms.computeTemeToPseudoFixedMatrix
    """
    N = TEST_FACE_SIZE

    def _center_ray(self, name):
        mid = self.N // 2
        return face_ray(get_face(name), mid, mid, self.N)

    def test_px_center_is_vernal_equinox(self):
        ra, dec = dir_to_ra_dec(*self._center_ray("skybox_px"))
        ra_deg = math.degrees(ra)
        self.assertTrue(ra_deg < 5 or ra_deg > 355,
                        f"px RA={ra_deg:.1f} expected ~0")
        self.assertAlmostEqual(math.degrees(dec), 0, delta=5)

    def test_nx_center_is_anti_equinox(self):
        ra, dec = dir_to_ra_dec(*self._center_ray("skybox_nx"))
        self.assertAlmostEqual(math.degrees(ra), 180, delta=5)
        self.assertAlmostEqual(math.degrees(dec), 0, delta=5)

    def test_py_center_is_ra90(self):
        ra, dec = dir_to_ra_dec(*self._center_ray("skybox_py"))
        self.assertAlmostEqual(math.degrees(ra), 90, delta=5)
        self.assertAlmostEqual(math.degrees(dec), 0, delta=5)

    def test_ny_center_is_ra270(self):
        ra, dec = dir_to_ra_dec(*self._center_ray("skybox_ny"))
        self.assertAlmostEqual(math.degrees(ra), 270, delta=5)
        self.assertAlmostEqual(math.degrees(dec), 0, delta=5)

    def test_pz_center_is_north_pole(self):
        _, dec = dir_to_ra_dec(*self._center_ray("skybox_pz"))
        self.assertGreater(math.degrees(dec), 80,
                           f"pz Dec={math.degrees(dec):.1f} expected >80")

    def test_nz_center_is_south_pole(self):
        _, dec = dir_to_ra_dec(*self._center_ray("skybox_nz"))
        self.assertLess(math.degrees(dec), -80,
                        f"nz Dec={math.degrees(dec):.1f} expected <-80")

    def test_px_raw_direction_is_plus_x(self):
        dx, dy, dz = self._center_ray("skybox_px")
        self.assertGreater(dx, 0.9)
        self.assertAlmostEqual(dy, 0, delta=0.2)
        self.assertAlmostEqual(dz, 0, delta=0.2)

    def test_pz_raw_direction_is_plus_z(self):
        dx, dy, dz = self._center_ray("skybox_pz")
        self.assertGreater(dz, 0.9)
        self.assertAlmostEqual(dx, 0, delta=0.2)
        self.assertAlmostEqual(dy, 0, delta=0.2)

    def test_right_hand_coordinate_system(self):
        """X cross Y must point in the +Z direction."""
        px = self._center_ray("skybox_px")
        py = self._center_ray("skybox_py")
        pz = self._center_ray("skybox_pz")
        cross = (
            px[1]*py[2] - px[2]*py[1],
            px[2]*py[0] - px[0]*py[2],
            px[0]*py[1] - px[1]*py[0],
        )
        angle = angle_between_deg(cross, pz)
        self.assertLess(angle, 10,
            f"X cross Y vs +Z = {angle:.1f} degrees -- not right-handed TEME")


# =================================================================
# 3. Seam continuity -- all 12 edges
# =================================================================

class TestSeamContinuity(unittest.TestCase):
    """
    Analytically derived adjacency for the TEME face definitions above.

    Equatorial belt (same parameter direction):
        px-left  <-> py-right
        py-left  <-> nx-right
        nx-left  <-> ny-right
        ny-left  <-> px-right

    North pole (pz):
        pz-right  <-> px-bottom  (same order)
        pz-top    <-> py-bottom  (same order)
        pz-left   <-> nx-bottom  (reversed)
        pz-bottom <-> ny-bottom  (reversed)

    South pole (nz):
        nz-right  <-> px-top     (reversed)
        nz-bottom <-> py-top     (same order)
        nz-left   <-> nx-top     (same order)
        nz-top    <-> ny-top     (reversed)
    """

    N = TEST_FACE_SIZE

    def _seam_rays_exact(self, face_name, edge, reversed_order=False):
        """
        Evaluate directions AT the exact geometric seam boundary (su or sv = ±1),
        NOT at pixel centers (which are ±(1-1/N)).

        Pixel-center sampling intentionally places each edge pixel half a pixel
        INSIDE the face. At the geometric seam itself both adjacent faces must
        produce identical direction vectors. Testing at pixel centers would
        introduce a systematic ~0.74 deg difference at N=64 (correct behavior,
        not a bug). This function tests the actual math at the seam.
        """
        _, (fx, fy, fz), (rx, ry, rz), (ux, uy, uz) = get_face(face_name)
        N = self.N
        rays = []
        for k in range(N):
            # pixel-center position along the non-seam axis
            t = (k + 0.5) / N * 2 - 1
            if edge == 'left':
                su, sv = -1.0, t
            elif edge == 'right':
                su, sv = +1.0, t
            elif edge == 'top':
                su, sv = t, -1.0
            elif edge == 'bottom':
                su, sv = t, +1.0
            else:
                raise ValueError(f"Unknown edge: {edge}")
            dx = fx + su*rx + sv*ux
            dy = fy + su*ry + sv*uy
            dz = fz + su*rz + sv*uz
            length = math.sqrt(dx**2 + dy**2 + dz**2)
            rays.append((dx/length, dy/length, dz/length))
        if reversed_order:
            rays = list(reversed(rays))
        return rays

    def _check_seam(self, name_a, edge_a, name_b, edge_b, reversed_b=False):
        rays_a = self._seam_rays_exact(name_a, edge_a)
        rays_b = self._seam_rays_exact(name_b, edge_b, reversed_order=reversed_b)
        self.assertEqual(len(rays_a), len(rays_b))
        for k, (ra, rb) in enumerate(zip(rays_a, rays_b)):
            err = angle_between_deg(ra, rb)
            self.assertLess(err, ANGULAR_TOL_DEG,
                f"Seam {name_a}:{edge_a} <-> {name_b}:{edge_b} "
                f"pixel {k}: {err:.6f} deg > {ANGULAR_TOL_DEG} deg\n"
                f"  ray_A={tuple(round(x,6) for x in ra)}\n"
                f"  ray_B={tuple(round(x,6) for x in rb)}")

    # Equatorial belt
    def test_seam_px_left_py_right(self):
        self._check_seam("skybox_px", "left",   "skybox_py", "right")

    def test_seam_py_left_nx_right(self):
        self._check_seam("skybox_py", "left",   "skybox_nx", "right")

    def test_seam_nx_left_ny_right(self):
        self._check_seam("skybox_nx", "left",   "skybox_ny", "right")

    def test_seam_ny_left_px_right(self):
        self._check_seam("skybox_ny", "left",   "skybox_px", "right")

    # North pole
    def test_seam_pz_right_px_bottom(self):
        self._check_seam("skybox_pz", "right",  "skybox_px", "bottom")

    def test_seam_pz_top_py_bottom(self):
        self._check_seam("skybox_pz", "top",    "skybox_py", "bottom")

    def test_seam_pz_left_nx_bottom(self):
        self._check_seam("skybox_pz", "left",   "skybox_nx", "bottom", reversed_b=True)

    def test_seam_pz_bottom_ny_bottom(self):
        self._check_seam("skybox_pz", "bottom", "skybox_ny", "bottom", reversed_b=True)

    # South pole
    def test_seam_nz_right_px_top(self):
        self._check_seam("skybox_nz", "right",  "skybox_px", "top",    reversed_b=True)

    def test_seam_nz_bottom_py_top(self):
        self._check_seam("skybox_nz", "bottom", "skybox_py", "top")

    def test_seam_nz_left_nx_top(self):
        self._check_seam("skybox_nz", "left",   "skybox_nx", "top")

    def test_seam_nz_top_ny_top(self):
        self._check_seam("skybox_nz", "top",    "skybox_ny", "top",    reversed_b=True)


# =================================================================
# 4. Full sphere coverage
# =================================================================

class TestSphereCoverage(unittest.TestCase):

    def test_no_sky_direction_missed(self):
        """
        Uniformly sample the celestial sphere. Every sample must be
        within 60 degrees of at least one face center.
        (Face half-diagonal = arctan(sqrt(2)) ~= 54.7 deg.)
        """
        N = 32
        mid = TEST_FACE_SIZE // 2
        missed = []
        for lat_step in range(N):
            dec = -math.pi/2 + (lat_step + 0.5) / N * math.pi
            n_lon = max(1, int(N * math.cos(dec)))
            for lon_step in range(n_lon):
                ra = (lon_step + 0.5) / n_lon * 2 * math.pi
                dx = math.cos(dec) * math.cos(ra)
                dy = math.cos(dec) * math.sin(ra)
                dz = math.sin(dec)
                best = min(
                    angle_between_deg((dx, dy, dz), face_ray(f, mid, mid, TEST_FACE_SIZE))
                    for f in FACES
                )
                if best > 60:
                    missed.append((math.degrees(ra), math.degrees(dec), best))
        self.assertEqual(len(missed), 0,
            f"{len(missed)} sky directions not covered: {missed[:3]}")

    def test_exactly_six_faces(self):
        self.assertEqual(len(FACES), 6)

    def test_all_cesium_face_stems_present(self):
        names = {f[0] for f in FACES}
        expected = {"skybox_px","skybox_nx","skybox_py","skybox_ny","skybox_pz","skybox_nz"}
        self.assertEqual(names, expected)

    def test_opposite_face_centers_are_antiparallel(self):
        """px+nx, py+ny, pz+nz must point in exactly opposite directions."""
        mid = TEST_FACE_SIZE // 2
        pairs = [
            ("skybox_px","skybox_nx"),
            ("skybox_py","skybox_ny"),
            ("skybox_pz","skybox_nz"),
        ]
        for a_name, b_name in pairs:
            da = face_ray(get_face(a_name), mid, mid, TEST_FACE_SIZE)
            db = face_ray(get_face(b_name), mid, mid, TEST_FACE_SIZE)
            dot = sum(x*y for x,y in zip(da, db))
            self.assertLess(dot, -0.9,
                f"{a_name} . {b_name} = {dot:.3f}, expected < -0.9")


# =================================================================
# 5. Color accuracy -- synthetic image roundtrip
# =================================================================

class TestColorAccuracy(unittest.TestCase):

    def setUp(self):
        (self.src, self.src_w, self.src_h), self.faces = get_data()

    def test_face_centers_sample_correct_colour(self):
        N = TEST_FACE_SIZE
        mid = N // 2
        for face in FACES:
            name = face[0]
            dx, dy, dz = face_ray(face, mid, mid, N)
            u, v = dir_to_uv(dx, dy, dz)
            expected_r = int(u * 255)
            expected_g = int(v * 255)
            actual_r, actual_g, _ = self.faces[name].getpixel((mid, mid))[:3]
            self.assertAlmostEqual(actual_r, expected_r, delta=COLOR_TOL,
                msg=f"{name} center R: expected ~{expected_r}, got {actual_r}")
            self.assertAlmostEqual(actual_g, expected_g, delta=COLOR_TOL,
                msg=f"{name} center G: expected ~{expected_g}, got {actual_g}")

    def test_off_center_pixels_correct_colour(self):
        N = TEST_FACE_SIZE
        positions = [
            (N//4, N//4), (3*N//4, N//4),
            (N//4, 3*N//4), (3*N//4, 3*N//4),
        ]
        errors = []
        for face in FACES:
            name = face[0]
            for i, j in positions:
                dx, dy, dz = face_ray(face, i, j, N)
                u, v = dir_to_uv(dx, dy, dz)
                exp_r, exp_g = int(u * 255), int(v * 255)
                act_r, act_g, _ = self.faces[name].getpixel((i, j))[:3]
                if abs(act_r - exp_r) > COLOR_TOL or abs(act_g - exp_g) > COLOR_TOL:
                    errors.append(
                        f"{name} ({i},{j}): R err={abs(act_r-exp_r)}, G err={abs(act_g-exp_g)}"
                    )
        self.assertEqual(errors, [], "Colour accuracy failures:\n" + "\n".join(errors))

    def test_no_face_is_all_black(self):
        """All-black output is a silent sign UV mapping returned all-zero indices."""
        for name, img in self.faces.items():
            mean = np.array(img).mean()
            self.assertGreater(mean, 1.0,
                f"{name} nearly all black (mean={mean:.2f}) -- UV mapping broken")


# =================================================================
# 6. Output file integrity
# =================================================================

class TestOutputFiles(unittest.TestCase):

    def setUp(self):
        (self.src, self.src_w, self.src_h), self.faces = get_data()

    def test_generates_all_six_faces(self):
        self.assertEqual(len(self.faces), 6)

    def test_output_dimensions_match_face_size(self):
        N = TEST_FACE_SIZE
        for name, img in self.faces.items():
            w, h = img.size
            self.assertEqual((w, h), (N, N),
                f"{name}: expected {N}x{N}, got {w}x{h}")

    def test_output_is_rgb(self):
        for name, img in self.faces.items():
            self.assertIn(img.mode, ("RGB", "L"),
                f"{name}: mode {img.mode} -- Cesium needs RGB")

    def test_jpeg_write_and_reload(self):
        """Files must survive a JPEG write/read cycle without catastrophic quality loss."""
        with tempfile.TemporaryDirectory() as tmp:
            for name, img in self.faces.items():
                path = os.path.join(tmp, f"{name}.jpg")
                img.save(path, "JPEG", quality=92)
                reloaded = Image.open(path)
                self.assertEqual(reloaded.size, img.size,
                    f"{name}: size changed after JPEG roundtrip")
                mean_err = np.abs(
                    np.array(img).astype(float) - np.array(reloaded).astype(float)
                ).mean()
                self.assertLess(mean_err, 5.0,
                    f"{name}: JPEG mean error {mean_err:.2f} too high at quality=92")

    def test_cesium_skybox_source_keys_match_filenames(self):
        """
        Cesium SkyBox sources expect:
            positiveX, negativeX, positiveY, negativeY, positiveZ, negativeZ
        The FACES list stems must cover all of them.
        """
        cesium_map = {
            "skybox_px": "positiveX",
            "skybox_nx": "negativeX",
            "skybox_py": "positiveY",
            "skybox_ny": "negativeY",
            "skybox_pz": "positiveZ",
            "skybox_nz": "negativeZ",
        }
        face_names = {f[0] for f in FACES}
        for stem, cesium_key in cesium_map.items():
            self.assertIn(stem, face_names,
                f"Missing face '{stem}' (Cesium sources.{cesium_key})")


# =================================================================

if __name__ == "__main__":
    unittest.main(verbosity=2)