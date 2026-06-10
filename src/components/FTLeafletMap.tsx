'use client';

// This file is loaded via dynamic() with { ssr: false } — safe to import Leaflet here
import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Contact } from '@/lib/ft/parser';

function makeIcon(color: string) {
  return L.divIcon({
    className: '',
    html: `<div style="width:11px;height:11px;background:${color};border:2px solid rgba(0,0,0,0.55);border-radius:50%;box-shadow:0 0 7px ${color}88;"></div>`,
    iconSize: [11, 11],
    iconAnchor: [5, 5],
    popupAnchor: [0, -9],
  });
}

// Start zoomed out so the entire world fits the container
function FitWorld() {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    map.fitWorld();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

// Fit map to all located contacts whenever a new one is added
function AutoBounds({ count }: { count: number }) {
  const map = useMap();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { map.invalidateSize(); }, [count]);
  return null;
}

interface Props {
  contacts: Map<string, Contact>;
  onSelect?: (callsign: string) => void;
}

export default function FTLeafletMap({ contacts, onSelect }: Props) {
  const markers = Array.from(contacts.values()).filter(c => c.latLon);

  return (
    <MapContainer
      center={[20, 0]}
      zoom={1}
      minZoom={0}
      maxZoom={12}
      zoomSnap={0.25}
      style={{ height: '100%', width: '100%' }}
      zoomControl={false}
      scrollWheelZoom={true}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        subdomains="abcd"
        maxZoom={19}
      />
      <FitWorld />
      <AutoBounds count={markers.length} />
      {markers.map(c => {
        const [lat, lon] = c.latLon!;
        const txCount = c.msgs.filter(m => m.role === 'tx').length;
        const rxCount = c.msgs.filter(m => m.role === 'rx').length;
        return (
          <Marker key={c.callsign} position={[lat, lon]} icon={makeIcon(c.color)}>
            <Popup>
              <div style={{ fontFamily: 'monospace', minWidth: 110 }}>
                <div
                  style={{ color: c.color, fontWeight: 'bold', fontSize: 13, cursor: onSelect ? 'pointer' : undefined }}
                  title="Show contact details"
                  onClick={() => onSelect?.(c.callsign)}
                >
                  {c.callsign}
                </div>
                {c.grid && <div style={{ color: '#8b949e', fontSize: 11 }}>{c.grid}</div>}
                <div style={{ color: '#484f58', fontSize: 10, marginTop: 3 }}>
                  {txCount > 0 && <span>{txCount} tx</span>}
                  {txCount > 0 && rxCount > 0 && <span> · </span>}
                  {rxCount > 0 && <span>{rxCount} rx</span>}
                </div>
                {c.peers.size > 0 && (
                  <div style={{ color: '#484f58', fontSize: 10 }}>
                    worked:{' '}
                    {Array.from(c.peers).map(p => (
                      <span
                        key={p}
                        style={{ cursor: onSelect ? 'pointer' : undefined, textDecoration: 'underline', marginRight: 4 }}
                        onClick={() => onSelect?.(p)}
                      >
                        {p}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
