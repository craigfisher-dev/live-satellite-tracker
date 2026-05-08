from fastapi import FastAPI
from fastapi.responses import Response, JSONResponse
from fastapi.middleware.gzip import GZipMiddleware
from sqlalchemy import create_engine, text
from datetime import datetime, timezone
import os
import json
import gzip
import requests
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()
app.add_middleware(GZipMiddleware, minimum_size=1000)

engine = create_engine(os.getenv("DATABASE_URL"))

GZIP_HEADERS = {
    "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400",
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
    "Content-Encoding": "gzip",
}

BLOB_TOKEN = os.getenv("BLOB_READ_WRITE_TOKEN")
# BLOB_PRIVATE_URL = os.getenv("BLOB_PRIVATE_URL")     ---> Will add back in next commit
BLOB_FILENAME = "satellites-profiles-cache.gz"
CACHE_TTL_HOURS = 24

def get_constellation(name: str) -> str | None:
    if not name:
        return None
    name_upper = name.upper()
    if "STARLINK" in name_upper: return "STARLINK"
    if "ONEWEB" in name_upper: return "ONEWEB"
    if "KUIPER" in name_upper: return "KUIPER"
    if "IRIDIUM" in name_upper: return "IRIDIUM"
    if "GPS" in name_upper or "NAVSTAR" in name_upper: return "GPS"
    if "GLOBALSTAR" in name_upper: return "GLOBALSTAR"
    if "GALILEO" in name_upper: return "GALILEO"
    if "GLONASS" in name_upper: return "GLONASS"
    if "BEIDOU" in name_upper: return "BEIDOU"
    if "QIANFAN" in name_upper: return "QIANFAN"
    if any(k in name_upper for k in ["SKYSAT", "FLOCK", "PELICAN", "TANAGER"]): return "PLANET"
    return None

