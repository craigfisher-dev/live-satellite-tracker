from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.middleware.gzip import GZipMiddleware
from sqlalchemy import create_engine, text
from datetime import datetime
import os
import json
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()
app.add_middleware(GZipMiddleware, minimum_size=1000)

engine = create_engine(os.getenv("DATABASE_URL"))

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
def get_satellite_profiles():
    print("satellites-profiles called")
    start = datetime.utcnow()
    with engine.connect() as conn:

        # Check blob cache first — skip if older than 23.9 hours
        cached = conn.execute(text(
            "SELECT data, cached_at FROM response_cache WHERE key = 'satellites-profiles'"
        )).fetchone()
        if cached:
            age_hours = (datetime.utcnow() - cached.cached_at).total_seconds() / 3600
            if age_hours < 23.9:
                elapsed = (datetime.utcnow() - start).total_seconds() * 1000
                print(f"SOURCE: Neon blob cache (fast path, {age_hours:.1f}h old, {elapsed:.0f}ms)")
                return JSONResponse(content=json.loads(cached.data), headers=CACHE_HEADERS)
            print(f"Blob cache expired ({age_hours:.1f}h old), rebuilding...")

        # Blob cache miss or expired — build from scratch
        satellites = conn.execute(text("SELECT * FROM satellites ORDER BY norad_id")).fetchall()
        print(f"fetched {len(satellites)} satellites from Neon")
        images = conn.execute(text("SELECT * FROM satellite_images")).fetchall()
        print(f"fetched {len(images)} images from Neon")

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

        # Save blob so next request hits the fast path
        conn.execute(text("""
            INSERT INTO response_cache (key, data)
            VALUES ('satellites-profiles', :data)
            ON CONFLICT (key) DO UPDATE SET data = :data, cached_at = NOW()
        """), {"data": json.dumps(profiles)})
        conn.commit()

        elapsed = (datetime.utcnow() - start).total_seconds() * 1000
        print(f"SOURCE: slow path rebuild complete ({elapsed:.0f}ms), returning {len(profiles)} profiles")
        return JSONResponse(content=profiles, headers=CACHE_HEADERS)