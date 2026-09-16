const API = 'https://tools.factjack.org/flight-api/aircraft';
const PROFILE_API = 'https://tools.factjack.org/flight-api/profile';
const SCHEDULE_FALLBACKS = [{
  flight_id: 'schedule:SHI4358:2026-09-14', callsign: 'SHI4358', registration: 'EP-FST',
  icao24: '731a74', icao_type: 'B733', model: 'Boeing 737-300',
  start_ts: '2026-09-14T08:55:00Z', end_ts: '2026-09-14T10:55:00Z',
  start_airport_ident: 'MHD', start_airport_name: 'Mashhad',
  end_airport_ident: 'KSH', end_airport_name: 'Kermanshah', point_count: 0,
  scheduled: true, source_label: 'Flugplanroute · keine ADS-B-Spur verfügbar',
  source_url: 'https://www.flightstats.com/v2/flight-tracker/SHI/4358?date=14&month=09&year=2026',
  note: 'Der Flug wurde nach einem Startabbruch mit EP-FSU später mit EP-FST durchgeführt.',
  route_points: [[36.2347265, 59.6397905], [35.982, 57.925], [35.664, 56.184], [35.312, 54.477], [34.948, 52.731], [34.624, 50.892], [34.3459, 47.1581]],
}];
const state = {
  center: [48.2082, 16.3738], radius: 50, aircraft: [], selected: null,
  tracks: new Map(), markers: new Map(), busy: false, historical: null, historyResults: [], profiles: new Map(), licensedUser: '', licensedOrg: '',
};
const $ = (selector) => document.querySelector(selector);
const els = {
  list: $('#aircraftList'), count: $('#aircraftCount'), search: $('#search'),
  connection: $('#connectionText'), dot: $('#liveDot'), toast: $('#toast'),
  empty: $('#emptyDetail'), detail: $('#detail'),
};

const map = L.map('map', { zoomControl: false }).setView(state.center, 8);
L.control.zoom({ position: 'bottomright' }).addTo(map);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 18, crossOrigin: true, attribution: '&copy; OpenStreetMap-Mitwirkende',
}).addTo(map);
const radarCircle = L.circle(state.center, { radius: nmToMeters(state.radius), color: '#6ee7ff', weight: 1, opacity: .5, fillColor: '#163d49', fillOpacity: .08 }).addTo(map);
let routeLine = L.polyline([], { color: '#ffb547', weight: 3, opacity: .9 }).addTo(map);

function nmToMeters(nm) { return nm * 1852; }
function clean(value, fallback = '–') { return value === undefined || value === null || value === '' ? fallback : String(value).trim(); }
function feet(value) { return typeof value === 'number' ? `${Math.round(value).toLocaleString('de-AT')} ft` : clean(value); }
function knots(value) { return typeof value === 'number' ? `${Math.round(value)} kt` : '–'; }
function heading(value) { return typeof value === 'number' ? `${Math.round(value)}°` : '–'; }
function flightName(ac) { return clean(ac.flight, clean(ac.r, ac.hex?.toUpperCase() || 'Unbekannt')); }
function modelName(ac) { return clean(ac.desc, clean(ac.t, 'Modell unbekannt')); }
function showToast(message) { els.toast.textContent = message; els.toast.classList.add('show'); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => els.toast.classList.remove('show'), 2800); }

function markerIcon(ac, selected = false) {
  const track = Number(ac.track) || 0;
  return L.divIcon({
    className: `plane-marker${selected ? ' selected' : ''}`,
    html: `<span style="--heading:${track}deg">✈</span>`, iconSize: [30, 30], iconAnchor: [15, 15],
  });
}

function rememberTrack(ac) {
  if (!Number.isFinite(ac.lat) || !Number.isFinite(ac.lon)) return;
  const points = state.tracks.get(ac.hex) || [];
  const last = points.at(-1);
  if (!last || Math.abs(last.lat - ac.lat) > .00005 || Math.abs(last.lon - ac.lon) > .00005) {
    points.push({ at: Date.now(), lat: ac.lat, lon: ac.lon, alt: Number(ac.alt_baro) || null, speed: Number(ac.gs) || null, track: Number(ac.track) || null });
    if (points.length > 720) points.shift();
    state.tracks.set(ac.hex, points);
  }
}