@app.get("/api/satellites-profiles")
def get_satellite_profiles():
    print("[profiles] called")
    start = datetime.utcnow()

    with requests.Session() as session:

        # ── Layer 1: Vercel Blob (list to find file, download only if fresh) ──
        try:
            list_resp = session.get(
                "https://blob.vercel-storage.com",
                headers={"Authorization": f"Bearer {BLOB_TOKEN}"},
                params={"prefix": BLOB_FILENAME, "limit": 1},
                timeout=8,
            )
            blobs = list_resp.json().get("blobs", []) if list_resp.ok else []
            if blobs:
                uploaded_at = datetime.fromisoformat(blobs[0]["uploadedAt"].replace("Z", "+00:00"))
                age_hours = (datetime.now(timezone.utc) - uploaded_at).total_seconds() / 3600
                if age_hours < CACHE_TTL_HOURS:
                    print(f"[profiles] Blob fresh ({age_hours:.1f}h old), downloading...")
                    dl = session.get(blobs[0]["url"], headers={"Authorization": f"Bearer {BLOB_TOKEN}"}, timeout=15)
                    if dl.ok:
                        elapsed = (datetime.utcnow() - start).total_seconds() * 1000
                        print(f"[profiles] SOURCE: Blob cache hit ({age_hours:.1f}h old, {elapsed:.0f}ms)")
                        return Response(content=dl.content, headers={**GZIP_HEADERS, "x-cache-source": "blob"})
                else:
                    print(f"[profiles] Blob expired ({age_hours:.1f}h old), skipping download")
            else:
                print("[profiles] Blob cache miss")
        except Exception as e:
            print(f"[profiles] Blob error: {e}")

        # ── Layer 2: Neon response_cache ──
        print("[profiles] Falling back to Neon...")
        try:
            with engine.connect() as conn:
                cached = conn.execute(text(
                    "SELECT data, cached_at FROM response_cache WHERE key = 'satellites-profiles'"
                )).fetchone()
                if cached:
                    age_hours = (datetime.utcnow() - cached.cached_at).total_seconds() / 3600
                    if age_hours < CACHE_TTL_HOURS:
                        elapsed = (datetime.utcnow() - start).total_seconds() * 1000
                        print(f"[profiles] SOURCE: Neon cache ({age_hours:.1f}h old, {elapsed:.0f}ms)")
                        # Rehydrate Blob so next request hits fast path
                        compressed = gzip.compress(json.dumps(json.loads(cached.data)).encode("utf-8"))
                        try:
                            session.put(
                                f"https://blob.vercel-storage.com/{BLOB_FILENAME}",
                                data=compressed,
                                headers={
                                    "Authorization": f"Bearer {BLOB_TOKEN}",
                                    "Content-Type": "application/octet-stream",
                                    "x-api-version": "7",
                                    "x-allow-overwrite": "1",
                                },
                                timeout=30,
                            )
                            print(f"[profiles] Blob rehydrated ({len(compressed) / 1024 / 1024:.2f}MB)")
                        except Exception as e:
                            print(f"[profiles] Blob rehydrate failed: {e}")
                        return Response(content=compressed, headers={**GZIP_HEADERS, "x-cache-source": "neon"})
                    print(f"[profiles] Neon cache expired ({age_hours:.1f}h old)")

                # ── Layer 3: Full rebuild ──
                print("[profiles] Full rebuild from Neon tables...")
                satellites = conn.execute(text("SELECT * FROM satellites ORDER BY norad_id")).fetchall()
                print(f"[profiles] Fetched {len(satellites)} satellites")
                images = conn.execute(text("SELECT * FROM satellite_images")).fetchall()
                print(f"[profiles] Fetched {len(images)} images")

                images_by_norad = {row.norad_id: row for row in images if row.norad_id}
                images_by_constellation = {row.constellation: row for row in images if row.constellation}

                profiles = []
                for row in satellites:
                    constellation = get_constellation(row.name)
                    image = images_by_norad.get(row.norad_id) or images_by_constellation.get(constellation)
                    profiles.append({
                        "norad_id": row.norad_id,
                        "name": row.name,
                        "object_type": row.object_type,
                        "country": row.country,
                        "launch_date": row.launch_date.isoformat() if row.launch_date else None,
                        "launch_site": row.launch_site,
                        "decay_date": row.decay_date.isoformat() if row.decay_date else None,
                        "current": row.current,
                        "rcs_size": row.rcs_size,
                        "purpose": row.purpose,
                        "description": row.description,
                        "operator": row.operator,
                        "image_url": image.image_url if image else None,
                        "credit": image.credit if image else None,
                        "last_updated": row.last_updated.isoformat() if row.last_updated else None,
                    })

                # Save to Neon cache
                conn.execute(text("""
                    INSERT INTO response_cache (key, data)
                    VALUES ('satellites-profiles', :data)
                    ON CONFLICT (key) DO UPDATE SET data = :data, cached_at = NOW()
                """), {"data": json.dumps(profiles)})
                conn.commit()
                print(f"[profiles] Neon cache updated ({len(profiles)} profiles)")

        except Exception as e:
            print(f"[profiles] Neon error: {e}")
            return JSONResponse({"error": "Service unavailable"}, status_code=503)

        # Compress and store to Blob
        compressed = gzip.compress(json.dumps(profiles).encode("utf-8"))
        print(f"[profiles] Compressed to {len(compressed) / 1024 / 1024:.2f}MB")
        try:
            session.put(
                f"https://blob.vercel-storage.com/{BLOB_FILENAME}",
                data=compressed,
                headers={
                    "Authorization": f"Bearer {BLOB_TOKEN}",
                    "Content-Type": "application/octet-stream",
                    "x-api-version": "7",
                    "x-allow-overwrite": "1",
                },
                timeout=30,
            )
            print(f"[profiles] Blob stored ({len(compressed) / 1024 / 1024:.2f}MB)")
        except Exception as e:
            print(f"[profiles] Blob store failed: {e}")

        elapsed = (datetime.utcnow() - start).total_seconds() * 1000
        print(f"[profiles] SOURCE: Full rebuild complete ({elapsed:.0f}ms)")
        return Response(content=compressed, headers={**GZIP_HEADERS, "x-cache-source": "rebuild"})