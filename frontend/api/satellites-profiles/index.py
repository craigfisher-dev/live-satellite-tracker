from fastapi import FastAPI
from fastapi.responses import Response
from fastapi.middleware.gzip import GZipMiddleware
from sqlalchemy import create_engine, text
from vercel.blob import AsyncBlobClient
from datetime import datetime
import os
import json
import gzip
import httpx
import uuid
from dotenv import load_dotenv

load_dotenv()

client = AsyncBlobClient()

app = FastAPI()
app.add_middleware(GZipMiddleware, minimum_size=1000)

engine = create_engine(os.getenv("DATABASE_URL"))

BLOB_FILENAME = "satellites-profiles-cache.gz"

CACHE_HEADERS = {
    "Cache-Control": "public, max-age=0",
    "CDN-Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400",
    "Vercel-CDN-Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400",
    "Access-Control-Allow-Origin": "*",
}

def log(logs: list, request_id: str, **kwargs):
    # Helper to attach request_id to every log entry automatically
    entry = {"request_id": request_id, **kwargs}
    logs.append(entry)

async def flush_logs(logs: list):
    # Print all collected logs — always works, shows in Vercel logs for 1 hour
    for entry in logs:
        print(f"[satellite-tracker] {entry}")

    # One single Loki push with all logs as separate entries — one network call total
    try:
        now_ns = int(datetime.utcnow().timestamp() * 1e9)
        async with httpx.AsyncClient(timeout=3.0) as http:
            await http.post(
                f"{os.getenv('LOKI_URL')}/loki/api/v1/push",
                auth=(os.getenv('LOKI_USER'), os.getenv('LOKI_TOKEN')),
                json={
                    "streams": [{
                        "stream": {"app": "satellite-tracker"},
                        "values": [
                            # Offset each log by 1ns so they don't collide in Loki
                            [str(now_ns + i), json.dumps(entry)]
                            for i, entry in enumerate(logs)
                        ]
                    }]
                }
            )
    except Exception as e:
        # Never crash the endpoint over logging
        print(f"Loki flush failed: {e}")

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

