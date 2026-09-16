#!/usr/bin/env python3
import base64
import json
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

HOST = '172.18.0.1'
PORT = 8792
CACHE = {}
LOCK = threading.Lock()
ALLOWED_ORIGINS = {'https://handl08.github.io', 'http://127.0.0.1:4173', 'http://localhost:4173'}


def bounded_number(query, name, default, minimum, maximum):
    try:
        value = float(query.get(name, [default])[0])
    except (TypeError, ValueError):
        raise ValueError(f'Ungültiger Wert für {name}')
    if not minimum <= value <= maximum:
        raise ValueError(f'{name} außerhalb des gültigen Bereichs')
    return value


LIVE_SOURCES = {
    'adsb.fi': 'https://opendata.adsb.fi/api/v3/lat/{lat:.4f}/lon/{lon:.4f}/dist/{dist:g}',
    'adsb.lol': 'https://api.adsb.lol/v2/point/{lat:.4f}/{lon:.4f}/{dist:g}',
}


def fetch_live_source(name, template, lat, lon, dist):
    url = template.format(lat=lat, lon=lon, dist=dist)
    request = urllib.request.Request(url, headers={'User-Agent': 'Flighttracker/1.0 (+https://tools.factjack.org/flighttracker)'})
    with urllib.request.urlopen(request, timeout=12) as response:
        data = json.loads(response.read())
    return name, data.get('ac', [])


def aircraft(lat, lon, dist):
    key = (round(lat, 4), round(lon, 4), round(dist, 1))
    with LOCK:
        cached = CACHE.get(key)
        if cached and time.time() - cached[0] < 4.5:
            return cached[1]
    merged = {}
    active_sources = []
    with ThreadPoolExecutor(max_workers=len(LIVE_SOURCES)) as pool:
        futures = [pool.submit(fetch_live_source, name, template, lat, lon, dist) for name, template in LIVE_SOURCES.items()]
        for future in as_completed(futures):
            try:
                name, rows = future.result()
                active_sources.append(name)
                for row in rows:
                    hex_code = str(row.get('hex') or '').lower().strip()
                    if not hex_code:
                        continue
                    if hex_code not in merged:
                        merged[hex_code] = dict(row)
                        merged[hex_code]['_sources'] = [name]
                    else:
                        current = merged[hex_code]
                        current['_sources'].append(name)
                        for field, value in row.items():
                            if current.get(field) in (None, '', '–') and value not in (None, ''):
                                current[field] = value
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
                continue
    result = json.dumps({'ac': list(merged.values()), 'total': len(merged), 'now': int(time.time()), 'sources': sorted(active_sources)}, separators=(',', ':')).encode()
    with LOCK:
        CACHE[key] = (time.time(), result)
        if len(CACHE) > 100:
            oldest = min(CACHE, key=lambda item: CACHE[item][0])
            CACHE.pop(oldest, None)
    return result


def aircraft_profile(registration):
    if not registration or len(registration) > 16:
        return b'{"photo":null}'
    url = f'https://api.planespotters.net/pub/photos/reg/{registration}'
    request = urllib.request.Request(url, headers={'User-Agent': 'Flighttracker/1.0 (+https://tools.factjack.org/flighttracker)'})
    with urllib.request.urlopen(request, timeout=12) as response:
        data = json.loads(response.read())
    photo = (data.get('photos') or [None])[0]
    if not photo:
        return b'{"photo":null}'
    image_url = (photo.get('thumbnail_large') or photo.get('thumbnail') or {}).get('src')
    image_request = urllib.request.Request(image_url, headers={'User-Agent': 'Flighttracker/1.0 (+https://tools.factjack.org/flighttracker)'})
    with urllib.request.urlopen(image_request, timeout=12) as response:
        image = response.read()
        mime = response.headers.get_content_type()
    result = {'photo': {'data_url': f'data:{mime};base64,{base64.b64encode(image).decode()}', 'photographer': photo.get('photographer') or 'Unbekannt', 'link': photo.get('link')}}
    return json.dumps(result, separators=(',', ':')).encode()


class Handler(BaseHTTPRequestHandler):
    def reply(self, status, body, content_type='application/json'):
        origin = self.headers.get('Origin', '')
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Cache-Control', 'no-store')
        if origin in ALLOWED_ORIGINS:
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == '/health':
            self.reply(200, b'ok', 'text/plain')
            return
        if parsed.path == '/profile':
            try:
                query = parse_qs(parsed.query)
                self.reply(200, aircraft_profile(query.get('reg', [''])[0].strip().upper()))
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
                self.reply(200, b'{"photo":null}')
            return
        if parsed.path != '/aircraft':
            self.reply(404, b'{"error":"Not found"}')
            return
        try:
            query = parse_qs(parsed.query)
            lat = bounded_number(query, 'lat', 48.2082, -90, 90)
            lon = bounded_number(query, 'lon', 16.3738, -180, 180)
            dist = bounded_number(query, 'dist', 50, 1, 250)
            self.reply(200, aircraft(lat, lon, dist))
        except ValueError as exc:
            self.reply(400, json.dumps({'error': str(exc)}).encode())
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
            self.reply(502, b'{"error":"Flugdaten derzeit nicht erreichbar"}')

    def log_message(self, fmt, *args):
        return


ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
