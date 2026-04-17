from db import upsert_satellites, engine
from spacetrack import get_satcat
from sqlalchemy.orm import Session

with Session(engine) as session:
    satellites = get_satcat()
    upsert_satellites(session, satellites)