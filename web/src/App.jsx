import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { CloudRain, Zap, MapPin, Navigation, AlertTriangle, ShieldCheck, Activity } from 'lucide-react';

export default function App() {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const [rainRate, setRainRate] = useState(85);
  const [duration, setDuration] = useState(1.5);
  const [telemetry, setTelemetry] = useState({
    status: 'READY',
    latency: '4.5 ms',
    maxDepth: '0.18 m',
    closedRoads: '0 Segments'
  });
  const [alert, setAlert] = useState({
    title: 'URBAN DRAINAGE SURCHARGE ADVISORY',
    desc: 'Monitoring real-time convective storm bands across Jankipuram Sector F & Extension.'
  });

  useEffect(() => {
    if (map.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          'osm-dark': {
            type: 'raster',
            tiles: [
              'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
            ],
            tileSize: 256,
            maxzoom: 19
          }
        },
        layers: [
          {
            id: 'osm-dark-layer',
            type: 'raster',
            source: 'osm-dark',
            paint: {
              'raster-brightness-max': 0.68,
              'raster-brightness-min': 0.08,
              'raster-contrast': 0.25,
              'raster-saturation': -0.85
            }
          }
        ]
      },
      center: [80.9420, 26.9240],
      zoom: 13.5,
      pitch: 45
    });

    map.current.addControl(new maplibregl.NavigationControl(), 'top-right');
  }, []);

  const handleNowcast = async () => {
    try {
      const res = await fetch('http://localhost:8000/predict_flooding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rain_intensity_mm_hr: Number(rainRate),
          duration_hrs: Number(duration),
          amc_level: 2
        })
      });
      const data = await res.json();
      setTelemetry({
        status: data.system_status,
        latency: `${data.total_latency_ms} ms`,
        maxDepth: `${data.metrics?.max_predicted_flood_depth_m} m`,
        closedRoads: `${data.road_status?.closed_segments} Segments`
      });
      if (data.alerts?.length > 0) {
        setAlert({
          title: data.alerts[0].headline,
          desc: data.alerts[0].description
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', position: 'relative' }}>
      <div ref={mapContainer} style={{ flex: 1, width: '100%', height: '100%' }} />

      {/* Control Sidebar */}
      <div style={{
        position: 'absolute',
        top: 20,
        left: 20,
        width: 380,
        background: 'rgba(15, 23, 42, 0.85)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: 16,
        padding: 24,
        zIndex: 10,
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        gap: 16
      }}>
        <div>
          <span style={{ fontSize: 11, background: '#0ea5e926', color: '#0ea5e9', padding: '4px 8px', borderRadius: 8, fontWeight: 700 }}>
            SIH 2026 • AI Urban Floods
          </span>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 6 }}>Jankipuram Nowcast</h2>
          <p style={{ fontSize: 12, color: '#94a3b8' }}>Multi-Agent Flood Prediction & Routing</p>
        </div>

        {/* Sliders */}
        <div style={{ background: 'rgba(255, 255, 255, 0.04)', padding: 14, borderRadius: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
            <span>Rainfall Intensity</span>
            <span style={{ color: '#06b6d4', fontWeight: 600 }}>{rainRate} mm/hr</span>
          </div>
          <input
            type="range"
            min="15"
            max="160"
            value={rainRate}
            onChange={(e) => setRainRate(e.target.value)}
            style={{ width: '100%' }}
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 10, marginBottom: 4 }}>
            <span>Storm Duration</span>
            <span style={{ color: '#06b6d4', fontWeight: 600 }}>{duration} hrs</span>
          </div>
          <input
            type="range"
            min="0.5"
            max="5"
            step="0.5"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            style={{ width: '100%' }}
          />

          <button
            onClick={handleNowcast}
            style={{
              width: '100%',
              marginTop: 14,
              padding: 10,
              background: '#0ea5e9',
              border: 'none',
              borderRadius: 8,
              color: '#fff',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Run Nowcast Model
          </button>
        </div>
      </div>
    </div>
  );
}
