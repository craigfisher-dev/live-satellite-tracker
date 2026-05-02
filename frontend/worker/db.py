import os
from sqlalchemy import create_engine, Column, Integer, String, Date, Text, DateTime
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.dialects.postgresql import insert
from dotenv import load_dotenv
from datetime import datetime, timezone

# Load environment variables from .env file
load_dotenv()

# Read Neon connection string from .env
conn_str = os.getenv('DATABASE_URL')

# Create SQLAlchemy engine (sets up connection pool, doesn't connect yet)
engine = create_engine(conn_str)

# Base class that all models inherit from — tells SQLAlchemy these are database tables
class Base(DeclarativeBase):
    pass

# Maps to the satellites table in Neon — one attribute per column
class Satellite(Base):
    __tablename__ = 'satellites'

    norad_id     = Column(Integer, primary_key=True)  # NORAD_CAT_ID from SATCAT, joins with CelesTrak
    name         = Column(String(25))                 # SATNAME from SATCAT
    object_type  = Column(String(12))                 # OBJECT_TYPE: PAYLOAD, ROCKET BODY, DEBRIS
    country      = Column(String(6))                  # COUNTRY code e.g. US, CN, RU
    launch_date  = Column(Date)                       # LAUNCH from SATCAT
    launch_site  = Column(String(5))                  # SITE from SATCAT e.g. AFETR, TYMSC
    decay_date   = Column(Date, nullable=True)        # DECAY from SATCAT, null if still on orbit
    current      = Column(String(1))                  # CURRENT: Y or N
    rcs_size     = Column(String(6), nullable=True)   # RCS_SIZE: SMALL, MEDIUM, LARGE
    purpose      = Column(Text, nullable=True)        # from UCS database, nullable
    description  = Column(Text, nullable=True)        # future: hardcoded descriptions for major constellations — Starlink, OneWeb, GPS, GLONASS, Galileo, Beidou, Iridium, NOAA, Landsat, ISS, Hubble, James Webb, etc...
    last_updated = Column(DateTime, default=lambda: datetime.now(timezone.utc)) # timestamp of last worker run
    operator     = Column(Text, nullable=True)        # Operator/Owner from UCS database

def upsert_satellites(session, satellites):
    # Build a single batch INSERT statement for all satellites
    statement = insert(Satellite).values(satellites)
    
    # On conflict, update existing row — excluded refers to the incoming values
    # purpose and description are excluded from set_ so worker never overwrites them
    statement = statement.on_conflict_do_update(
        index_elements=['norad_id'], # conflict on primary key
        set_=dict(
            name=statement.excluded.name,
            object_type=statement.excluded.object_type,
            country=statement.excluded.country,
            launch_date=statement.excluded.launch_date,
            launch_site=statement.excluded.launch_site,
            decay_date=statement.excluded.decay_date,
            current=statement.excluded.current,
            rcs_size=statement.excluded.rcs_size,
            last_updated=datetime.now(timezone.utc)
        )
    )
    print(f"Upserting {len(satellites)} satellites in a single batch")
    session.execute(statement)
    session.commit()
    print("Done")