function updateMarkers() {
  const visible = new Set();
  for (const ac of state.aircraft) {
    if (!Number.isFinite(ac.lat) || !Number.isFinite(ac.lon)) continue;
    visible.add(ac.hex);
    const selected = ac.hex === state.selected;
    let marker = state.markers.get(ac.hex);
    if (!marker) {
      marker = L.marker([ac.lat, ac.lon], { icon: markerIcon(ac, selected), title: flightName(ac) })
        .on('click', () => selectAircraft(ac.hex)).addTo(map);
      state.markers.set(ac.hex, marker);
    } else {
      marker.setLatLng([ac.lat, ac.lon]);
      marker.setIcon(markerIcon(ac, selected));
    }
    marker.bindTooltip(`${flightName(ac)} · ${feet(ac.alt_baro)}`, { direction: 'top', offset: [0, -10] });
  }
  for (const [hex, marker] of state.markers) {
    if (!visible.has(hex)) { map.removeLayer(marker); state.markers.delete(hex); }
  }
  drawSelectedRoute();
}

function renderList() {
  const query = els.search.value.trim().toLowerCase();
  const rows = state.aircraft.filter(ac => [ac.flight, ac.r, ac.t, ac.desc, ac.hex].some(v => String(v || '').toLowerCase().includes(query)));
  els.count.textContent = state.aircraft.length;
  if (!rows.length) {
    els.list.innerHTML = query
      ? `<div class="empty-list">Nicht unter den aktuell sichtbaren Flugzeugen.<button id="searchHistorically" class="secondary">„${escapeHtml(els.search.value.trim())}“ historisch suchen</button></div>`
      : '<div class="empty-list">Im gewählten Bereich wurden keine Flugzeuge empfangen.</div>';
    $('#searchHistorically')?.addEventListener('click', () => {
      $('#historyType').value = 'callsign'; $('#historyQuery').value = els.search.value.trim().toUpperCase();
      document.querySelector('.history-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
      $('#historyForm').requestSubmit();
    });
    return;
  }
  els.list.innerHTML = rows.map(ac => `<button class="aircraft${ac.hex === state.selected ? ' active' : ''}" data-hex="${ac.hex}">
    <span class="aircraft-icon" style="--heading:${Number(ac.track) || 0}deg">✈</span>
    <span class="aircraft-copy"><strong>${escapeHtml(flightName(ac))}</strong><span>${escapeHtml(clean(ac.r))} · ${escapeHtml(modelName(ac))}</span></span>
    <span class="aircraft-data"><b>${feet(ac.alt_baro)}</b><small>${knots(ac.gs)} · ${Number(ac.dst || 0).toFixed(1)} NM</small></span>
  </button>`).join('');
  els.list.querySelectorAll('.aircraft').forEach(button => button.addEventListener('click', () => selectAircraft(button.dataset.hex)));
}

function escapeHtml(value) { const node = document.createElement('span'); node.textContent = value; return node.innerHTML; }
function currentAircraft() { return state.historical?.hex === state.selected ? state.historical : state.aircraft.find(ac => ac.hex === state.selected); }
function selectAircraft(hex) { state.historical = null; state.selected = hex; renderList(); updateMarkers(); renderDetail(); }

async function loadProfile(ac) {
  const key = clean(ac.r, ac.hex).toUpperCase();
  if (!key || key === '–') return null;
  if (state.profiles.has(key)) return state.profiles.get(key);
  try {
    const url = new URL(PROFILE_API); url.searchParams.set('reg', clean(ac.r, '')); url.searchParams.set('hex', clean(ac.hex, '').replace('history:', ''));
    const response = await fetch(url); if (!response.ok) throw new Error('Profil nicht verfügbar');
    const profile = await response.json(); state.profiles.set(key, profile); return profile;
  } catch { const profile = { photo: null }; state.profiles.set(key, profile); return profile; }
}

async function renderProfile(ac) {
  const box = $('#aircraftProfile'); box.hidden = false;
  $('#profileOperator').textContent = clean(ac.ownOp, clean(ac.operator, 'Betreiber nicht erfasst'));
  $('#profileFacts').textContent = `${modelName(ac)} · Typ ${clean(ac.t)} · Mode-S ${clean(ac.hex).toUpperCase()}`;
  $('#profileCredit').textContent = 'Öffentliche Flugzeugdaten'; $('#profilePhoto').hidden = true;
  const profile = await loadProfile(ac); if (currentAircraft()?.hex !== ac.hex) return;
  if (profile?.photo?.data_url) { $('#profilePhoto').src = profile.photo.data_url; $('#profilePhoto').hidden = false; $('#profileCredit').textContent = `Foto: ${profile.photo.photographer} · Planespotters.net`; }
  else $('#profileCredit').textContent = 'Für dieses Kennzeichen ist in der öffentlichen Fotodatenbank kein Bild verfügbar.';
}

function renderDetail() {
  const ac = currentAircraft();
  els.empty.hidden = Boolean(ac); els.detail.hidden = !ac;
  if (!ac) return;
  $('#detailFlight').textContent = flightName(ac);
  $('#detailReg').textContent = clean(ac.r, 'Kein Kennzeichen');
  $('#detailModel').textContent = `${modelName(ac)}${ac.source_label ? ` · ${ac.source_label}` : ''}`;
  $('#detailAltitude').textContent = feet(ac.alt_baro);
  $('#detailSpeed').textContent = knots(ac.gs);
  $('#detailTrack').textContent = heading(ac.track);
  const points = state.tracks.get(ac.hex) || [];
  $('#detailDistance').textContent = `${trackDistance(points).toFixed(1)} km`;
  $('#detailDuration').textContent = trackDuration(points);
  renderProfile(ac);
}

function drawSelectedRoute() {
  const points = state.selected ? state.tracks.get(state.selected) || [] : [];
  routeLine.setLatLngs(points.map(p => [p.lat, p.lon]));
}

function haversine(a, b) {
  const rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
function trackDistance(points) { return points.slice(1).reduce((sum, point, i) => sum + haversine(points[i], point), 0); }
function trackDuration(points) {
  if (points.length < 2) return '< 1 Min.';
  const mins = Math.max(1, Math.round((points.at(-1).at - points[0].at) / 60000));
  return mins < 60 ? `${mins} Min.` : `${Math.floor(mins / 60)} Std. ${mins % 60} Min.`;
}

async function loadAircraft(manual = false) {
  if (state.busy) return;
  state.busy = true;
  if (manual) $('#refresh').textContent = '…';
  try {
    const url = new URL(API); url.searchParams.set('lat', state.center[0]); url.searchParams.set('lon', state.center[1]); url.searchParams.set('dist', state.radius);
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Datenquelle antwortet mit ${response.status}`);
    const data = await response.json();
    state.aircraft = (data.ac || []).filter(ac => ac.hex).sort((a, b) => (a.dst ?? 9999) - (b.dst ?? 9999));
    state.aircraft.forEach(rememberTrack);
    els.dot.classList.add('live'); els.connection.textContent = `Live · ${state.aircraft.length} Flugzeuge`;
    renderList(); updateMarkers(); renderDetail();
  } catch (error) {
    els.dot.classList.remove('live'); els.connection.textContent = 'Daten derzeit nicht erreichbar';
    if (manual) showToast(error.message);
  } finally { state.busy = false; $('#refresh').textContent = '↻'; }
}

function setRadar(lat, lon, radius) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) { showToast('Bitte gültige Koordinaten eingeben.'); return; }
  state.center = [lat, lon]; state.radius = radius;
  radarCircle.setLatLng(state.center).setRadius(nmToMeters(radius));
  map.fitBounds(radarCircle.getBounds(), { padding: [20, 20] });
  loadAircraft(true);
}

function captureMap() { return new Promise((resolve, reject) => window.leafletImage ? window.leafletImage(map, (error, canvas) => error ? reject(error) : resolve(canvas)) : reject(new Error('Kartenexport nicht geladen'))); }

async function exportPdf() {
  const ac = currentAircraft(); if (!ac) return;
  const points = state.tracks.get(ac.hex) || [];
  const profile = await loadProfile(ac);
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const cyan = [15, 139, 166], navy = [7, 18, 25], gray = [95, 112, 122];
  pdf.setFillColor(...navy); pdf.rect(0, 0, 210, 35, 'F');
  pdf.setTextColor(110, 231, 255); pdf.setFontSize(11); pdf.text('FLIGHTRACKER · FLIGHT REPORT', 15, 14);
  pdf.setTextColor(255, 255, 255); pdf.setFontSize(22); pdf.text(flightName(ac), 15, 26);
  pdf.setTextColor(...navy); pdf.setFontSize(13); pdf.text('Flugzeugprofil', 15, 48);
  const fields = [
    ['Kennzeichen', clean(ac.r)], ['ICAO-Adresse', clean(ac.hex).toUpperCase()], ['Modell', modelName(ac)],
    ['Typcode', clean(ac.t)], ['Kategorie', clean(ac.category)], ['Quelle', clean(ac.type)],
    ['Letzte Höhe', feet(ac.alt_baro)], ['Geschwindigkeit', knots(ac.gs)], ['Kurs', heading(ac.track)],
    ['Squawk', clean(ac.squawk)], ['Erfasste Strecke', `${trackDistance(points).toFixed(2)} km`], ['Aufzeichnungszeit', trackDuration(points)],
  ];
  fields.forEach(([label, value], index) => {
    const col = index % 3, row = Math.floor(index / 3), x = 15 + col * 61, y = 58 + row * 17;
    pdf.setTextColor(...gray); pdf.setFontSize(8); pdf.text(label.toUpperCase(), x, y);
    pdf.setTextColor(...navy); pdf.setFontSize(10); pdf.text(String(value), x, y + 5);
  });
  if (profile?.photo?.data_url) {
    try { pdf.addImage(profile.photo.data_url, 'JPEG', 143, 42, 52, 34, undefined, 'FAST'); pdf.setTextColor(...gray); pdf.setFontSize(6.5); pdf.text(`Foto: ${profile.photo.photographer} · Planespotters.net`, 143, 79, { maxWidth: 52 }); } catch {}
  }
  pdf.setFontSize(13); pdf.setTextColor(...navy); pdf.text('Strecke auf OpenStreetMap', 15, 132);
  try {
    if (points.length > 1) map.fitBounds(L.latLngBounds(points.map(point => [point.lat, point.lon])), { padding: [40, 40], animate: false });
    await new Promise(resolve => setTimeout(resolve, 700));
    const canvas = await captureMap(); pdf.addImage(canvas.toDataURL('image/jpeg', .86), 'JPEG', 15, 140, 180, 112, undefined, 'FAST');
    pdf.setTextColor(...gray); pdf.setFontSize(7); pdf.text('Kartendaten © OpenStreetMap-Mitwirkende', 15, 256);
  } catch { drawRoutePdf(pdf, points, 15, 140, 180, 75, cyan, navy); }
  pdf.setTextColor(...gray); pdf.setFontSize(8);
  const source = ac.source_label ? 'Flugplandaten / öffentliche Ereignisberichte' : (ac.historical ? 'adsb.aero / adsb.lol' : 'adsb.fi');
  const license = [state.licensedUser, state.licensedOrg].filter(Boolean).join(' · ');
  pdf.text(`${license ? `User: ${license} · ` : ''}Provided by factjack.org`, 15, 282);
  pdf.text(`Erstellt: ${new Date().toLocaleString('de-AT')} · Daten: ${source} · Nicht zur Navigation verwenden`, 15, 287);
  pdf.save(`Flighttracker-${flightName(ac).replace(/[^a-z0-9_-]+/gi, '-')}-${new Date().toISOString().slice(0, 10)}.pdf`);
  showToast('PDF-Bericht wurde erstellt.');
}

function drawRoutePdf(pdf, points, x, y, width, height, cyan, navy) {
  pdf.setDrawColor(210, 220, 225); pdf.setFillColor(247, 250, 251); pdf.roundedRect(x, y, width, height, 3, 3, 'FD');
  if (points.length < 2) { pdf.setTextColor(95, 112, 122); pdf.setFontSize(10); pdf.text('Für eine Strecke müssen mindestens zwei Positionen empfangen werden.', x + 8, y + height / 2); return; }
  const lats = points.map(p => p.lat), lons = points.map(p => p.lon), minLat = Math.min(...lats), maxLat = Math.max(...lats), minLon = Math.min(...lons), maxLon = Math.max(...lons);
  const pad = 8, dx = Math.max(.0001, maxLon - minLon), dy = Math.max(.0001, maxLat - minLat);
  const mapped = points.map(p => ({ x: x + pad + ((p.lon - minLon) / dx) * (width - 2 * pad), y: y + height - pad - ((p.lat - minLat) / dy) * (height - 2 * pad) }));
  pdf.setDrawColor(...cyan); pdf.setLineWidth(.8);
  for (let i = 1; i < mapped.length; i++) pdf.line(mapped[i - 1].x, mapped[i - 1].y, mapped[i].x, mapped[i].y);
  pdf.setFillColor(57, 191, 121); pdf.circle(mapped[0].x, mapped[0].y, 2, 'F');
  pdf.setFillColor(255, 102, 122); pdf.circle(mapped.at(-1).x, mapped.at(-1).y, 2, 'F');
  pdf.setTextColor(...navy); pdf.setFontSize(7); pdf.text('START', mapped[0].x + 3, mapped[0].y + 1); pdf.text('LETZTE POSITION', mapped.at(-1).x + 3, mapped.at(-1).y + 1);
  pdf.setTextColor(95, 112, 122); pdf.text(`${points[0].lat.toFixed(4)}, ${points[0].lon.toFixed(4)}`, x + 4, y + height - 3);
  pdf.text(`${points.at(-1).lat.toFixed(4)}, ${points.at(-1).lon.toFixed(4)}`, x + width - 47, y + height - 3);
}

function isoDay(date) { return date.toISOString().slice(0, 10); }
function setupHistoryDates() {
  const until = new Date(), from = new Date(); from.setDate(until.getDate() - 7);
  $('#historyTo').value = isoDay(until); $('#historyFrom').value = isoDay(from);
}

async function searchHistory(event) {
  event.preventDefault();
  const type = $('#historyType').value, query = $('#historyQuery').value.trim().toUpperCase();
  const from = $('#historyFrom').value, to = $('#historyTo').value;
  if (!query || !from || !to || from > to) { showToast('Bitte Suchbegriff und gültigen Zeitraum eingeben.'); return; }
  const button = $('#historyForm button'), status = $('#historyStatus');
  const end = new Date(`${to}T00:00:00Z`); end.setUTCDate(end.getUTCDate() + 1);
  const fromTime = new Date(`${from}T00:00:00Z`).getTime(), toTime = end.getTime();
  const fallbacks = SCHEDULE_FALLBACKS.filter(flight => {
    const value = type === 'registration' ? flight.registration : flight.callsign;
    const time = new Date(flight.start_ts).getTime();
    return value.replaceAll('-', '').startsWith(query.replaceAll('-', '')) && time >= fromTime && time < toTime;
  });
  button.disabled = true; button.textContent = 'Suche läuft …'; status.textContent = 'Historisches Archiv wird durchsucht …';
  try {
    const base = {
      match: type === 'registration' ? { registration_prefix: query } : { callsign_prefix: query },
      end_date: end.toISOString(), start_from: `${from}T00:00:00Z`, window_days: 7,
      limit: 50, include_path: false,
    };
    const flights = []; let cursor = null;
    for (let page = 0; page < 5; page++) {
      const response = await fetch('https://adsb.aero/api/v1/query', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cursor ? { ...base, cursor } : base) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || data.hint || 'Historische Suche fehlgeschlagen');
      flights.push(...(data.flights || [])); cursor = data.cursor;
      if (!cursor || flights.length >= 100) break;
    }
    const seen = new Set(flights.map(flight => `${flight.callsign}:${flight.start_ts.slice(0, 10)}`));
    state.historyResults = [...flights, ...fallbacks.filter(flight => !seen.has(`${flight.callsign}:${flight.start_ts.slice(0, 10)}`))].slice(0, 100);
    renderHistoryResults();
    const fallbackCount = state.historyResults.filter(flight => flight.scheduled).length;
    status.textContent = `${state.historyResults.length} Treffer · ${from} bis ${to}${fallbackCount ? ` · ${fallbackCount} Flugplanroute ohne ADS-B-Spur` : ''}`;
  } catch (error) {
    state.historyResults = fallbacks; renderHistoryResults();
    status.textContent = fallbacks.length ? `${fallbacks.length} Flugplanroute · ADS-B-Archiv derzeit nicht erreichbar` : error.message;
    showToast(fallbacks.length ? 'Flugplanroute geladen; ADS-B-Archiv nicht erreichbar.' : error.message);
  } finally { button.disabled = false; button.textContent = 'Historische Flüge suchen'; }
}

function renderHistoryResults() {
  const target = $('#historyResults');
  if (!state.historyResults.length) { target.innerHTML = '<div class="history-empty">Keine historischen Flüge für diese Suche gefunden.</div>'; return; }
  target.innerHTML = state.historyResults.map((flight, index) => {
    const start = new Date(flight.start_ts), end = new Date(flight.end_ts);
    const route = `${clean(flight.start_airport_ident, 'Start unbekannt')} → ${clean(flight.end_airport_ident, 'Ziel unbekannt')}`;
    const evidence = flight.scheduled ? `<small class="schedule-note">${escapeHtml(flight.source_label)}</small>` : `<small>${Number(flight.point_count || 0).toLocaleString('de-AT')} Streckenpunkte</small>`;
    return `<article class="history-result${flight.scheduled ? ' scheduled' : ''}"><div><strong>${escapeHtml(clean(flight.callsign, flight.registration))}</strong><small>${escapeHtml(clean(flight.registration))} · ${escapeHtml(clean(flight.icao24).toUpperCase())}</small></div><div><span>${escapeHtml(clean(flight.model, flight.icao_type))}</span><small>${escapeHtml(route)}</small></div><div><span>${start.toLocaleDateString('de-AT')} · ${start.toLocaleTimeString('de-AT', {hour:'2-digit',minute:'2-digit'})}–${end.toLocaleTimeString('de-AT', {hour:'2-digit',minute:'2-digit'})}</span>${evidence}</div><button data-history-index="${index}">Route öffnen</button></article>`;
  }).join('');
  target.querySelectorAll('[data-history-index]').forEach(button => button.addEventListener('click', () => openHistoricalFlight(state.historyResults[Number(button.dataset.historyIndex)])));
}

async function openHistoricalFlight(summary) {
  showToast('Historische Route wird geladen …');
  try {
    if (summary.scheduled) {
      const start = new Date(summary.start_ts).getTime(), end = new Date(summary.end_ts).getTime();
      const points = summary.route_points.map(([lat, lon], index, all) => ({ at: start + ((end - start) * index / (all.length - 1)), lat, lon, alt: null, speed: null, track: null }));
      const id = summary.flight_id;
      state.historical = { hex: id, flight: summary.callsign, r: summary.registration, t: summary.icao_type, desc: summary.model, historical: true, source_label: summary.source_label, note: summary.note };
      state.selected = id; state.tracks.set(id, points);
      renderList(); updateMarkers(); renderDetail();
      map.fitBounds(L.latLngBounds(points.map(point => [point.lat, point.lon])), { padding: [35, 35] });
      document.querySelector('.detail-panel').scrollIntoView({ behavior: 'smooth', block: 'center' });
      showToast('SHI4358 geladen: MHD → KSH (Flugplanroute).');
      return;
    }
    const response = await fetch(`https://adsb.aero/api/v1/flights/${encodeURIComponent(summary.flight_id)}`);
    const flight = await response.json();
    if (!response.ok) throw new Error(flight.detail || 'Route konnte nicht geladen werden');
    const id = `history:${flight.flight_id}`;
    const points = [];
    const segments = flight.path?.coordinates || [], times = flight.timestamps || [];
    segments.forEach((segment, segmentIndex) => segment.forEach((point, pointIndex) => points.push({ at: Number(times[segmentIndex]?.[pointIndex] || 0) * 1000, lon: Number(point[0]), lat: Number(point[1]), alt: Number(point[2]), speed: null, track: null })));
    const lastSpeed = flight.path_gs?.flat()?.at(-1)?.[1];
    const lastTrack = flight.path_tracks?.flat()?.at(-1)?.[1];
    const lastPoint = points.at(-1) || {};
    state.historical = { hex: id, flight: clean(flight.callsign, flight.registration), r: flight.registration, t: flight.icao_type, desc: flight.model, alt_baro: lastPoint.alt, gs: lastSpeed, track: lastTrack, historical: true };
    state.selected = id; state.tracks.set(id, points);
    renderList(); updateMarkers(); renderDetail();
    if (points.length) map.fitBounds(L.latLngBounds(points.map(point => [point.lat, point.lon])), { padding: [35, 35] });
    document.querySelector('.detail-panel').scrollIntoView({ behavior: 'smooth', block: 'center' });
    showToast(`${points.length.toLocaleString('de-AT')} historische Punkte geladen.`);
  } catch (error) { showToast(error.message); }
}

$('#radarControls').addEventListener('submit', event => { event.preventDefault(); setRadar(Number($('#lat').value), Number($('#lon').value), Number($('#radius').value)); });
$('#locate').addEventListener('click', () => navigator.geolocation ? navigator.geolocation.getCurrentPosition(position => { $('#lat').value = position.coords.latitude.toFixed(4); $('#lon').value = position.coords.longitude.toFixed(4); setRadar(position.coords.latitude, position.coords.longitude, Number($('#radius').value)); }, () => showToast('Standort konnte nicht abgerufen werden.')) : showToast('Standortfunktion wird nicht unterstützt.'));
$('#refresh').addEventListener('click', () => loadAircraft(true));
els.search.addEventListener('input', renderList);
$('#follow').addEventListener('click', () => { const ac = currentAircraft(); if (ac?.lat && ac?.lon) map.setView([ac.lat, ac.lon], Math.max(map.getZoom(), 10)); });
$('#exportPdf').addEventListener('click', exportPdf);
$('#historyForm').addEventListener('submit', searchHistory);
setupHistoryDates();
window.addEventListener('message', event => {
  if (event.origin !== 'https://tools.factjack.org' || event.data?.type !== 'flighttracker-license') return;
  state.licensedUser = String(event.data.user || '').slice(0, 80);
  state.licensedOrg = String(event.data.organisation || '').slice(0, 80);
});
setInterval(() => $('#clock').textContent = new Date().toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit', second: '2-digit' }), 1000);
setInterval(loadAircraft, 5000);
loadAircraft();

if (document.modelContext?.registerTool) {
  const lifecycle = new AbortController();
  Promise.resolve(document.modelContext.registerTool({
    name: 'set_radar_area', title: 'Radargebiet einstellen',
    description: 'Setzt Mittelpunkt und Radius des sichtbaren Flighttracker-Radars und lädt aktuelle Flugzeuge.',
    inputSchema: { type: 'object', properties: { latitude: { type: 'number', minimum: -90, maximum: 90 }, longitude: { type: 'number', minimum: -180, maximum: 180 }, radiusNm: { type: 'number', minimum: 1, maximum: 250 } }, required: ['latitude', 'longitude', 'radiusNm'], additionalProperties: false },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    async execute(input) {
      const { latitude, longitude, radiusNm } = input || {};
      if (![latitude, longitude, radiusNm].every(Number.isFinite)) throw new Error('Ungültige Koordinaten oder ungültiger Radius');
      $('#lat').value = latitude.toFixed(4); $('#lon').value = longitude.toFixed(4); $('#radius').value = String(radiusNm);
      setRadar(latitude, longitude, radiusNm);
      return { latitude, longitude, radiusNm };
    },
  }, { signal: lifecycle.signal })).catch(() => {});
  Promise.resolve(document.modelContext.registerTool({
    name: 'read_visible_aircraft', title: 'Sichtbare Flugzeuge lesen',
    description: 'Liest die aktuell im Flighttracker sichtbaren Flugzeuge mit Flug, Kennzeichen, Modell, Höhe und Geschwindigkeit.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: true },
    execute() { return state.aircraft.map(ac => ({ flight: flightName(ac), registration: clean(ac.r), model: modelName(ac), altitudeFt: ac.alt_baro ?? null, speedKt: ac.gs ?? null, heading: ac.track ?? null })); },
  }, { signal: lifecycle.signal })).catch(() => {});
}
