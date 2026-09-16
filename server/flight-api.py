#!/usr/bin/env python3
import json
import threading
import time
import urllib.error
import urllib.request
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


def aircraft(lat, lon, dist):
    key = (round(lat, 4), round(lon, 4), round(dist, 1))
    with LOCK:
        cached = CACHE.get(key)
        if cached and time.time() - cached[0] < 4.5:
            return cached[1]
    url = f'https://opendata.adsb.fi/api/v3/lat/{lat:.4f}/lon/{lon:.4f}/dist/{dist:g}'
    request = urllib.request.Request(url, headers={'User-Agent': 'Flighttracker personal flight radar/1.0'})
    with urllib.request.urlopen(request, timeout=12) as response:
        payload = response.read()
    data = json.loads(payload)
    result = json.dumps({'ac': data.get('ac', []), 'total': data.get('total'), 'now': int(time.time())}, separators=(',', ':')).encode()
    with LOCK:
        CACHE[key] = (time.time(), result)
        if len(CACHE) > 100:
            oldest = min(CACHE, key=lambda item: CACHE[item][0])
            CACHE.pop(oldest, None)
    return result


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
