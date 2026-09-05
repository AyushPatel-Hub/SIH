import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

export default function MapView({
  floodMapData,
  routeData,
  hotspots,
  onSelectHotspot,
}) {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);

  // 1. Initialize MapLibre GL
  useEffect(() => {
    if (mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          'osm-dark': {
            type: 'raster',
            tiles: [
              'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            ],
            tileSize: 256,
            maxzoom: 19,
          },
        },
        layers: [
          {
            id: 'osm-dark-base',
            type: 'raster',
            source: 'osm-dark',
            paint: {
              'raster-brightness-max': 0.65,
              'raster-brightness-min': 0.08,
              'raster-contrast': 0.28,
              'raster-saturation': -0.85,
            },
          },
        ],
      },
      center: [80.9420, 26.9240],
      zoom: 13.8,
      pitch: 45,
      bearing: -10,
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    mapRef.current = map;

    map.on('load', () => {
      // Add empty source for flood GeoJSON
      map.addSource('flood-network', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      // Flood Line Layer (Road Segments)
      map.addLayer({
        id: 'flood-lines',
        type: 'line',
        source: 'flood-network',
        filter: ['==', '$type', 'LineString'],
        paint: {
          'line-width': [
            'interpolate',
            ['linear'],
            ['zoom'],
            12, 2.5,
            16, 7.0
          ],
          'line-color': [
            'case',
            ['>=', ['get', 'flood_depth_m'], 0.30],
            '#ef4444',
            ['>=', ['get', 'flood_depth_m'], 0.12],
            '#f59e0b',
            '#0284c7'
          ],
          'line-opacity': 0.85,
        },
      });

      // Flood Node Layer (Manholes)
      map.addLayer({
        id: 'flood-nodes',
        type: 'circle',
        source: 'flood-network',
        filter: ['==', '$type', 'Point'],
        paint: {
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            12, 3,
            16, 8
          ],
          'circle-color': [
            'case',
            ['>=', ['get', 'flood_depth_m'], 0.30],
            '#dc2626',
            ['>=', ['get', 'flood_depth_m'], 0.12],
            '#d97706',
            '#06b6d4'
          ],
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#ffffff',
        },
      });

      // Evacuation Route Source & Layer
      map.addSource('evacuation-route', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      // Route Casing (Black outline)
      map.addLayer({
        id: 'route-casing',
        type: 'line',
        source: 'evacuation-route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#000000',
          'line-width': 8,
          'line-opacity': 0.8,
        },
      });

      // Route Core (Vibrant Green)
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'evacuation-route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#10b981',
          'line-width': 5,
          'line-opacity': 0.95,
        },
      });

      // Click event for road segments & nodes
      map.on('click', 'flood-lines', (e) => {
        if (!e.features || e.features.length === 0) return;
        const feat = e.features[0];
        const depth = feat.properties.flood_depth_m || 0;
        const risk = feat.properties.risk_level || 'NORMAL';
        const length = feat.properties.length_m || 'N/A';

        new maplibregl.Popup({ closeButton: true, className: 'eoc-popup' })
          .setLngLat(e.lngLat)
          .setHTML(`
            <div style="background:#111827; color:#f9fafb; padding:10px; border-radius:6px; font-family:sans-serif; font-size:12px;">
              <strong style="color:#0ea5e9; text-transform:uppercase;">Road Drainage Segment</strong>
              <div style="margin-top:4px;">Water Depth: <strong style="color:${depth >= 0.3 ? '#ef4444' : '#10b981'}">${depth} m</strong></div>
              <div>Risk Tier: <span style="font-weight:600;">${risk}</span></div>
              <div>Length: ${length} m</div>
            </div>
          `)
          .addTo(map);
      });
    });

    return () => {
      map.remove();
    };
  }, []);

  // 2. Update Flood Map Data
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    if (map.isStyleLoaded() && floodMapData && floodMapData.features) {
      const src = map.getSource('flood-network');
      if (src) src.setData(floodMapData);
    }
  }, [floodMapData]);

  // 3. Update Evacuation Route
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    if (map.isStyleLoaded()) {
      const src = map.getSource('evacuation-route');
      if (src) {
        if (routeData && routeData.route_geojson) {
          src.setData(routeData.route_geojson);
          // Fit bounds to route
          if (routeData.route_coordinates && routeData.route_coordinates.length > 1) {
            const bounds = new maplibregl.LngLatBounds();
            routeData.route_coordinates.forEach((coord) => bounds.extend(coord));
            map.fitBounds(bounds, { padding: 80, maxZoom: 16 });
          }
        } else {
          src.setData({ type: 'FeatureCollection', features: [] });
        }
      }
    }
  }, [routeData]);

  // 4. Update Hotspot Markers
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    // Clear old markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    if (!hotspots) return;

    Object.entries(hotspots).forEach(([key, info]) => {
      const isCritical = info.current_status === 'CRITICAL_ALERT';
      
      const el = document.createElement('div');
      el.style.width = '24px';
      el.style.height = '24px';
      el.style.borderRadius = '50%';
      el.style.backgroundColor = isCritical ? '#dc2626' : '#0284c7';
      el.style.border = '2px solid #ffffff';
      el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.6)';
      el.style.cursor = 'pointer';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';
      el.style.color = '#ffffff';
      el.style.fontSize = '10px';
      el.style.fontWeight = 'bold';
      el.innerText = key.charAt(0).toUpperCase();

      const popup = new maplibregl.Popup({ offset: 20 }).setHTML(`
        <div style="background:#111827; color:#f9fafb; padding:10px; border-radius:6px; font-family:sans-serif; font-size:12px; min-width:180px;">
          <strong style="color:#0ea5e9;">${info.name}</strong>
          <div style="margin-top:6px;">Baseline Elevation: <strong>${info.baseline_elevation_m} m</strong></div>
          <div>Threshold Limit: <strong>${info.critical_depth_threshold_m} m</strong></div>
          <div style="margin-top:4px;">Status: <span style="font-weight:700; color:${isCritical ? '#ef4444' : '#10b981'}">${info.current_status}</span></div>
        </div>
      `);

      el.addEventListener('click', () => {
        if (onSelectHotspot) onSelectHotspot(key, info);
      });

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([info.lon, info.lat])
        .setPopup(popup)
        .addTo(map);

      markersRef.current.push(marker);
    });
  }, [hotspots, onSelectHotspot]);

  return (
    <div className="map-canvas-container">
      <div ref={mapContainer} className="maplibre-viewport" />

      {/* Map Legend */}
      <div className="map-legend-overlay">
        <div className="legend-title">Hydraulic Risk Legend</div>
        <div className="legend-row">
          <div className="legend-dot" style={{ backgroundColor: '#ef4444' }}></div>
          <span>Submerged (&gt;0.30m) • Closed</span>
        </div>
        <div className="legend-row">
          <div className="legend-dot" style={{ backgroundColor: '#f59e0b' }}></div>
          <span>Waterlogged (0.12m - 0.30m)</span>
        </div>
        <div className="legend-row">
          <div className="legend-dot" style={{ backgroundColor: '#0284c7' }}></div>
          <span>Normal Discharge Flow</span>
        </div>
        <div className="legend-row">
          <div className="legend-dot" style={{ backgroundColor: '#10b981', height: '4px' }}></div>
          <span>Flood-Safe Evacuation Path</span>
        </div>
      </div>
    </div>
  );
}
