from fastapi import FastAPI
from fastapi.responses import Response
from fastapi.middleware.gzip import GZipMiddleware
from sqlalchemy import create_engine, text
from vercel.blob import AsyncBlobClient
from datetime import datetime
import os
import json
import gzip
from dotenv import load_dotenv

load_dotenv()

client = AsyncBlobClient()

app = FastAPI()
app.add_middleware(GZipMiddleware, minimum_size=1000)

engine = create_engine(os.getenv("DATABASE_URL"))

BLOB_FILENAME = "satellites-profiles-cache.gz"

CACHE_HEADERS = {
    "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400",
    "Access-Control-Allow-Origin": "*",
}

def get_constellation(name: str) -> str | None:
    """
    Derives the canonical constellation name from a satellite name.
    Mirrors the network filter logic in SatelliteFilter.ts.
    """
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
async def get_satellite_profiles():
    print("[satellites-profiles] called")
    start = datetime.utcnow()

    # --- 1. Blob cache check (fastest path) ---
    try:
        result = await client.get(BLOB_FILENAME, access="private")
        if result and result.status_code == 200:
            uploaded_at = result.blob.uploaded_at.replace(tzinfo=None)
            age_hours = (datetime.utcnow() - uploaded_at).total_seconds() / 3600
            if age_hours < 24:
                elapsed = (datetime.utcnow() - start).total_seconds() * 1000
                print(f"[satellites-profiles] SOURCE: Blob cache hit ({age_hours:.1f}h old, {elapsed:.0f}ms)")
                chunks = []
                async for chunk in result.stream:
                    chunks.append(chunk)
                return Response(
                    content=b"".join(chunks),
                    media_type="application/json",
                    headers={**CACHE_HEADERS, "Content-Encoding": "gzip", "x-cache-source": "blob"},
                )
            print(f"[satellites-profiles] Blob expired ({age_hours:.1f}h old), rebuilding...")
    except Exception as e:
        print(f"[satellites-profiles] Blob check failed, falling through to Neon cache: {e}")

    # --- 2. Neon response_cache check (fallback if Blob missing/expired) ---
    with engine.connect() as conn:
        try:
            cached = conn.execute(text(
                "SELECT data, cached_at FROM response_cache WHERE key = 'satellites-profiles'"
            )).fetchone()
            if cached:
                age_hours = (datetime.utcnow() - cached.cached_at).total_seconds() / 3600
                if age_hours < 23.9:
                    elapsed = (datetime.utcnow() - start).total_seconds() * 1000
                    print(f"[satellites-profiles] SOURCE: Neon response_cache hit (neon-blob-cache) ({age_hours:.1f}h old, {elapsed:.0f}ms)")

                    # Blob was missing/expired — restore it so next request hits the fast path
                    raw = cached.data.encode() if isinstance(cached.data, str) else cached.data
                    compressed = gzip.compress(raw)
                    try:
                        blob_start = datetime.utcnow()
                        await client.put(BLOB_FILENAME, compressed, access="private", overwrite=True, content_type="application/octet-stream")
                        print(f"[satellites-profiles] Blob restored from Neon cache ({(datetime.utcnow() - blob_start).total_seconds() * 1000:.0f}ms)")
                    except Exception as blob_err:
                        print(f"[satellites-profiles] Blob restore failed (non-fatal): {blob_err}")

                    return Response(
                        content=compressed,
                        media_type="application/json",
                        headers={**CACHE_HEADERS, "Content-Encoding": "gzip", "x-cache-source": "neon-blob-cache"},
                    )
                print(f"[satellites-profiles] Neon cache expired ({age_hours:.1f}h old), rebuilding...")
        except Exception as e:
            print(f"[satellites-profiles] Neon cache check failed: {e}")

        # --- 3. Full rebuild from source tables (slow path) ---
        satellites = conn.execute(text("SELECT * FROM satellites ORDER BY norad_id")).fetchall()
        print(f"[satellites-profiles] fetched {len(satellites)} satellites from Neon")
        images = conn.execute(text("SELECT * FROM satellite_images")).fetchall()
        print(f"[satellites-profiles] fetched {len(images)} images from Neon")

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

        # Update Neon response_cache
        conn.execute(text("""
            INSERT INTO response_cache (key, data)
            VALUES ('satellites-profiles', :data)
            ON CONFLICT (key) DO UPDATE SET data = :data, cached_at = NOW()
        """), {"data": json.dumps(profiles)})
        conn.commit()

    # Store in Blob for next time
    compressed = gzip.compress(json.dumps(profiles).encode())
    blob_start = datetime.utcnow()
    await client.put(BLOB_FILENAME, compressed, access="private", overwrite=True, content_type="application/octet-stream")
    print(f"[satellites-profiles] Blob stored ({(datetime.utcnow() - blob_start).total_seconds() * 1000:.0f}ms)")

    elapsed = (datetime.utcnow() - start).total_seconds() * 1000
    print(f"[satellites-profiles] SOURCE: full rebuild complete ({elapsed:.0f}ms), returning {len(profiles)} profiles")

    return Response(
        content=compressed,
        media_type="application/json",
        headers={**CACHE_HEADERS, "Content-Encoding": "gzip", "x-cache-source": "neon"},
    )