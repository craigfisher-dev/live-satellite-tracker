import math
import numpy as np
from PIL import Image

INPUT = "starmap_2020_8k.png"
FACE_SIZE = 4096
QUALITY = 92

FACES = [
    ("skybox_px", ( 1, 0, 0), (0, 1, 0), (0, 0,-1)),  # both negated
    ("skybox_nx", (-1, 0, 0), (0,-1, 0), (0, 0,-1)),  # both negated  # 180° from original
    ("skybox_py", ( 0, 1, 0), (-1, 0, 0), (0, 0,-1)),
    ("skybox_ny", ( 0,-1, 0), (-1, 0, 0), (0, 0, 1)),
    ("skybox_pz", ( 0, 0, 1), (-1, 0, 0), (0, 1, 0)),
    ("skybox_nz", ( 0, 0,-1), ( 1, 0, 0), (0, 1, 0)),
]

print(f"Loading {INPUT}...")
src = np.array(Image.open(INPUT).convert("RGB"))
src_h, src_w = src.shape[:2]
print(f"Source: {src_w} x {src_h}")

i_idx = np.arange(FACE_SIZE)
j_idx = np.arange(FACE_SIZE)
su, sv = np.meshgrid(
    (i_idx + 0.5) / FACE_SIZE * 2 - 1,
    (j_idx + 0.5) / FACE_SIZE * 2 - 1,
)

for name, (fx,fy,fz), (rx,ry,rz), (ux,uy,uz) in FACES:
    print(f"Rendering {name}...")
    dx = fx + su*rx + sv*ux
    dy = fy + su*ry + sv*uy
    dz = fz + su*rz + sv*uz
    length = np.sqrt(dx**2 + dy**2 + dz**2)
    dx /= length; dy /= length; dz /= length
    ra  = np.arctan2(dy, dx)
    dec = np.arcsin(np.clip(dz, -1, 1))
    u = ((ra / (2 * np.pi)) + 1) % 1
    v = np.clip(0.5 - dec / np.pi, 0, 1)
    px = (u * src_w).astype(np.int32) % src_w
    py = np.clip((v * src_h).astype(np.int32), 0, src_h - 1)
    Image.fromarray(src[py, px].astype(np.uint8)).save(
        f"{name}.jpg", "JPEG", quality=QUALITY
    )
    print(f"  Saved {name}.jpg")

print("Done!")