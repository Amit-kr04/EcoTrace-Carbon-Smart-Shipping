import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip } from 'react-leaflet';
import { kg, fmt } from './ui.jsx';

// Routes drawn as lines whose width and colour scale with total CO2 (light -> dark green ramp).
const RAMP = ['#b9dccb', '#7fbf9f', '#4a9e78', '#237a55', '#0f5135'];

export default function RouteMap({ routes, height }) {
  const max = Math.max(1, ...routes.map((r) => r.co2Kg));
  const places = new Map();
  routes.forEach((r) => {
    places.set(r.from, { name: r.from, city: r.fromCity, ...r.fromPt, co2: (places.get(r.from)?.co2 || 0) + r.co2Kg });
    if (!places.has(r.to)) places.set(r.to, { name: r.to, city: r.toCity, ...r.toPt, co2: 0 });
  });
  const sorted = [...routes].sort((a, b) => a.co2Kg - b.co2Kg);
  return (
    <MapContainer center={[22, 79]} zoom={5} scrollWheelZoom={false} className="map" style={height ? { height } : undefined}>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {sorted.map((r) => {
        const t = r.co2Kg / max;
        const color = RAMP[Math.min(RAMP.length - 1, Math.floor(Math.sqrt(t) * RAMP.length))];
        return (
          <Polyline key={`${r.from}-${r.to}`} positions={[[r.fromPt.lat, r.fromPt.lng], [r.toPt.lat, r.toPt.lng]]} pathOptions={{ color, weight: 2 + Math.sqrt(t) * 7, opacity: 0.85 }}>
            <Tooltip sticky>
              <b>{r.fromCity} → {r.toCity}</b><br />
              {r.from} → {r.to}<br />
              {kg(r.co2Kg)} CO2e · {fmt(r.shipments)} shipments · {fmt(r.distanceKm)} km<br />
              Modes: {r.modes?.join(', ')}
            </Tooltip>
          </Polyline>
        );
      })}
      {[...places.values()].map((p) => (
        <CircleMarker key={p.name} center={[p.lat, p.lng]} radius={5} pathOptions={{ color: '#ffffff', weight: 2, fillColor: '#15201b', fillOpacity: 1 }}>
          <Tooltip>{p.name} ({p.city})</Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}

export function MapLegend() {
  return (
    <div className="legend">
      <span>Route CO2e:</span>
      <span>low</span>
      {RAMP.map((c) => <i key={c} style={{ background: c, width: 22, height: 6, borderRadius: 2 }} />)}
      <span>high</span>
    </div>
  );
}
