import os
import requests
from sqlalchemy.orm import Session
from sqlalchemy import text
from db import engine
from dotenv import load_dotenv

load_dotenv()

CELESTRAK_URL = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=JSON'
TIMEOUT = 30

def fetch_celestrak_ids():
    try:
        response = requests.get(CELESTRAK_URL, timeout=TIMEOUT)
    except requests.exceptions.ConnectionError:
        raise RuntimeError("Could not connect to CelesTrak — check your internet connection")
    except requests.exceptions.Timeout:
        raise RuntimeError(f"CelesTrak request timed out after {TIMEOUT}s")
    except requests.exceptions.RequestException as e:
        raise RuntimeError(f"CelesTrak request failed: {e}")

    if response.status_code != 200:
        raise RuntimeError(f"CelesTrak returned unexpected status {response.status_code}")

    try:
        data = response.json()
    except Exception:
        raise RuntimeError("CelesTrak returned invalid JSON")

    if not isinstance(data, list):
        raise RuntimeError(f"CelesTrak response was not a list — got {type(data).__name__}")

    if len(data) == 0:
        raise RuntimeError("CelesTrak returned an empty list — something is wrong")

    ids = set()
    malformed = 0
    for sat in data:
        raw = sat.get('NORAD_CAT_ID')
        if raw is None:
            malformed += 1
            continue
        try:
            ids.add(int(raw))
        except (ValueError, TypeError):
            malformed += 1

    if malformed:
        print(f"Warning: {malformed} CelesTrak records skipped due to missing or invalid NORAD_CAT_ID")

    if len(ids) == 0:
        raise RuntimeError("No valid NORAD IDs parsed from CelesTrak response")

    return ids


def fetch_neon_ids(session):
    try:
        result = session.execute(text('SELECT norad_id FROM satellites'))
        ids = set(row[0] for row in result if row[0] is not None)
    except Exception as e:
        raise RuntimeError(f"Failed to query Neon satellites table: {e}")

    if len(ids) == 0:
        raise RuntimeError("Neon satellites table is empty — has the worker run yet?")

    return ids


def main():
    if not os.getenv('DATABASE_URL'):
        raise RuntimeError("DATABASE_URL not set — check your .env file")

    with Session(engine) as session:
        print("Fetching CelesTrak IDs...")
        celestrak_ids = fetch_celestrak_ids()
        print(f"CelesTrak active satellites: {len(celestrak_ids)}")

        print("Fetching Neon IDs...")
        neon_ids = fetch_neon_ids(session)
        print(f"Neon satellites: {len(neon_ids)}")

        missing = celestrak_ids - neon_ids
        overlap = len(celestrak_ids) - len(missing)
        pct = (overlap / len(celestrak_ids)) * 100

        print(f"\nOverlap: {overlap} / {len(celestrak_ids)} ({pct:.1f}%)")
        print(f"Missing from Neon: {len(missing)}")

        if missing:
            print(f"\nMissing NORAD IDs: {sorted(missing)}")
            if pct < 95.0:
                print(f"\nWarning: overlap is below 95% — investigate before proceeding to FastAPI")
            else:
                print(f"\nOverlap is acceptable — safe to proceed to FastAPI")
        else:
            print("\nAll CelesTrak satellites found in Neon.")


if __name__ == '__main__':
    try:
        main()
    except RuntimeError as e:
        print(f"Error: {e}")
        exit(1)
    except Exception as e:
        print(f"Unexpected error: {e}")
        exit(1)