from db import upsert_satellites, engine
from spacetrack import get_satcat
from sqlalchemy.orm import Session
import json
from collections import defaultdict
import csv

UCS_CSV_PATH = 'data/ucs_satellites.csv'

# Load UCS satellite data from CSV, returns dict keyed by NORAD ID
def load_ucs():
    ucs = defaultdict(dict)

    # newline='' prevents OS line-ending issues, encoding='utf-8' handles special characters in operator names
    with open(UCS_CSV_PATH, newline='', encoding='utf-8-sig') as file:
        reader = csv.DictReader(file)
        # Strip whitespace from column headers to fix spacing issues caused by blank columns in CSV
        reader.fieldnames = [f.strip() if f else f for f in reader.fieldnames]
        for row in reader:
            norad_id = row['NORAD Number']
            # Skip blank rows at end of file
            if not norad_id:
                continue
            # If want to add any other fields in the future add more to dictionary below
            ucs[norad_id] = {
                'purpose': row['Purpose'],
                'operator': row['Operator/Owner'],
                'description': row['Detailed Purpose']
            }

    # Returns dict keyed by NORAD ID
    return ucs

# Merge UCS data into Space-Track satellite list — attaches purpose and operator
def merge(satellites, ucs):
    for satellite in satellites:
        norad_id = str(satellite['norad_id'])
        if norad_id in ucs:
            # UCS data found for this satellite — attach purpose, operator, and description
            satellite['purpose'] = ucs[norad_id]['purpose']
            satellite['operator'] = ucs[norad_id]['operator']
            satellite['description'] = ucs[norad_id]['description']
        else:
            # No UCS data for this satellite — set to None
            satellite['purpose'] = None
            satellite['operator'] = None
            satellite['description'] = None
    return satellites


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