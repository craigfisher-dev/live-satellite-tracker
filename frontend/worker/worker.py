from db import upsert_satellites, engine
from spacetrack import get_satcat
from sqlalchemy.orm import Session
import csv
import json


UCS_CSV_PATH = 'data/ucs_satellites.csv'

# Load UCS satellite data from CSV, returns dict keyed by NORAD ID
def load_ucs():
    # TODO: implement — read ucs_satellites.csv, return {norad_id: {purpose, operator}}
    pass

# Merge UCS data into Space-Track satellite list — attaches purpose and operator
def merge(satellites, ucs):
    # TODO: implement — loop satellites, attach ucs fields if norad_id matches
    pass

with Session(engine) as session:
    # DEVELOPMENT: load from local testing data instead of calling Space-Track
    # TODO: swap back to get_satcat() before deploying to production
    with open('testing_data/satcat.json') as f:
        satellites = json.load(f)

    # PRODUCTION: uncomment and remove the block above
    # satellites = get_satcat()

    ucs = load_ucs()
    satellites = merge(satellites, ucs)
    upsert_satellites(session, satellites)