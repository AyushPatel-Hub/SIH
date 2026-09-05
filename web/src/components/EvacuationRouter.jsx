import React, { useState } from 'react';
import { Navigation, ShieldCheck, AlertCircle, ArrowRight, Route } from 'lucide-react';

export default function EvacuationRouter({
  hotspots,
  onComputeRoute,
  isComputing,
  routeResult,
  onClearRoute,
}) {
  const [originKey, setOriginKey] = useState('engineering_college_chauraha');
  const [destKey, setDestKey] = useState('aktu_sewa_hospital');

  const handleRoute = () => {
    if (!hotspots || !hotspots[originKey] || !hotspots[destKey]) return;
    const origin = hotspots[originKey];
    const dest = hotspots[destKey];
    onComputeRoute({
      origin_lat: origin.lat,
      origin_lon: origin.lon,
      dest_lat: dest.lat,
      dest_lon: dest.lon,
    });
  };

  return (
    <div className="form-section">
      <div className="form-section-title">
        <span>Flood-Safe Evacuation Router</span>
        <Route size={14} color="#06b6d4" />
      </div>

      <div className="form-group">
        <label className="form-label">
          <span>Origin Hub</span>
        </label>
        <select
          className="form-select"
          value={originKey}
          onChange={(e) => setOriginKey(e.target.value)}
        >
          {hotspots &&
            Object.entries(hotspots).map(([k, v]) => (
              <option key={k} value={k}>
                {v.name}
              </option>
            ))}
        </select>
      </div>

      <div className="form-group">
        <label className="form-label">
          <span>Destination (Safe Haven / Hospital)</span>
        </label>
        <select
          className="form-select"
          value={destKey}
          onChange={(e) => setDestKey(e.target.value)}
        >
          {hotspots &&
            Object.entries(hotspots).map(([k, v]) => (
              <option key={k} value={k}>
                {v.name}
              </option>
            ))}
        </select>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
        <button
          className="btn-primary"
          style={{ flex: 1 }}
          onClick={handleRoute}
          disabled={isComputing || originKey === destKey}
        >
          <Navigation size={13} />
          {isComputing ? 'Calculating...' : 'Compute Safe Route'}
        </button>

        {routeResult && (
          <button className="btn-secondary" onClick={onClearRoute}>
            Clear
          </button>
        )}
      </div>

      {routeResult && (
        <div
          style={{
            marginTop: '14px',
            backgroundColor: '#111827',
            border: '1px solid #374151',
            borderRadius: '6px',
            padding: '12px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '8px',
            }}
          >
            <span style={{ fontSize: '11px', textTransform: 'uppercase', color: '#9ca3af' }}>
              Evacuation Clearance
            </span>
            <span
              className="status-pill"
              style={{
                backgroundColor: routeResult.status === 'SUCCESS' ? '#064e3b' : '#7f1d1d',
                color: routeResult.status === 'SUCCESS' ? '#34d399' : '#f87171',
                border: 'none',
              }}
            >
              {routeResult.status === 'SUCCESS' ? 'CLEAR ROUTE IDENTIFIED' : 'NO SAFE PATH'}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' }}>
            <div>
              <span style={{ color: '#9ca3af' }}>Distance:</span>{' '}
              <strong className="font-mono" style={{ color: '#f9fafb' }}>
                {routeResult.total_distance_km ? `${routeResult.total_distance_km} km` : 'N/A'}
              </strong>
            </div>
            <div>
              <span style={{ color: '#9ca3af' }}>Est. Transit:</span>{' '}
              <strong className="font-mono" style={{ color: '#f9fafb' }}>
                {routeResult.estimated_travel_time_min ? `${routeResult.estimated_travel_time_min} mins` : 'N/A'}
              </strong>
            </div>
            <div>
              <span style={{ color: '#9ca3af' }}>Flooded Avoided:</span>{' '}
              <strong className="font-mono" style={{ color: '#10b981' }}>
                {routeResult.hazard_nodes_avoided !== undefined ? routeResult.hazard_nodes_avoided : 0} nodes
              </strong>
            </div>
            <div>
              <span style={{ color: '#9ca3af' }}>Max Path Depth:</span>{' '}
              <strong className="font-mono" style={{ color: '#06b6d4' }}>
                {routeResult.max_depth_on_path_m !== undefined ? `${routeResult.max_depth_on_path_m} m` : '0.00 m'}
              </strong>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
