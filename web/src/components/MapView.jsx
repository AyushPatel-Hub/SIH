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

      // Cursor pointer styling on hover
      const setPointer = () => { map.getCanvas().style.cursor = 'pointer'; };
      const resetPointer = () => { map.getCanvas().style.cursor = ''; };

      map.on('mouseenter', 'flood-lines', setPointer);
      map.on('mouseleave', 'flood-lines', resetPointer);
      map.on('mouseenter', 'flood-nodes', setPointer);
      map.on('mouseleave', 'flood-nodes', resetPointer);

      // Click event for road segments (LineString)
      map.on('click', 'flood-lines', (e) => {
        if (!e.features || e.features.length === 0) return;
        const feat = e.features[0];
        const depth = parseFloat(feat.properties.flood_depth_m) || 0;
        const length = feat.properties.length_m ? `${parseFloat(feat.properties.length_m).toFixed(1)} m` : 'N/A';

        // Accurately determine risk tier and colors matching the hydraulic model thresholds
        let tierName = 'NORMAL DISCHARGE (SAFE)';
        let tierColor = '#0ea5e9'; // Blue / Cyan
        let badgeBg = 'rgba(14, 165, 233, 0.15)';
        let advisory = 'Clear corridor • Normal storm drainage capacity';

        if (depth >= 0.30 || feat.properties.status === 'CLOSED_IMPASSABLE') {
          tierName = 'SUBMERGED (CLOSED)';
          tierColor = '#ef4444'; // Red
          badgeBg = 'rgba(239, 68, 68, 0.2)';
          advisory = 'Hazardous depth (>30cm) • Route closed to traffic';
        } else if (depth >= 0.12 || feat.properties.status === 'CAUTION_WATERLOGGED') {
          tierName = 'WATERLOGGED (CAUTION)';
          tierColor = '#f59e0b'; // Amber / Yellow
          badgeBg = 'rgba(245, 158, 11, 0.2)';
          advisory = 'Water ponding (12-30cm) • Drive with caution';
        }

        new maplibregl.Popup({ closeButton: true, className: 'eoc-popup' })
          .setLngLat(e.lngLat)
          .setHTML(`
            <div style="background:#111827; color:#f9fafb; padding:12px; border-radius:8px; font-family:Inter,sans-serif; font-size:12px; min-width:210px; border:1px solid rgba(255,255,255,0.1); box-shadow:0 8px 24px rgba(0,0,0,0.5);">
              <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
                <span style="color:#94a3b8; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px;">Road Segment</span>
                <span style="font-size:10px; font-weight:700; color:${tierColor}; background:${badgeBg}; padding:2px 6px; border-radius:4px; border:1px solid ${tierColor}40;">
                  ${tierName}
                </span>
              </div>
              <div style="margin-bottom:6px; display:flex; justify-content:space-between; align-items:baseline;">
                <span style="color:#94a3b8;">Water Depth:</span>
                <strong style="color:${tierColor}; font-size:14px; font-weight:700;">${depth.toFixed(3)} m</strong>
              </div>
              <div style="margin-bottom:6px; display:flex; justify-content:space-between; align-items:baseline;">
                <span style="color:#94a3b8;">Corridor Length:</span>
                <span style="font-weight:600; color:#e2e8f0;">${length}</span>
              </div>
              <div style="margin-top:8px; padding-top:6px; border-top:1px solid rgba(255,255,255,0.08); font-size:11px; color:#cbd5e1; line-height:1.3;">
                ${advisory}
              </div>
            </div>
          `)
          .addTo(map);
      });

      // Click event for drainage nodes / manholes (Point)
      map.on('click', 'flood-nodes', (e) => {
        if (!e.features || e.features.length === 0) return;
        const feat = e.features[0];
        const depth = parseFloat(feat.properties.flood_depth_m) || 0;
        const surcharge = parseFloat(feat.properties.surcharge_m3) || 0;
        const nodeName = feat.properties.name || feat.properties.node_id || 'Drainage Node';
        const elevation = feat.properties.elevation_m ? `${parseFloat(feat.properties.elevation_m).toFixed(1)} m` : 'N/A';

        let tierName = 'SAFE (NORMAL)';
        let tierColor = '#06b6d4'; // Cyan
        let badgeBg = 'rgba(6, 182, 212, 0.15)';

        if (depth >= 0.30 || feat.properties.severity_level === 'HIGH_RISK_ALERT') {
          tierName = 'CRITICAL SURCHARGE';
          tierColor = '#dc2626'; // Red
          badgeBg = 'rgba(220, 38, 38, 0.2)';
        } else if (depth >= 0.12 || feat.properties.severity_level === 'MODERATE_WARNING') {
          tierName = 'MODERATE WARNING';
          tierColor = '#d97706'; // Amber
          badgeBg = 'rgba(217, 119, 6, 0.2)';
        }

        new maplibregl.Popup({ closeButton: true, className: 'eoc-popup' })
          .setLngLat(e.lngLat)
          .setHTML(`
            <div style="background:#111827; color:#f9fafb; padding:12px; border-radius:8px; font-family:Inter,sans-serif; font-size:12px; min-width:210px; border:1px solid rgba(255,255,255,0.1); box-shadow:0 8px 24px rgba(0,0,0,0.5);">
              <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
                <span style="color:#94a3b8; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px;">Drainage Node</span>
                <span style="font-size:10px; font-weight:700; color:${tierColor}; background:${badgeBg}; padding:2px 6px; border-radius:4px; border:1px solid ${tierColor}40;">
                  ${tierName}
                </span>
              </div>
              <div style="font-weight:600; color:#f1f5f9; margin-bottom:6px; font-size:13px;">${nodeName}</div>
              <div style="margin-bottom:4px; display:flex; justify-content:space-between;">
                <span style="color:#94a3b8;">Ponding Depth:</span>
                <strong style="color:${tierColor}; font-size:13px;">${depth.toFixed(3)} m</strong>
              </div>
              <div style="margin-bottom:4px; display:flex; justify-content:space-between;">
                <span style="color:#94a3b8;">Surcharge Volume:</span>
                <span style="font-weight:600; color:#e2e8f0;">${surcharge.toFixed(1)} m³</span>
              </div>
              <div style="display:flex; justify-content:space-between;">
                <span style="color:#94a3b8;">Elevation:</span>
                <span style="color:#e2e8f0;">${elevation}</span>
              </div>
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
