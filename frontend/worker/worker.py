from db import upsert_satellites, engine
from spacetrack import fetch_satcat
from sqlalchemy.orm import Session

with Session(engine) as session:
    satellites = fetch_satcat()
    upsert_satellites(session, satellites)