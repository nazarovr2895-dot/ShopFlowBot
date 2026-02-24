"""
Import Moscow metro stations from OpenStreetMap (Overpass API).
Compares with existing DB and adds missing stations.
Run inside backend container: python3 scripts/import_osm_metro.py
"""
import json
import os
import psycopg2
from urllib.request import urlopen, Request
from urllib.parse import urlencode

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

# Overpass QL: all subway + MCC light_rail stations in Moscow
QUERY = """
[out:json][timeout:30];
area[name="Москва"][admin_level=4]->.moscow;
(
  node["station"="subway"](area.moscow);
  node["station"="light_rail"]["network"~"Московский метрополитен|МЦК"](area.moscow);
);
out body;
"""


def fetch_osm_stations():
    """Fetch metro stations from OpenStreetMap Overpass API."""
    data = urlencode({"data": QUERY}).encode()
    req = Request(OVERPASS_URL, data=data)
    resp = urlopen(req, timeout=60)
    result = json.loads(resp.read())

    stations = []
    seen = set()
    for el in result.get("elements", []):
        tags = el.get("tags", {})
        name = tags.get("name")
        if not name or name in seen:
            continue
        seen.add(name)
        stations.append({
            "name": name,
            "lat": el.get("lat"),
            "lon": el.get("lon"),
            "colour": tags.get("colour", ""),
            "line": tags.get("line", ""),
            "network": tags.get("network", ""),
        })
    return stations


def main():
    print("Fetching metro stations from OpenStreetMap...")
    osm_stations = fetch_osm_stations()
    print(f"  OSM returned: {len(osm_stations)} unique stations")

    # Connect to DB
    db_password = os.environ.get("DB_PASSWORD", "postgres")
    conn = psycopg2.connect(host="db", dbname="flurai", user="postgres", password=db_password)
    cur = conn.cursor()

    # Get existing stations
    cur.execute("SELECT name FROM metro_stations WHERE city_id = 1")
    existing = {row[0] for row in cur.fetchall()}
    print(f"  Already in DB: {len(existing)} stations")

    # Find missing
    missing = [s for s in osm_stations if s["name"] not in existing]
    missing.sort(key=lambda x: x["name"])
    print(f"  Missing from DB: {len(missing)}")

    if not missing:
        print("Nothing to add!")
        conn.close()
        return

    for s in missing:
        print(f'    + {s["name"]} ({s["lat"]}, {s["lon"]})')

    # Insert missing stations
    added = 0
    for s in missing:
        colour = s.get("colour", "")
        if colour and not colour.startswith("#"):
            colour = f"#{colour}"
        line_name = s.get("line") or s.get("network") or None

        cur.execute(
            """INSERT INTO metro_stations (name, city_id, geo_lat, geo_lon, line_color, line_name)
               VALUES (%s, 1, %s, %s, %s, %s)""",
            (s["name"], s["lat"], s["lon"], colour or None, line_name),
        )
        added += 1

    conn.commit()
    print(f"\n  Added {added} new stations!")

    # Show totals
    cur.execute("SELECT COUNT(*) FROM metro_stations WHERE city_id = 1")
    total = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM metro_stations WHERE city_id = 1 AND district_id IS NOT NULL")
    with_district = cur.fetchone()[0]
    print(f"  Total in DB now: {total}")
    print(f"  With district: {with_district}")

    # Also show what's in DB but not in OSM (MCD stations etc.)
    osm_names = {s["name"] for s in osm_stations}
    extra = sorted(existing - osm_names)
    print(f"\n  In DB but not in OSM (MCD/other): {len(extra)}")

    conn.close()


if __name__ == "__main__":
    main()