@app.api_route("/api/satellites-profiles", methods=["GET", "HEAD"])
async def get_satellite_profiles():
    logs = []  # collect logs throughout, flush once at the end
    request_id = str(uuid.uuid4())[:8]  # short unique ID ties all logs from this request together
    start = datetime.utcnow()

    # --- 1. Blob cache check (fastest path) ---
    try:
        head_start = datetime.utcnow()
        head = await client.head(BLOB_FILENAME)
        log(logs, request_id, message="blob head check", status=200, duration_ms=round((datetime.utcnow() - head_start).total_seconds() * 1000))

        uploaded_at = head.uploaded_at.replace(tzinfo=None)
        age_hours = (datetime.utcnow() - uploaded_at).total_seconds() / 3600
        if age_hours < 24:
            elapsed = (datetime.utcnow() - start).total_seconds() * 1000
            log(logs, request_id, message="blob cache hit", source="blob", age_hours=round(age_hours, 1), duration_ms=round(elapsed))

            fetch_start = datetime.utcnow()
            async with httpx.AsyncClient() as http:
                blob_res = await http.get(
                    head.url,
                    headers={"authorization": f"Bearer {os.getenv('BLOB_READ_WRITE_TOKEN')}"},
                )
            log(logs, request_id, message="blob content fetch", status=blob_res.status_code, duration_ms=round((datetime.utcnow() - fetch_start).total_seconds() * 1000))

            elapsed = (datetime.utcnow() - start).total_seconds() * 1000
            log(logs, request_id, message="request complete", cache_source="blob", total_duration_ms=round(elapsed))
            # flush all logs right before returning — one network call
            await flush_logs(logs)
            return Response(
                content=blob_res.content,
                media_type="application/json",
                headers={**CACHE_HEADERS, "Content-Encoding": "gzip", "x-cache-source": "blob"},
            )
        log(logs, request_id, message="blob expired", source="blob", age_hours=round(age_hours, 1))
    except Exception as e:
        log(logs, request_id, message="blob check failed", source="blob", error=str(e))

    # --- 2. Neon response_cache check (fallback if Blob missing/expired) ---
    with engine.connect() as conn:
        try:
            neon_start = datetime.utcnow()
            cached = conn.execute(text(
                "SELECT data, cached_at FROM response_cache WHERE key = 'satellites-profiles'"
            )).fetchone()
            log(logs, request_id, message="neon cache query", duration_ms=round((datetime.utcnow() - neon_start).total_seconds() * 1000))

            if cached:
                age_hours = (datetime.utcnow() - cached.cached_at).total_seconds() / 3600
                if age_hours < 23.9:
                    elapsed = (datetime.utcnow() - start).total_seconds() * 1000
                    log(logs, request_id, message="neon cache hit", source="neon-blob-cache", age_hours=round(age_hours, 1), duration_ms=round(elapsed))

                    # Blob was missing/expired — restore it so next request hits the fast path
                    raw = cached.data.encode() if isinstance(cached.data, str) else cached.data
                    compressed = gzip.compress(raw)
                    try:
                        blob_start = datetime.utcnow()
                        await client.put(BLOB_FILENAME, compressed, access="private", overwrite=True, content_type="application/octet-stream")
                        log(logs, request_id, message="blob restored from neon", source="neon-blob-cache", duration_ms=round((datetime.utcnow() - blob_start).total_seconds() * 1000))
                    except Exception as blob_err:
                        log(logs, request_id, message="blob restore failed", source="neon-blob-cache", error=str(blob_err))

                    elapsed = (datetime.utcnow() - start).total_seconds() * 1000
                    log(logs, request_id, message="request complete", cache_source="neon-blob-cache", total_duration_ms=round(elapsed))
                    # flush all logs right before returning — one network call
                    await flush_logs(logs)
                    return Response(
                        content=compressed,
                        media_type="application/json",
                        headers={**CACHE_HEADERS, "Content-Encoding": "gzip", "x-cache-source": "neon-blob-cache"},
                    )
                log(logs, request_id, message="neon cache expired", source="neon", age_hours=round(age_hours, 1))
        except Exception as e:
            log(logs, request_id, message="neon cache check failed", source="neon", error=str(e))
            conn.rollback()

        # --- 3. Full rebuild from source tables (slow path) ---
        satellites_start = datetime.utcnow()
        satellites = conn.execute(text("SELECT * FROM satellites WHERE current = 'Y' AND decay_date IS NULL ORDER BY norad_id")).fetchall()
        log(logs, request_id, message="fetched satellites from neon", source="neon", count=len(satellites), duration_ms=round((datetime.utcnow() - satellites_start).total_seconds() * 1000))

        images_start = datetime.utcnow()
        images = conn.execute(text("SELECT * FROM satellite_images")).fetchall()
        log(logs, request_id, message="fetched images from neon", source="neon", count=len(images), duration_ms=round((datetime.utcnow() - images_start).total_seconds() * 1000))

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
        cache_start = datetime.utcnow()
        conn.execute(text("""
            INSERT INTO response_cache (key, data)
            VALUES ('satellites-profiles', :data)
            ON CONFLICT (key) DO UPDATE SET data = :data, cached_at = NOW()
        """), {"data": json.dumps(profiles)})
        conn.commit()
        log(logs, request_id, message="neon response_cache updated", duration_ms=round((datetime.utcnow() - cache_start).total_seconds() * 1000))

    # Store in Blob for next time
    blob_start = datetime.utcnow()
    compressed = gzip.compress(json.dumps(profiles).encode())
    await client.put(BLOB_FILENAME, compressed, access="private", overwrite=True, content_type="application/octet-stream")
    log(logs, request_id, message="blob stored", source="neon", duration_ms=round((datetime.utcnow() - blob_start).total_seconds() * 1000))

    elapsed = (datetime.utcnow() - start).total_seconds() * 1000
    log(logs, request_id, message="full rebuild complete", source="neon", duration_ms=round(elapsed), satellite_count=len(profiles))
    log(logs, request_id, message="request complete", cache_source="neon", total_duration_ms=round(elapsed))

    # flush all logs right before returning — one network call
    await flush_logs(logs)
    return Response(
        content=compressed,
        media_type="application/json",
        headers={**CACHE_HEADERS, "Content-Encoding": "gzip", "x-cache-source": "neon"},
    )