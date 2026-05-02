import os
from dotenv import load_dotenv
import requests
import json

load_dotenv()

BASE_URL = 'https://www.space-track.org'

spacetrack_username = os.getenv('SPACETRACK_USER')
spacetrack_password = os.getenv('SPACETRACK_PASS')

# POST credentials to Space-Track, returns session with cookie (Valid 2 hours) for subsequent requests
def login(spacetrack_username, spacetrack_password):
    # POST credentials, returns a session with the cookie attached
    session = requests.Session()

    # Credentials to login to Space-Track
    siteCred = {'identity': spacetrack_username, 'password': spacetrack_password}

    # /ajaxauth/login is the Space-Track auth endpoint — must use this URL per their docs
    response = session.post(BASE_URL + '/ajaxauth/login', data=siteCred)
    if response.status_code == 401:
        raise RuntimeError("Invalid Space-Track credentials")
    # Checking all other codes other than 200 (Valid)
    if response.status_code != 200:
        raise RuntimeError(f"Login failed with status {response.status_code}")
    return session

# GET all SATCAT in a single batch request, returns list of dicts
def fetch_satcat(session):
    url = BASE_URL + '/basicspacedata/query/class/satcat/format/json'
    response = session.get(url)
    # Checking all other codes other than 200 (Valid)
    if response.status_code != 200:
        raise RuntimeError(f"SATCAT fetch failed with status {response.status_code}")

    # Remap Space-Track field names to match our DB schema

    satellites = []
    for sat in response.json():
        satellites.append({
            'norad_id':    sat['NORAD_CAT_ID'],
            'name':        sat['SATNAME'],
            'object_type': sat['OBJECT_TYPE'],
            'country':     sat['COUNTRY'],
            'launch_date': sat['LAUNCH'] or None,
            'launch_site': sat['SITE'] or None,
            'decay_date':  sat['DECAY'] or None,
            'current':     sat['CURRENT'],
            'rcs_size':    sat['RCS_SIZE'] or None,
            'purpose':     None,  # filled in by worker.py from UCS
            'description': None,  # future
            'operator':    None,  # filled in by worker.py from UCS
        })
    return satellites

# GET Space-Track logout endpoint — invalidates the session cookie
def logout(session):
    session.get(BASE_URL + '/ajaxauth/logout')
    return

# Orchestrates login, fetch, logout — this is what worker.py calls
def get_satcat():
    # Login and get session cookie — bail early if login fails
    session = login(spacetrack_username, spacetrack_password)
    try:
        # Fetch all SATCAT in a single batch request
        data = fetch_satcat(session)
        return data
    except Exception as e:
        # Wrap fetch errors with context so worker.py gets a clear message
        raise RuntimeError(f"Failed to fetch SATCAT: {e}")
    finally:
        # Always logout regardless of success or failure
        logout(session)


# ONE-TIME USE: fetches live SATCAT from Space-Track and saves to testing_data/satcat.json

# if __name__ == '__main__':
#     print("Fetching SATCAT from Space-Track...")
#     data = get_satcat()
#     with open('testing_data/satcat.json', 'w') as f:
#         json.dump(data, f)
#     print(f"Saved {len(data)} satellites to testing_data/satcat.json")